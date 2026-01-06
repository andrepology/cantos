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
  type LoadedArenaBlock,
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
// aspectMeasurement no longer needed - v3 API provides aspect_ratio directly
type MeasurableBlock = {
  blockId: string
  type: 'image' | 'media' | 'link' | 'pdf' | 'text' | 'channel'
  thumbUrl?: string
  displayUrl?: string
  embedWidth?: number
  embedHeight?: number
  aspect?: number
  aspectSource?: 'measured'
}

const DEFAULT_PER = 50
const BOOST_PER = 5
const DEFAULT_MAX_AGE_MS = 12 * 60 * 60 * 1000 // 12 hours
const CONNECTIONS_PER = 50
const CONNECTIONS_MAX_AGE_MS = 60 * 60 * 1000 // 1 hour

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

/**
 * Normalized block type for internal use.
 * v3 API provides aspect_ratio directly - no measurement needed!
 */
type NormalizedBlock = MeasurableBlock & {
  arenaId: number
  title?: string
  createdAt?: string
  updatedAt?: string
  description?: string
  content?: string
  largeUrl?: string
  originalFileUrl?: string
  embedHtml?: string
  provider?: string
  channelSlug?: string
  length?: number
  user?: {
    id: number
    username?: string
    fullName?: string
    avatarThumb?: string
    avatarDisplay?: string
  }
}

/**
 * Normalize API block to internal format.
 * v3 API provides aspect_ratio directly on images - no measurement needed!
 */
function normalizeBlock(raw: ArenaAPIBlock): NormalizedBlock {
  const type = mapBlockType(raw)

  const user = toArenaAuthor(raw.user)

  // Extract all image URLs from API response (supports both v2 and v3 structures)
  const img = raw.image as any
  const imageUrls = {
    thumbUrl: img?.thumb?.url ?? img?.small?.src,
    displayUrl: img?.display?.url ?? img?.medium?.src,
    largeUrl: img?.large?.url ?? img?.large?.src,
    originalFileUrl: img?.original?.url,
  }

  // Extract embed dimensions (for media blocks - free aspect from API!)
  const embedDimensions = {
    embedWidth: raw.embed?.width,
    embedHeight: raw.embed?.height,
  }

  // v3 API provides aspect_ratio directly on images!
  // Calculate from dimensions if aspect_ratio not available
  const aspectFromApi = raw.image?.aspect_ratio
    ?? (raw.image?.width && raw.image?.height ? raw.image.width / raw.image.height : undefined)
    ?? (raw.embed?.width && raw.embed?.height ? raw.embed.width / raw.embed.height : undefined)

  const base = {
    blockId: String(raw.id),
    arenaId: raw.id,
    type,
    title: raw.title ?? undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    description: raw.description ?? undefined,
    user,
    ...imageUrls,
    ...embedDimensions,
    // v3 provides aspect directly - no measurement needed!
    aspect: aspectFromApi,
    aspectSource: aspectFromApi ? 'measured' as const : undefined,
  }

  switch (type) {
    case 'image':
      return base
    case 'text':
      return { ...base, content: raw.content ?? raw.title ?? '' }
    case 'link':
      return {
        ...base,
        provider: raw.source?.provider?.name,
        // For links, use display as thumb if no thumb available
        thumbUrl: raw.image?.thumb?.url ?? raw.image?.display?.url,
      }
    case 'media':
      return {
        ...base,
        embedHtml: raw.embed?.html ?? '',
        provider: raw.source?.provider?.name,
        // Store original source URL in originalFileUrl for media
        originalFileUrl: raw.source?.url ?? raw.attachment?.url ?? raw.image?.original?.url,
      }
    case 'pdf':
      return {
        ...base,
        // PDF uses attachment URL as the primary file
        originalFileUrl: raw.attachment?.url,
      }
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
  if (!pages?.$isLoaded || pages.length === 0) return 0
  return Math.max(...pages.map((p: number) => p))
}

function hasPage(channel: LoadedArenaChannel, page: number): boolean {
  const pages = channel.fetchedPages
  if (!pages?.$isLoaded) return false
  return pages.some((p: number) => p === page)
}

function ensureFetchedPages(channel: LoadedArenaChannel): void {
  if (channel.fetchedPages?.$isLoaded) return
  const owner = channel.$jazz.owner
  channel.$jazz.set('fetchedPages', co.list(z.number()).create([], owner ? { owner } : undefined))
}

function ensureBlocks(
  channel: LoadedArenaChannel,
): asserts channel is LoadedArenaChannel & { blocks: NonNullable<LoadedArenaChannel['blocks']> } {
  // Schema requires blocks, but older/malformed or shallowly-loaded data might not have it loaded.
  if (channel.blocks?.$isLoaded) return
  const owner = channel.$jazz.owner
  channel.$jazz.set('blocks', co.list(ArenaBlock).create([], owner ? { owner } : undefined))
}

function ensureConnections(channel: LoadedArenaChannel): void {
  if (channel.connections?.$isLoaded) return
  const owner = channel.$jazz.owner
  channel.$jazz.set('connections', co.list(ArenaChannelConnection).create([], owner ? { owner } : undefined))
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


/**
 * Reset pagination state for a fresh sync.
 * IMPORTANT: Does NOT wipe blocks - we preserve them to retain aspect data.
 * The sync process will update/merge blocks intelligently.
 */
function resetPagingState(channel: LoadedArenaChannel): void {
  ensureBlocks(channel)
  ensureFetchedPages(channel)

  // Reset pagination counters, but KEEP existing blocks (they have aspect data!)
  const pages = channel.fetchedPages
  if (pages?.$isLoaded) {
    pages.$jazz.splice(0, pages.length)
  }
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

function normalizeConnections(resp: ArenaChannelListResponse, owner: LoadedArenaChannel['$jazz']['owner'] | undefined) {
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
      owner ? { owner } : undefined,
    )
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
    const loaded = await channel.$jazz.ensureLoaded({ resolve: { connections: true } })
    const channelWithConnections = loaded as LoadedArenaChannel

    ensureConnections(channelWithConnections)
    const connections = channelWithConnections.connections
    if (!connections?.$isLoaded) {
      throw new Error('Channel connections list not loaded')
    }

    const all: Array<ReturnType<(typeof ArenaChannelConnection)['create']>> = []
    let page = 1
    let totalPages = 1

    while (page <= totalPages) {
      const resp = await fetchChannelConnectionsPage(channelId, page, CONNECTIONS_PER, { signal })
      totalPages = Math.max(1, Number(resp.total_pages ?? 1))
      all.push(...normalizeConnections(resp, channelWithConnections.$jazz.owner))
      page += 1
    }

    connections.$jazz.splice(0, connections.length, ...all)
    channelWithConnections.$jazz.set('connectionsLastFetchedAt', Date.now())
    channelWithConnections.$jazz.set('connectionsError', undefined)
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
      channel.channelId == null ||
      channel.title == null ||
      channel.createdAt == null ||
      channel.updatedAt == null ||
      channel.length == null ||
      !channel.author?.id ||
      channel.description == null

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

export type SyncChannelMetadataOptions = {
  force?: boolean
  signal?: AbortSignal
}

export async function syncChannelMetadata(
  channel: LoadedArenaChannel,
  slug: string,
  opts: SyncChannelMetadataOptions = {},
): Promise<void> {
  const { force = false, signal } = opts
  await syncMetadata(channel, slug, { force, signal })
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

async function syncNextPage(
  cache: LoadedArenaCache,
  channel: LoadedArenaChannel,
  slug: string,
  opts: SyncNextPageOptions
): Promise<boolean> {
  const { per, signal } = opts
  if (channel.hasMore === false) return false

  ensureBlocks(channel)
  ensureFetchedPages(channel)
  const channelBlocks = channel.blocks
  if (!channelBlocks.$isLoaded) throw new Error('Channel blocks list not loaded')

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
    // 1. Fetch from API
    const json = await fetchChannelContentsPage(slug, nextPage, per, { signal })
    const raw = json.contents ?? []

    // 2. Normalize (extract URLs + aspect from v3 API)
    // v3 API provides aspect_ratio directly - no client-side measurement needed!
    const normalized = raw.map(normalizeBlock)

    // 3. Build a set of block IDs already in this channel's blocks list (for deduplication)
    const channelBlockIds = new Set<string>()
    for (let i = 0; i < channelBlocks.length; i++) {
      const block = channelBlocks[i]
      if (block?.$isLoaded && block.blockId) {
        channelBlockIds.add(block.blockId)
      }
    }

    // 4. Process each block: check global registry, create if needed, push reference to channel
    const owner = cache.$jazz.owner
    let addedCount = 0
    const blocksToAppend: LoadedArenaBlock[] = []

    // Ensure blocks registry is loaded before accessing
    if (!cache.blocks.$isLoaded) {
      throw new Error('Cache blocks registry not loaded')
    }
    // Type assertion after load check - Jazz co.record with string keys
    const blocksRecord = cache.blocks as typeof cache.blocks & Record<string, LoadedArenaBlock | undefined>

    for (const data of normalized) {
      const arenaId = String(data.arenaId)
      
      // Check global registry first
      const existingBlock = blocksRecord[arenaId]
      let block: LoadedArenaBlock
      
      if (existingBlock && existingBlock.$isLoaded) {
        // Block exists in global registry - update aspect if we have better data
        block = existingBlock
        if ((!block.aspect || block.aspectSource !== 'measured') && data.aspect) {
          block.$jazz.set('aspect', data.aspect)
          if (data.aspectSource) block.$jazz.set('aspectSource', data.aspectSource)
        }
      } else {
        // Create new block and add to global registry
        const created = ArenaBlock.create(data, owner ? { owner } : undefined)
        block = created as LoadedArenaBlock
        cache.blocks.$jazz.set(arenaId, created)
      }
      
      // Push reference to channel.blocks only if not already present
      if (!channelBlockIds.has(data.blockId)) {
        blocksToAppend.push(block)
        channelBlockIds.add(data.blockId) // Track to avoid duplicates within this batch
        addedCount++
      }
    }

    // 7. Append new block references to channel
    if (blocksToAppend.length > 0) {
      channelBlocks.$jazz.splice(channelBlocks.length, 0, ...blocksToAppend)
    }

    // 8. Update pagination state
    const fetchedPages = channel.fetchedPages
    if (!fetchedPages?.$isLoaded) throw new Error('Channel fetchedPages list not loaded')
    if (nextPage === 1) {
      fetchedPages.$jazz.splice(0, fetchedPages.length, 1)
    } else {
      fetchedPages.$jazz.push(nextPage)
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
 * 
 * Uses the global blocks registry (cache.blocks) for block deduplication.
 * The same Arena block appearing in multiple channels will be a single CoValue.
 */
export async function syncChannel(
  cache: LoadedArenaCache, // Global registry for blocks
  channel: LoadedArenaChannel,
  slug: string,
  opts: SyncChannelOptions = {}
): Promise<void> {
  const { per = DEFAULT_PER, maxAgeMs = DEFAULT_MAX_AGE_MS, force = false, signal } = opts
  
  // Ensure channel's blocks and pagination state are loaded
  const loaded = await channel.$jazz.ensureLoaded({
    resolve: {
      blocks: { $each: true },
      fetchedPages: true,
    },
  })
  const channelLoaded = loaded as LoadedArenaChannel
  
  const shouldRefresh = force || isStale(channelLoaded, maxAgeMs)
  let metadataFetched = false
  if (shouldRefresh) {
    const details = await fetchChannelDetails(slug, { signal })
    if (signal?.aborted) return

    const hasLength = typeof details.length === 'number'
    const lengthChanged = hasLength ? details.length !== channelLoaded.length : true
    const hasUpdatedAt = typeof details.updated_at === 'string'
    const updatedChanged = hasUpdatedAt ? details.updated_at !== channelLoaded.updatedAt : true

    channelLoaded.$jazz.set('channelId', String(details.id))
    channelLoaded.$jazz.set('title', details.title)
    channelLoaded.$jazz.set('description', details.description ?? undefined)
    channelLoaded.$jazz.set('createdAt', details.created_at)
    channelLoaded.$jazz.set('updatedAt', details.updated_at)
    channelLoaded.$jazz.set('length', details.length)
    channelLoaded.$jazz.set('author', toArenaAuthor(details.user))
    channelLoaded.$jazz.set('error', undefined)

    await syncConnections(channelLoaded, details.id, { force: false, signal })
    metadataFetched = true

    if (!lengthChanged && !updatedChanged) {
      channelLoaded.$jazz.set('lastFetchedAt', Date.now())
      updateHasMoreFromLength(channelLoaded, per)
      return
    }

    resetPagingState(channelLoaded)
  }

  if (!shouldRefresh && channelLoaded.hasMore !== false && channelLoaded.fetchedPages?.$isLoaded) {
    const fetchedPages = channelLoaded.fetchedPages
    const onlyPage1 = fetchedPages.length === 1 && fetchedPages[0] === 1
    const blocksCount = channelLoaded.blocks?.$isLoaded ? channelLoaded.blocks.length : 0
    if (onlyPage1 && blocksCount > 0 && blocksCount <= BOOST_PER) {
      fetchedPages.$jazz.splice(0, fetchedPages.length)
    }
  }

  if (signal?.aborted) return

  // 1. Boost fetch: first 5 items immediately for fast first paint.
  // We use a small 'per' to get content on screen ASAP.
  const boostDidFetch = await syncNextPage(cache, channelLoaded, slug, { per: BOOST_PER, signal })

  if (signal?.aborted) return

  // 2. Metadata (and connections) can follow in the background.
  const metadataPromise = metadataFetched
    ? Promise.resolve()
    : syncMetadata(channelLoaded, slug, { force: shouldRefresh, signal }).catch(() => {
        // Error is written onto the channel CoValue; do not block first render.
      })

  // 3. Remove page 1 from fetchedPages so the main sync can re-fetch it with full 'per'.
  // We only do this if there's more content to fetch (hasMore) and if the boost fetch was successful.
  if (boostDidFetch && channelLoaded.hasMore !== false && BOOST_PER < per) {
    if (channelLoaded.fetchedPages?.$isLoaded) {
      const idx = channelLoaded.fetchedPages.indexOf(1)
      if (idx !== -1) {
        channelLoaded.fetchedPages.$jazz.splice(idx, 1)
      }
    }
  }

  // 4. Let metadata update length/author/title; affects hasMore heuristics and UI chrome.
  await metadataPromise
  updateHasMoreFromLength(channelLoaded, per)

  if (signal?.aborted) return

  // 5. Continue fetching remaining pages using the full 'per'.
  // Since we removed page 1 from fetchedPages above, the first call here will re-fetch 
  // page 1 with 'per=50', filling in any gaps from the boost fetch.
  for (;;) {
    if (signal?.aborted) return
    const didFetch = await syncNextPage(cache, channelLoaded, slug, { per, signal })
    if (!didFetch) break
  }
}
