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
import { measureBlockAspects, type MeasurableBlock } from './aspectMeasurement'

const DEFAULT_PER = 50
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
 * Does NOT include aspect - that's added during measurement phase.
 */
type NormalizedBlock = MeasurableBlock & {
  arenaId: number
  title?: string
  createdAt?: string
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
  }
}

/**
 * Normalize API block to internal format.
 * Extracts all image URLs but does NOT assign aspect - that happens in measurement phase.
 */
function normalizeBlock(raw: ArenaAPIBlock): NormalizedBlock {
  const type = mapBlockType(raw)

  const user = raw.user
    ? {
        id: raw.user.id,
        username: raw.user.username,
        fullName: raw.user.full_name,
        avatarThumb: raw.user.avatar_image?.thumb ?? (raw.user.avatar as string) ?? undefined,
      }
    : undefined

  // Extract all image URLs from API response
  const imageUrls = {
    thumbUrl: raw.image?.thumb?.url,
    displayUrl: raw.image?.display?.url,
    largeUrl: raw.image?.large?.url,
    originalFileUrl: raw.image?.original?.url,
  }

  // Extract embed dimensions (for media blocks - free aspect from API!)
  const embedDimensions = {
    embedWidth: raw.embed?.width,
    embedHeight: raw.embed?.height,
  }

  const base = {
    blockId: String(raw.id),
    arenaId: raw.id,
    type,
    title: raw.title ?? undefined,
    createdAt: raw.created_at,
    description: raw.description ?? undefined,
    user,
    ...imageUrls,
    ...embedDimensions,
    // NO aspect or aspectSource here - added during measurement
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

/**
 * Build a map of existing block aspects from Jazz channel.
 * Used to avoid re-measuring blocks that already have measured aspects.
 * 
 * Because the hook now deep-resolves blocks before calling syncChannel,
 * this map will be populated with existing data from IndexedDB.
 */
function getExistingAspects(
  channel: LoadedArenaChannel
): Map<string, { aspect?: number; aspectSource?: string }> {
  const map = new Map<string, { aspect?: number; aspectSource?: string }>()
  if (!channel.blocks?.$isLoaded) return map
  for (const block of channel.blocks) {
    if (!block?.$isLoaded) continue
    if (!block.blockId) continue
    map.set(block.blockId, {
      aspect: block.aspect,
      aspectSource: block.aspectSource,
    })
  }
  return map
}

async function syncNextPage(channel: LoadedArenaChannel, slug: string, opts: SyncNextPageOptions): Promise<boolean> {
  const { per, signal } = opts
  if (channel.hasMore === false) return false

  ensureBlocks(channel)
  ensureFetchedPages(channel)
  const blocks = channel.blocks
  if (!blocks.$isLoaded) throw new Error('Channel blocks list not loaded')

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

    // 2. Normalize (extract URLs, no aspect yet)
    const normalized = raw.map(normalizeBlock)

    // 3. Get existing aspects from channel (already hydrated by hook's deep resolve)
    // This is synchronous and fast - no IndexedDB waiting needed
    const existingAspects = getExistingAspects(channel)
    console.log(`[syncNextPage] Page ${nextPage}: Found ${existingAspects.size} existing measured blocks in Jazz to reuse.`)

    // 4. Measure aspects only for blocks that don't have them
    // Blocks with existing measured aspects are skipped (no Image() loads)
    const measured = await measureBlockAspects(normalized, existingAspects)

    // 5. Build a map of existing blocks for efficient lookup
    const existingBlocksMap = new Map<string, number>()
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]
      const id = block?.$isLoaded ? block.blockId : undefined
      if (typeof id === 'string') existingBlocksMap.set(id, i)
    }

    // 6. Separate into updates vs new blocks
    const toUpdate: Array<{ index: number; data: typeof measured[0] }> = []
    const toAppend: Array<typeof measured[0]> = []

    for (const data of measured) {
      const existingIndex = existingBlocksMap.get(data.blockId)
      if (existingIndex !== undefined) {
        // Block exists - only update if we have new aspect data
        const existing = blocks[existingIndex]
        if (existing?.$isLoaded && (!existing.aspect || existing.aspectSource !== 'measured') && data.aspect) {
          toUpdate.push({ index: existingIndex, data })
        }
      } else {
        // New block
        toAppend.push(data)
      }
    }

    // 7. Apply updates in-place (preserves existing CoValue, just updates fields)
    for (const { index, data } of toUpdate) {
      const block = blocks[index]
      if (block?.$isLoaded) {
        if (data.aspect !== undefined) block.$jazz.set('aspect', data.aspect)
        if (data.aspectSource) block.$jazz.set('aspectSource', data.aspectSource)
      }
    }

    // 8. Append new blocks (creates CoValues only for truly new blocks)
    let addedCount = 0
    if (toAppend.length > 0) {
      const owner = channel.$jazz.owner
      const newCoValues = toAppend.map((data) => ArenaBlock.create(data, owner ? { owner } : undefined))
      blocks.$jazz.splice(blocks.length, 0, ...newCoValues)
      addedCount = newCoValues.length
    }

    // 9. Update pagination state
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
 * NOW PURE: Requires a valid, loaded channel instance. Does NOT look up or create channels.
 */
export async function syncChannel(
  channel: LoadedArenaChannel, // DIRECT INSTANCE
  slug: string,
  opts: SyncChannelOptions = {}
): Promise<void> {
  const { per = DEFAULT_PER, maxAgeMs = DEFAULT_MAX_AGE_MS, force = false, signal } = opts
  
  // No Ensure! No Lookup! Just Sync.
  const loaded = await channel.$jazz.ensureLoaded({
    resolve: {
      blocks: { $each: true },
      fetchedPages: true,
    },
  })
  const channelLoaded = loaded as LoadedArenaChannel
  
  const shouldRefresh = force || isStale(channelLoaded, maxAgeMs)
  if (shouldRefresh) {
    resetPagingState(channelLoaded)
  }

  // Prioritize first page contents so cards render ASAP.
  // Metadata (and connections) can follow in the background.
  const metadataPromise = syncMetadata(channelLoaded, slug, { force: shouldRefresh, signal }).catch(() => {
    // Error is written onto the channel CoValue; do not block first render.
  })

  if (signal?.aborted) return

  // Fetch page 1 immediately (subject to global arenaFetch pacing).
  await syncNextPage(channelLoaded, slug, { per, signal })

  if (signal?.aborted) return

  // Let metadata update length/author/title; affects hasMore heuristics and UI chrome.
  await metadataPromise
  updateHasMoreFromLength(channelLoaded, per)

  if (signal?.aborted) return

  // Continue fetching remaining pages.
  for (;;) {
    if (signal?.aborted) return
    const didFetch = await syncNextPage(channelLoaded, slug, { per, signal })
    if (!didFetch) break
  }
}
