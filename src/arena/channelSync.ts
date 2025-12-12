/**
 * Arena channel sync (Are.na → Jazz CoValues).
 *
 * Rules:
 * - `/v2/channels/:slug` is the sole metadata authority.
 * - `/v2/channels/:slug/contents` is blocks + pagination only.
 */

import { co, z } from 'jazz-tools'
import {
  ArenaBlock,
  ArenaChannel,
  ArenaChannelConnection,
  type LoadedArenaCache,
  type LoadedArenaChannel,
} from '../jazz/schema'
import {
  fetchChannelConnectionsPage,
  fetchChannelContentsPage,
  fetchChannelDetails,
  toArenaAuthor,
} from './arenaClient'
import type { ArenaBlock as ArenaAPIBlock, ArenaChannelListResponse, ArenaChannelResponse } from './types'

const DEFAULT_PER = 50
const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000 // 5 minutes
const CONNECTIONS_PER = 50
const CONNECTIONS_MAX_AGE_MS = 60 * 60 * 1000 // 1 hour

// Heuristic aspect ratios by block type (used until measured in UI).
const HEURISTIC_ASPECTS: Record<string, number> = {
  image: 4 / 3,
  media: 16 / 9,
  pdf: 0.77,
  link: 1.6,
  text: 0.83,
  channel: 1.0,
}

type BlockType = 'image' | 'text' | 'link' | 'media' | 'pdf' | 'channel'

function mapBlockType(raw: ArenaAPIBlock): BlockType {
  if (raw.attachment?.content_type?.startsWith('video/')) return 'media'
  if (raw.attachment?.content_type === 'application/pdf') return 'pdf'

  switch (raw.class) {
    case 'Image':
      return 'image'
    case 'Text':
      return 'text'
    case 'Link':
      return 'link'
    case 'Media':
      return 'media'
    case 'Channel':
      return 'channel'
    default:
      return 'text'
  }
}

function normalizeBlock(raw: ArenaAPIBlock): {
  blockId: string
  arenaId: number
  type: BlockType
  title?: string
  createdAt?: string
  description?: string
  content?: string
  url?: string
  originalUrl?: string
  thumbnailUrl?: string
  embedHtml?: string
  provider?: string
  channelSlug?: string
  length?: number
  aspect: number
  aspectSource: 'heuristic' | 'measured'
  user?: {
    id: number
    username?: string
    fullName?: string
    avatarThumb?: string
  }
} {
  const type = mapBlockType(raw)
  const aspect = HEURISTIC_ASPECTS[type] ?? 1

  const user = raw.user
    ? {
        id: raw.user.id,
        username: raw.user.username,
        fullName: raw.user.full_name,
        avatarThumb: raw.user.avatar_image?.thumb ?? (raw.user.avatar as string) ?? undefined,
      }
    : undefined

  const base = {
    blockId: String(raw.id),
    arenaId: raw.id,
    type,
    title: raw.title ?? undefined,
    createdAt: raw.created_at,
    description: raw.description ?? undefined,
    aspect,
    aspectSource: 'heuristic' as const,
    user,
  }

  switch (type) {
    case 'image':
      return { ...base, url: raw.image?.display?.url ?? raw.image?.original?.url }
    case 'text':
      return { ...base, content: raw.content ?? raw.title ?? '' }
    case 'link':
      return {
        ...base,
        url: raw.source?.url,
        thumbnailUrl: raw.image?.display?.url,
        provider: raw.source?.provider?.name,
      }
    case 'media':
      return {
        ...base,
        embedHtml: raw.embed?.html ?? '',
        thumbnailUrl: raw.image?.display?.url,
        provider: raw.source?.provider?.name,
        originalUrl: raw.source?.url ?? raw.attachment?.url,
      }
    case 'pdf':
      return { ...base, url: raw.attachment?.url, thumbnailUrl: raw.image?.display?.url }
    case 'channel':
      return { ...base, channelSlug: (raw as any).slug, length: (raw as any).length ?? 0 }
  }
}

function computeTotalPages(length: number | undefined, per: number): number | null {
  if (typeof length !== 'number' || !Number.isFinite(length) || length < 0) return null
  return Math.max(1, Math.ceil(length / per))
}

function getHighestFetchedPage(channel: LoadedArenaChannel): number {
  const pages = channel.fetchedPages
  if (!pages || pages.length === 0) return 0
  return Math.max(...pages.map(p => p ?? 0))
}

function hasPage(channel: LoadedArenaChannel, page: number): boolean {
  const pages = channel.fetchedPages
  if (!pages) return false
  return pages.some(p => p === page)
}

function ensureFetchedPages(channel: LoadedArenaChannel): void {
  if (channel.fetchedPages) return
  channel.$jazz.set('fetchedPages', co.list(z.number()).create([]))
}

function ensureBlocks(channel: LoadedArenaChannel): asserts channel is LoadedArenaChannel & { blocks: NonNullable<LoadedArenaChannel['blocks']> } {
  // Schema requires blocks, but older/malformed data might not have it loaded.
  if (channel.blocks) return
  channel.$jazz.set('blocks', co.list(ArenaBlock).create([]))
}

function ensureConnections(channel: LoadedArenaChannel): void {
  if (channel.connections) return
  channel.$jazz.set('connections', co.list(ArenaChannelConnection).create([]))
}

function updateHasMoreFromLength(channel: LoadedArenaChannel, per: number): void {
  const totalPages = computeTotalPages(channel.length, per)
  if (totalPages === null) return
  const highestFetched = getHighestFetchedPage(channel)
  channel.$jazz.set('hasMore', highestFetched < totalPages)
}

export function isStale(channel: LoadedArenaChannel | null | undefined, maxAgeMs = DEFAULT_MAX_AGE_MS): boolean {
  if (!channel) return true
  if (channel.lastFetchedAt === undefined || channel.lastFetchedAt === null) return true
  return Date.now() - channel.lastFetchedAt > maxAgeMs
}

function ensureChannel(cache: LoadedArenaCache, slug: string): LoadedArenaChannel {
  let channel = cache.channels?.find(c => c?.slug === slug) as LoadedArenaChannel | undefined
  if (!channel) {
    channel = ArenaChannel.create({
      slug,
      blocks: co.list(ArenaBlock).create([]),
      fetchedPages: co.list(z.number()).create([]),
      hasMore: true,
    }) as LoadedArenaChannel
    cache.channels?.$jazz.push(channel)
    return channel
  }

  ensureBlocks(channel)
  ensureFetchedPages(channel)

  if (channel.hasMore === undefined || channel.hasMore === null) {
    updateHasMoreFromLength(channel, DEFAULT_PER)
    if (channel.hasMore === undefined || channel.hasMore === null) {
      channel.$jazz.set('hasMore', true)
    }
  }

  return channel
}

function resetPagingState(channel: LoadedArenaChannel): void {
  ensureBlocks(channel)
  ensureFetchedPages(channel)

  channel.blocks.$jazz.splice(0, channel.blocks.length)
  channel.fetchedPages?.$jazz.splice(0, channel.fetchedPages.length)
  channel.$jazz.set('hasMore', true)
  channel.$jazz.set('lastFetchedAt', undefined)
  channel.$jazz.set('error', undefined)
}

type SyncMetadataOptions = { force: boolean; signal?: AbortSignal }

const inflightMeta = new Map<string, Promise<void>>()
const inflightConnections = new Map<string, Promise<void>>()

function shouldSyncConnections(channel: LoadedArenaChannel, force: boolean): boolean {
  if (force) return true
  const last = channel.connectionsLastFetchedAt
  if (typeof last !== 'number') return true
  return Date.now() - last > CONNECTIONS_MAX_AGE_MS
}

function normalizeConnections(resp: ArenaChannelListResponse) {
  const channels = Array.isArray(resp.channels) ? resp.channels : []
  return channels.map((c) => {
    const author = toArenaAuthor(c.user)
    const description = c.metadata?.description ?? undefined
    return ArenaChannelConnection.create({
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
    })
  })
}

async function syncConnections(
  channel: LoadedArenaChannel,
  channelId: number,
  opts: { force: boolean; signal?: AbortSignal }
): Promise<void> {
  const { force, signal } = opts
  if (!shouldSyncConnections(channel, force)) return

  const key = String(channelId)
  const existing = inflightConnections.get(key)
  if (existing) return existing

  const promise = (async () => {
    ensureConnections(channel)

    const all: Array<ReturnType<(typeof ArenaChannelConnection)['create']>> = []
    let page = 1
    let totalPages = 1

    while (page <= totalPages) {
      const resp = await fetchChannelConnectionsPage(channelId, page, CONNECTIONS_PER, { signal })
      totalPages = Math.max(1, Number(resp.total_pages ?? 1))
      all.push(...normalizeConnections(resp))
      page += 1
    }

    channel.connections?.$jazz.splice(0, channel.connections.length, ...all)
    channel.$jazz.set('connectionsLastFetchedAt', Date.now())
    channel.$jazz.set('connectionsError', undefined)
  })()
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Arena connections fetch failed'
      channel.$jazz.set('connectionsError', msg)
      throw err
    })
    .finally(() => {
      inflightConnections.delete(key)
    })

  inflightConnections.set(key, promise)
  return promise
}

async function syncMetadata(channel: LoadedArenaChannel, slug: string, opts: SyncMetadataOptions): Promise<void> {
  const { force, signal } = opts

  const existing = inflightMeta.get(slug)
  if (existing) return existing

  const promise = (async () => {
    const needsDetails =
      force ||
      channel.channelId === undefined ||
      channel.title === undefined ||
      channel.createdAt === undefined ||
      channel.updatedAt === undefined ||
      channel.length === undefined ||
      channel.author === undefined ||
      channel.description === undefined

    let channelIdNum: number | null = null

    if (needsDetails) {
      const details = await fetchChannelDetails(slug, { signal })
      channel.$jazz.set('channelId', String(details.id))
      channel.$jazz.set('title', details.title)
      channel.$jazz.set('description', details.description ?? undefined)
      channel.$jazz.set('createdAt', details.created_at)
      channel.$jazz.set('updatedAt', details.updated_at)
      channel.$jazz.set('length', details.length)
      channel.$jazz.set('author', toArenaAuthor(details.user))
      channel.$jazz.set('error', undefined)
      channelIdNum = details.id
    } else {
      const parsed = Number(channel.channelId)
      if (Number.isFinite(parsed)) {
        channelIdNum = parsed
      } else {
        const details = await fetchChannelDetails(slug, { signal })
        channel.$jazz.set('channelId', String(details.id))
        channel.$jazz.set('title', details.title)
        channel.$jazz.set('description', details.description ?? undefined)
        channel.$jazz.set('createdAt', details.created_at)
        channel.$jazz.set('updatedAt', details.updated_at)
        channel.$jazz.set('length', details.length)
        channel.$jazz.set('author', toArenaAuthor(details.user))
        channel.$jazz.set('error', undefined)
        channelIdNum = details.id
      }
    }

    if (channelIdNum !== null) {
      await syncConnections(channel, channelIdNum, { force, signal })
    }
  })().finally(() => {
    inflightMeta.delete(slug)
  })

  inflightMeta.set(slug, promise)
  return promise
}

function computeHasMore(params: {
  totalPages: number | null
  json: ArenaChannelResponse
  per: number
  page: number
  addedCount: number
}): boolean {
  const { totalPages, json, per, page, addedCount } = params

  if (totalPages !== null) return page < totalPages

  if (typeof json.current_page === 'number' && typeof json.total_pages === 'number') {
    return json.current_page < json.total_pages
  }

  const next = json.pagination?.next
  if (typeof next === 'string') return next.length > 0

  const contentsLen = Array.isArray(json.contents) ? json.contents.length : 0
  if (contentsLen === 0) return false
  if (addedCount === 0) return false
  return contentsLen === per
}

type SyncNextPageOptions = { per: number; signal?: AbortSignal }

const inflightPages = new Map<string, Promise<boolean>>()

async function syncNextPage(channel: LoadedArenaChannel, slug: string, opts: SyncNextPageOptions): Promise<boolean> {
  const { per, signal } = opts
  if (channel.hasMore === false) return false

  ensureBlocks(channel)
  ensureFetchedPages(channel)

  const nextPage = getHighestFetchedPage(channel) + 1
  if (hasPage(channel, nextPage) && !isStale(channel)) return false

  const totalPages = computeTotalPages(channel.length, per)
  if (totalPages !== null && nextPage > totalPages) {
    channel.$jazz.set('hasMore', false)
    return false
  }

  const inflightKey = `${slug}:${nextPage}:${per}`
  const existing = inflightPages.get(inflightKey)
  if (existing) return existing

  const promise = (async () => {
    const json = await fetchChannelContentsPage(slug, nextPage, per, { signal })
    const raw = json.contents ?? []
    const blockCoValues = raw.map(normalizeBlock).map(data => ArenaBlock.create(data))

    let addedCount = 0

    if (nextPage === 1) {
      channel.blocks.$jazz.splice(0, channel.blocks.length, ...blockCoValues)
      addedCount = blockCoValues.length
      channel.fetchedPages?.$jazz.splice(0, channel.fetchedPages.length, 1)
    } else {
      const existingIds = new Set<string>()
      for (const b of channel.blocks ?? []) {
        const id = b?.blockId
        if (typeof id === 'string') existingIds.add(id)
      }

      const toAppend = blockCoValues.filter(b => !existingIds.has(b.blockId))
      addedCount = toAppend.length
      if (toAppend.length > 0) {
        channel.blocks.$jazz.splice(channel.blocks.length, 0, ...toAppend)
      }
      channel.fetchedPages?.$jazz.push(nextPage)
    }

    const hasMore = computeHasMore({ totalPages, json, per, page: nextPage, addedCount })
    channel.$jazz.set('hasMore', hasMore)
    channel.$jazz.set('lastFetchedAt', Date.now())
    channel.$jazz.set('error', undefined)

    return true
  })()
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Arena contents fetch failed'
      channel.$jazz.set('error', msg)
      throw err
    })
    .finally(() => {
      inflightPages.delete(inflightKey)
    })

  inflightPages.set(inflightKey, promise)
  return promise
}

export type SyncChannelOptions = {
  per?: number
  maxAgeMs?: number
  force?: boolean
  signal?: AbortSignal
}

/**
 * Sync a channel until it is complete (hasMore === false) or aborted.
 */
export async function syncChannel(
  cache: LoadedArenaCache,
  slug: string,
  opts: SyncChannelOptions = {}
): Promise<void> {
  const { per = DEFAULT_PER, maxAgeMs = DEFAULT_MAX_AGE_MS, force = false, signal } = opts
  const channel = ensureChannel(cache, slug)

  const shouldRefresh = force || isStale(channel, maxAgeMs)
  if (shouldRefresh) {
    resetPagingState(channel)
  }

  await syncMetadata(channel, slug, { force: shouldRefresh, signal })
  updateHasMoreFromLength(channel, per)

  if (signal?.aborted) return

  for (;;) {
    if (signal?.aborted) return
    const didFetch = await syncNextPage(channel, slug, { per, signal })
    if (!didFetch) break
  }
}
