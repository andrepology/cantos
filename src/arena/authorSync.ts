/**
 * Arena author/user sync (Are.na → Jazz CoValues).
 * 
 * Syncs user profile metadata and their channel list to ArenaAuthor in the global registry.
 * Uses the shared syncConnectionList utility for paginated channel fetching.
 */

import { co, type Group } from 'jazz-tools'
import {
  ArenaAuthor,
  ArenaChannelConnection,
  type LoadedArenaAuthor,
  type LoadedArenaCache,
} from '../jazz/schema'
import { fetchUserDetails, fetchUserChannelsPage, type ArenaUserDetails } from './arenaClient'
import { syncConnectionList, shouldSyncConnections, type LoadedConnectionList } from './utils/syncConnectionList'

const CHANNELS_PER = 50
const MAX_AGE_MS = 60 * 60 * 1000 // 1 hour

const inflightSync = new Map<number, Promise<LoadedArenaAuthor | null>>()

/**
 * Ensure the author has a channels list (create if missing).
 */
function ensureChannels(author: LoadedArenaAuthor): void {
  if (author.channels?.$isLoaded) return
  const owner = author.$jazz.owner as Group | undefined
  author.$jazz.set('channels', co.list(ArenaChannelConnection).create([], owner ? { owner } : undefined))
}

/**
 * Map API user details to ArenaAuthor fields.
 */
function mapUserDetails(details: ArenaUserDetails): {
  username: string
  fullName?: string
  avatarThumb?: string
  bio?: string
  followerCount?: number
  followingCount?: number
  channelCount?: number
} {
  const avatarThumb = 
    details.avatar_image?.thumb ?? 
    (typeof details.avatar === 'string' ? details.avatar : undefined)

  // Build full name from available fields
  const computedFullName = `${details.first_name ?? ''} ${details.last_name ?? ''}`.trim()
  const fullName = details.full_name ?? (computedFullName || undefined)

  return {
    username: details.username,
    fullName,
    avatarThumb,
    bio: details.metadata?.description ?? undefined,
    followerCount: details.follower_count,
    followingCount: details.following_count,
    channelCount: details.channel_count,
  }
}

/**
 * Sync an author's profile and channel list from Arena to Jazz.
 * 
 * Uses the global authors registry (cache.authors) for O(1) lookup/storage.
 * Creates the author entry if it doesn't exist.
 * 
 * @param cache - The loaded ArenaCache with authors registry
 * @param userId - Arena user ID
 * @param opts - Options including force refresh and abort signal
 */
export async function syncAuthor(
  cache: LoadedArenaCache,
  userId: number,
  opts: { force?: boolean; signal?: AbortSignal } = {}
): Promise<LoadedArenaAuthor | null> {
  const { force = false, signal } = opts
  
  // Check for inflight sync
  const existing = inflightSync.get(userId)
  if (existing) {
    await existing
    // Return the author from cache after inflight completes
    const authorsRecord = cache.authors as unknown as Record<string, LoadedArenaAuthor | undefined>
    return authorsRecord[String(userId)] ?? null
  }

  const promise = (async (): Promise<LoadedArenaAuthor | null> => {
    // Type-cast authors registry for key access
    const authorsRecord = cache.authors as unknown as Record<string, LoadedArenaAuthor | undefined> & {
      $jazz: { set: (key: string, value: ReturnType<typeof ArenaAuthor.create>) => void }
    }
    
    // Check if author exists in global registry
    let author = authorsRecord[String(userId)]
    
    // Check if we should sync (age-based)
    const shouldSync = force || !author || shouldSyncConnections(author?.lastFetchedAt, MAX_AGE_MS, force)
    
    if (!shouldSync && author?.$isLoaded) {
      return author
    }

    // Fetch profile details from Arena
    const details = await fetchUserDetails(userId, { signal })
    if (signal?.aborted) return null
    
    const mapped = mapUserDetails(details)
    const owner = cache.$jazz.owner as Group | undefined

    if (!author || !author.$isLoaded) {
      // Create new author in global registry
      const created = ArenaAuthor.create(
        {
          id: userId,
          ...mapped,
        },
        owner ? { owner } : undefined
      )
      authorsRecord.$jazz.set(String(userId), created)
      author = created as LoadedArenaAuthor
    } else {
      // Update existing author's profile fields
      author.$jazz.set('username', mapped.username)
      if (mapped.fullName) author.$jazz.set('fullName', mapped.fullName)
      if (mapped.avatarThumb) author.$jazz.set('avatarThumb', mapped.avatarThumb)
      if (mapped.bio) author.$jazz.set('bio', mapped.bio)
      if (mapped.followerCount !== undefined) author.$jazz.set('followerCount', mapped.followerCount)
      if (mapped.followingCount !== undefined) author.$jazz.set('followingCount', mapped.followingCount)
      if (mapped.channelCount !== undefined) author.$jazz.set('channelCount', mapped.channelCount)
    }

    // Ensure channels list exists
    const loadedAuthor = await author.$jazz.ensureLoaded({ resolve: { channels: true } }) as LoadedArenaAuthor
    ensureChannels(loadedAuthor)

    if (signal?.aborted) return loadedAuthor

    // Sync channels using shared utility
    if (loadedAuthor.channels?.$isLoaded) {
      await syncConnectionList(
        {
          connections: loadedAuthor.channels as LoadedConnectionList,
          owner: loadedAuthor.$jazz.owner as Group | undefined,
          setLastFetched: (ts) => loadedAuthor.$jazz.set('lastFetchedAt', ts),
          setError: (err) => loadedAuthor.$jazz.set('error', err),
        },
        (page, per, sig) => fetchUserChannelsPage(userId, page, per, { signal: sig }),
        { per: CHANNELS_PER, signal }
      )
    }

    return loadedAuthor
  })()
    .catch((err) => {
      console.error(`[authorSync] Error syncing author ${userId}:`, err)
      // Try to set error on author if it exists
      const authorsRecord = cache.authors as unknown as Record<string, LoadedArenaAuthor | undefined>
      const author = authorsRecord[String(userId)]
      if (author?.$isLoaded) {
        const msg = err instanceof Error ? err.message : 'Author sync failed'
        author.$jazz.set('error', msg)
      }
      return null
    })
    .finally(() => {
      inflightSync.delete(userId)
    })

  inflightSync.set(userId, promise)
  return promise
}

/**
 * Get an author from the cache, syncing if needed.
 * Convenience wrapper that handles the common pattern.
 */
export async function getOrSyncAuthor(
  cache: LoadedArenaCache,
  userId: number,
  opts: { signal?: AbortSignal } = {}
): Promise<LoadedArenaAuthor | null> {
  // Check cache first
  const authorsRecord = cache.authors as unknown as Record<string, LoadedArenaAuthor | undefined>
  const existing = authorsRecord[String(userId)]
  
  if (existing?.$isLoaded && !shouldSyncConnections(existing.lastFetchedAt, MAX_AGE_MS, false)) {
    return existing
  }
  
  // Sync and return
  return syncAuthor(cache, userId, opts)
}

