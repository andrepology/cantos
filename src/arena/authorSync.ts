/**
 * Arena author/user sync (Are.na → Jazz CoValues).
 * 
 * Syncs user profile metadata and their channel list to ArenaAuthor in the global registry.
 * Uses incremental channel fetching so the UI can render quickly while auto-fetching the rest.
 */

import { co, z, type Group } from 'jazz-tools'
import {
  ArenaAuthor,
  ArenaChannelConnection,
  type LoadedArenaAuthor,
  type LoadedArenaCache,
} from '../jazz/schema'
import { fetchUserDetails, fetchUserChannelsPage, toArenaAuthor, type ArenaUserDetails } from './arenaClient'
import { shouldSyncConnections } from './utils/syncConnectionList'

const CHANNELS_PER = 10
const MAX_AGE_MS = 60 * 60 * 1000 // 1 hour

const inflightSync = new Map<number, Promise<LoadedArenaAuthor | null>>()

/**
 * Map API user details to ArenaAuthor fields.
 */
function mapUserDetails(details: ArenaUserDetails) {
  const avatarThumb = details.avatar_image?.thumb ?? (typeof details.avatar === 'string' ? details.avatar : undefined)
  const avatarDisplay = details.avatar_image?.display
  
  const computedFullName = `${details.first_name ?? ''} ${details.last_name ?? ''}`.trim()
  const fullName = details.full_name ?? (computedFullName || undefined)

  return {
    username: details.username,
    fullName,
    avatarThumb,
    avatarDisplay,
    bio: details.metadata?.description ?? undefined,
    followerCount: details.follower_count,
    followingCount: details.following_count,
    channelCount: details.channel_count,
  }
}

/**
 * Incremental fetch for author channels.
 */
async function syncAuthorChannels(
  author: LoadedArenaAuthor,
  userId: number,
  signal?: AbortSignal
): Promise<void> {
  const owner = author.$jazz.owner as Group | undefined
  
  // 1. Initialize collections if missing
  if (!author.channels?.$isLoaded) {
    author.$jazz.set('channels', co.list(ArenaChannelConnection).create([], owner ? { owner } : undefined))
  }
  if (!author.channelsFetchedPages?.$isLoaded) {
    author.$jazz.set('channelsFetchedPages', co.list(z.number()).create([], owner ? { owner } : undefined))
  }

  // Reload to ensure we have the newly created lists
  const loaded = await author.$jazz.ensureLoaded({
    resolve: { channels: true, channelsFetchedPages: true }
  }) as LoadedArenaAuthor

  const channels = loaded.channels!
  const fetchedPages = loaded.channelsFetchedPages!

  // 2. Loop until no more pages
  let page = 1
  // Use precise type for the fully loaded author
  type LoadedWithChannels = co.loaded<typeof ArenaAuthor, { channels: true; channelsFetchedPages: true }>
  const fullAuthor = loaded as LoadedWithChannels

  const channelsList = fullAuthor.channels
  const pagesList = fullAuthor.channelsFetchedPages

  if (!channelsList || !pagesList) return

  let totalPages = Math.ceil((fullAuthor.channelCount ?? 0) / CHANNELS_PER) || 1
  
  // Create Set of existing IDs to avoid duplicates
  // CoList is iterable, so we can use Array.from or spread, but .map is also available on loaded CoList
  const existingIds = new Set(
    [...channelsList]
      .map(c => (c && c.$isLoaded ? c.id : null))
      .filter((id): id is number => typeof id === 'number')
  )

  while (page <= totalPages) {
    if (signal?.aborted) return
    
    // Skip if already fetched
    if ([...pagesList].includes(page)) {
      page++
      continue
    }

    try {
      const resp = await fetchUserChannelsPage(userId, page, CHANNELS_PER, { signal })
      totalPages = resp.total_pages
      
      const toAppend = (resp.channels || [])
        .filter(c => !existingIds.has(c.id))
        .map(c => ArenaChannelConnection.create({
          id: c.id,
          slug: c.slug,
          title: c.title,
          length: c.length,
          addedToAt: c.added_to_at,
          updatedAt: c.updated_at,
          published: c.published,
          open: c.open,
          followerCount: c.follower_count,
          description: c.metadata?.description ?? undefined,
          author: toArenaAuthor(c.user),
        }, owner ? { owner } : undefined))

      if (toAppend.length > 0) {
        channelsList.$jazz.push(...toAppend)
        toAppend.forEach(c => existingIds.add(c.id))
      }
      
      pagesList.$jazz.push(page)
      author.$jazz.set('channelsHasMore', page < totalPages)
      author.$jazz.set('channelsLastFetchedAt', Date.now())
      
      page++
    } catch (err) {
      console.error('[authorSync] Page fetch failed:', err)
      author.$jazz.set('channelsError', err instanceof Error ? err.message : 'Failed to fetch page')
      break
    }
  }
}

/**
 * Sync an author's profile and channel list from Arena to Jazz.
 */
export async function syncAuthor(
  cache: LoadedArenaCache,
  userId: number,
  opts: { force?: boolean; signal?: AbortSignal } = {}
): Promise<LoadedArenaAuthor | null> {
  const { force = false, signal } = opts
  
  // Dedupe in-flight requests
  const inflight = inflightSync.get(userId)
  if (inflight) return inflight

  const syncPromise = (async (): Promise<LoadedArenaAuthor | null> => {
    try {
      const authorsRecord = cache.authors as unknown as Record<string, LoadedArenaAuthor | undefined> & {
        $jazz: { set: (key: string, value: ReturnType<typeof ArenaAuthor.create>) => void }
      }

      let author = authorsRecord[String(userId)]
      
      // Load or create author
      if (!author?.$isLoaded) {
        if (author) {
          author = await author.$jazz.ensureLoaded({ resolve: { channels: true, channelsFetchedPages: true } }) as LoadedArenaAuthor
        } else {
          const created = ArenaAuthor.create({ id: userId }, cache.$jazz.owner as Group | undefined)
          authorsRecord.$jazz.set(String(userId), created)
          author = created as LoadedArenaAuthor
        }
      }

      // Check if sync is needed
      const needsProfileSync = force || shouldSyncConnections(author.lastFetchedAt, MAX_AGE_MS, false)
      const needsChannelSync = force || author.channelsHasMore || shouldSyncConnections(author.channelsLastFetchedAt, MAX_AGE_MS, false)

      if (!needsProfileSync && !needsChannelSync) return author

      // 1. Profile Sync
      if (needsProfileSync) {
        const details = await fetchUserDetails(userId, { signal })
        const patch = mapUserDetails(details)
        
        // Atomic-ish update
        Object.entries(patch).forEach(([key, val]) => {
          if (val !== undefined) author!.$jazz.set(key as any, val)
        })
        author.$jazz.set('lastFetchedAt', Date.now())
        author.$jazz.set('error', undefined)
      }

      // 2. Channel Sync (Incremental)
      if (needsChannelSync) {
        if (force) {
          // Reset paging state on forced refresh
          if (author.channels?.$isLoaded) author.channels.$jazz.splice(0, author.channels.length)
          if (author.channelsFetchedPages?.$isLoaded) author.channelsFetchedPages.$jazz.splice(0, author.channelsFetchedPages.length)
          author.$jazz.set('channelsHasMore', true)
        }
        await syncAuthorChannels(author, userId, signal)
      }

      return author
    } catch (err) {
      console.error(`[authorSync] Error syncing author ${userId}:`, err)
      const authorsRecord = cache.authors as unknown as Record<string, LoadedArenaAuthor | undefined>
      const author = authorsRecord[String(userId)]
      if (author?.$isLoaded) {
        author.$jazz.set('error', err instanceof Error ? err.message : 'Sync failed')
      }
      return null
    } finally {
      inflightSync.delete(userId)
    }
  })()

  inflightSync.set(userId, syncPromise)
  return syncPromise
}

/**
 * Get an author from the cache, syncing if needed.
 */
export async function getOrSyncAuthor(
  cache: LoadedArenaCache,
  userId: number,
  opts: { signal?: AbortSignal } = {}
): Promise<LoadedArenaAuthor | null> {
  const authorsRecord = cache.authors as unknown as Record<string, LoadedArenaAuthor | undefined>
  const existing = authorsRecord[String(userId)]
  
  if (existing?.$isLoaded && !shouldSyncConnections(existing.lastFetchedAt, MAX_AGE_MS, false)) {
    return existing
  }
  
  return syncAuthor(cache, userId, opts)
}
