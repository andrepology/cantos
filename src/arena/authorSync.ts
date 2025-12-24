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
 * Ensure the author has a channels list (create if missing).
 */
function ensureChannels(author: LoadedArenaAuthor): void {
  if (author.channels?.$isLoaded) return
  const owner = author.$jazz.owner as Group | undefined
  author.$jazz.set('channels', co.list(ArenaChannelConnection).create([], owner ? { owner } : undefined))
}

function ensureChannelsFetchedPages(author: LoadedArenaAuthor): void {
  if (author.channelsFetchedPages?.$isLoaded) return
  const owner = author.$jazz.owner as Group | undefined
  author.$jazz.set('channelsFetchedPages', co.list(z.number()).create([], owner ? { owner } : undefined))
}

function resetChannelsPaging(author: LoadedArenaAuthor): void {
  ensureChannels(author)
  ensureChannelsFetchedPages(author)
  if (author.channels?.$isLoaded) {
    author.channels.$jazz.splice(0, author.channels.length)
  }
  if (author.channelsFetchedPages?.$isLoaded) {
    author.channelsFetchedPages.$jazz.splice(0, author.channelsFetchedPages.length)
  }
  author.$jazz.set('channelsHasMore', true)
  author.$jazz.set('channelsLastFetchedAt', undefined)
  author.$jazz.set('channelsError', undefined)
}

function computeExpectedTotalPages(author: LoadedArenaAuthor, per: number, apiTotal?: number): number | null {
  const count = author.channelCount
  const fromCount = (typeof count === 'number' && Number.isFinite(count))
    ? Math.max(1, Math.ceil(count / per))
    : null
  if (typeof apiTotal !== 'number' || !Number.isFinite(apiTotal)) return fromCount
  if (fromCount === null) return Math.max(1, Math.floor(apiTotal))
  return Math.max(fromCount, Math.floor(apiTotal))
}

function getNextPage(author: LoadedArenaAuthor, expectedTotalPages: number | null): number {
  const pages = author.channelsFetchedPages
  if (!pages?.$isLoaded || pages.length === 0) return 1
  const pageSet = new Set<number>()
  for (const p of pages) {
    if (typeof p === 'number') pageSet.add(p)
  }
  if (expectedTotalPages !== null) {
    for (let p = 1; p <= expectedTotalPages; p += 1) {
      if (!pageSet.has(p)) return p
    }
    return expectedTotalPages + 1
  }
  return Math.max(...pageSet) + 1
}

function buildExistingChannelIds(author: LoadedArenaAuthor): Set<number> {
  const ids = new Set<number>()
  if (!author.channels?.$isLoaded) return ids
  for (let i = 0; i < author.channels.length; i += 1) {
    const channel = author.channels[i]
    if (channel?.$isLoaded && typeof channel.id === 'number') {
      ids.add(channel.id)
    }
  }
  return ids
}

function normalizeConnections(
  resp: Awaited<ReturnType<typeof fetchUserChannelsPage>>,
  owner: Group | undefined
): Array<ReturnType<typeof ArenaChannelConnection.create>> {
  const channels = Array.isArray(resp.channels) ? resp.channels : []
  return channels.map((c) => {
    const author = toArenaAuthor(c.user)
    const description = c.metadata?.description ?? undefined
    return ArenaChannelConnection.create(
      {
        id: c.id,
        slug: c.slug,
        title: c.title,
        length: c.length,
        addedToAt: c.added_to_at,
        updatedAt: c.updated_at,
        published: c.published,
        open: c.open,
        followerCount: c.follower_count,
        description,
        author,
      },
      owner ? { owner } : undefined
    )
  })
}

function shouldSyncAuthorChannels(author: LoadedArenaAuthor, force: boolean): boolean {
  if (force) return true
  if (author.channelsHasMore === true) return true
  return shouldSyncConnections(author.channelsLastFetchedAt, MAX_AGE_MS, false)
}

async function syncAuthorChannelsIncremental(
  author: LoadedArenaAuthor,
  userId: number,
  opts: { force: boolean; signal?: AbortSignal }
): Promise<void> {
  const { force, signal } = opts
  const loadedAuthor = await author.$jazz.ensureLoaded({
    resolve: { channels: true, channelsFetchedPages: true },
  }) as LoadedArenaAuthor

  ensureChannels(loadedAuthor)
  ensureChannelsFetchedPages(loadedAuthor)

  if (force || shouldSyncConnections(loadedAuthor.channelsLastFetchedAt, MAX_AGE_MS, false)) {
    if (!loadedAuthor.channelsHasMore) {
      resetChannelsPaging(loadedAuthor)
    }
  }

  if ((loadedAuthor.channelCount ?? 0) === 0) {
    loadedAuthor.$jazz.set('channelsHasMore', false)
    loadedAuthor.$jazz.set('channelsLastFetchedAt', Date.now())
    return
  }

  let expectedTotalPages = computeExpectedTotalPages(loadedAuthor, CHANNELS_PER)
  let page = getNextPage(loadedAuthor, expectedTotalPages)

  if (expectedTotalPages !== null && page > expectedTotalPages) {
    loadedAuthor.$jazz.set('channelsHasMore', false)
    loadedAuthor.$jazz.set('channelsLastFetchedAt', Date.now())
    return
  }

  const existingIds = buildExistingChannelIds(loadedAuthor)

  try {
    while (true) {
      if (signal?.aborted) return
      if (expectedTotalPages !== null && page > expectedTotalPages) {
        loadedAuthor.$jazz.set('channelsHasMore', false)
        loadedAuthor.$jazz.set('channelsLastFetchedAt', Date.now())
        return
      }

      const fetchedPages = loadedAuthor.channelsFetchedPages
      if (fetchedPages?.$isLoaded && fetchedPages.some((p) => p === page)) {
        page += 1
        continue
      }

    const resp = await fetchUserChannelsPage(userId, page, CHANNELS_PER, { signal })
    console.log('[authorSync] channels page', {
      userId,
      page,
      per: CHANNELS_PER,
      apiTotalPages: resp.total_pages,
      apiChannelCount: Array.isArray(resp.channels) ? resp.channels.length : 0,
      authorChannelCount: loadedAuthor.channelCount,
    })
      expectedTotalPages = computeExpectedTotalPages(loadedAuthor, CHANNELS_PER, resp.total_pages)

      const normalized = normalizeConnections(resp, loadedAuthor.$jazz.owner as Group | undefined)
      const toAppend = normalized.filter((c) => {
        const id = c.id
        if (typeof id !== 'number') return false
        return !existingIds.has(id)
      })

      if (toAppend.length > 0 && loadedAuthor.channels?.$isLoaded) {
        loadedAuthor.channels.$jazz.splice(loadedAuthor.channels.length, 0, ...toAppend)
        for (const conn of toAppend) {
          if (typeof conn.id === 'number') {
            existingIds.add(conn.id)
          }
        }
      }

      if (fetchedPages?.$isLoaded) {
        fetchedPages.$jazz.push(page)
      }

      const hasMore = expectedTotalPages !== null ? page < expectedTotalPages : page < resp.total_pages
      loadedAuthor.$jazz.set('channelsHasMore', hasMore)
      loadedAuthor.$jazz.set('channelsError', undefined)

      if (!hasMore) {
        loadedAuthor.$jazz.set('channelsLastFetchedAt', Date.now())
        return
      }

      page += 1
    }
  } catch (err) {
    if (signal?.aborted) return
    const msg = err instanceof Error ? err.message : 'Author channels sync failed'
    loadedAuthor.$jazz.set('channelsError', msg)
    loadedAuthor.$jazz.set('channelsHasMore', false)
    loadedAuthor.$jazz.set('channelsLastFetchedAt', Date.now())
  }
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
    const authorsRecord = cache.authors as unknown as Record<string, LoadedArenaAuthor | undefined> & {
      $jazz: { set: (key: string, value: ReturnType<typeof ArenaAuthor.create>) => void }
    }

    let author = authorsRecord[String(userId)]
    const owner = cache.$jazz.owner as Group | undefined
    let loadedAuthor: LoadedArenaAuthor | null = null

    if (author && !author.$isLoaded) {
      loadedAuthor = await author.$jazz.ensureLoaded({
        resolve: { channels: true, channelsFetchedPages: true },
      }) as LoadedArenaAuthor
      author = loadedAuthor
    }

    const shouldSyncProfile =
      force || !author || shouldSyncConnections(author?.lastFetchedAt, MAX_AGE_MS, false)

    if (author && author.$isLoaded && !shouldSyncProfile && !shouldSyncAuthorChannels(author, false)) {
      return author
    }

    let mapped: ReturnType<typeof mapUserDetails> | null = null
    if (shouldSyncProfile) {
      const details = await fetchUserDetails(userId, { signal })
      if (signal?.aborted) return null
      mapped = mapUserDetails(details)
    }

    if (!author || !author.$isLoaded) {
      const created = ArenaAuthor.create(
        {
          id: userId,
          ...(mapped ?? {}),
        },
        owner ? { owner } : undefined
      )
      authorsRecord.$jazz.set(String(userId), created)
      author = created as LoadedArenaAuthor
    } else if (mapped) {
      author.$jazz.set('username', mapped.username)
      if (mapped.fullName) author.$jazz.set('fullName', mapped.fullName)
      if (mapped.avatarThumb) author.$jazz.set('avatarThumb', mapped.avatarThumb)
      if (mapped.bio) author.$jazz.set('bio', mapped.bio)
      if (mapped.followerCount !== undefined) author.$jazz.set('followerCount', mapped.followerCount)
      if (mapped.followingCount !== undefined) author.$jazz.set('followingCount', mapped.followingCount)
      if (mapped.channelCount !== undefined) author.$jazz.set('channelCount', mapped.channelCount)
    }

    if (mapped) {
      author.$jazz.set('lastFetchedAt', Date.now())
      author.$jazz.set('error', undefined)
    }

    loadedAuthor = await author.$jazz.ensureLoaded({
      resolve: { channels: true, channelsFetchedPages: true },
    }) as LoadedArenaAuthor
    ensureChannels(loadedAuthor)
    ensureChannelsFetchedPages(loadedAuthor)

    if (signal?.aborted) return loadedAuthor

    if (shouldSyncAuthorChannels(loadedAuthor, force)) {
      await syncAuthorChannelsIncremental(loadedAuthor, userId, { force, signal })
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
        author.$jazz.set('channelsError', msg)
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
