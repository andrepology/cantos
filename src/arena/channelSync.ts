/**
 * Channel sync utilities for streaming Arena channel data into Jazz CoValues.
 *
 * Core API:
 * - `syncChannelPage(slug, page?, opts?)` — fetch a page and mutate the ArenaChannel CoValue
 * - `isStale(channel, maxAgeMs)` — check if channel needs refresh
 * - `normalizeBlock(raw)` — convert Arena API block to ArenaBlock CoValue shape
 */

import { co, z } from 'jazz-tools'
import { ArenaBlock, ArenaChannel, ArenaCache, type LoadedArenaChannel, type LoadedArenaCache } from '../jazz/schema'
import { arenaFetch } from './http'
import { getArenaAccessToken } from './token'
import type { ArenaBlock as ArenaAPIBlock, ArenaChannelResponse } from './types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PER = 50
const DEFAULT_MAX_AGE_MS = 12 * 60 * 60 * 1000 // 12 hours

// Heuristic aspect ratios by block type
const HEURISTIC_ASPECTS: Record<string, number> = {
  image: 4 / 3,
  media: 16 / 9,
  pdf: 0.77,
  link: 1.6,
  text: 0.83,
  channel: 0.91,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAuthHeaders(): HeadersInit | undefined {
  const token = getArenaAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : undefined
}

/**
 * Check if a channel is stale based on lastFetchedAt.
 */
export function isStale(channel: LoadedArenaChannel | null | undefined, maxAgeMs = DEFAULT_MAX_AGE_MS): boolean {
  if (!channel) return true
  if (channel.lastFetchedAt === undefined || channel.lastFetchedAt === null) return true
  return Date.now() - channel.lastFetchedAt > maxAgeMs
}

/**
 * Get the highest fetched page number, or 0 if none.
 */
function getHighestFetchedPage(channel: LoadedArenaChannel): number {
  const pages = channel.fetchedPages
  if (!pages || pages.length === 0) return 0
  return Math.max(...pages.map(p => p ?? 0))
}

/**
 * Check if a specific page has been fetched.
 */
function hasPage(channel: LoadedArenaChannel, page: number): boolean {
  const pages = channel.fetchedPages
  if (!pages) return false
  return pages.some(p => p === page)
}

// ---------------------------------------------------------------------------
// Normalization: Arena API → ArenaBlock CoValue
// ---------------------------------------------------------------------------

type BlockType = 'image' | 'text' | 'link' | 'media' | 'pdf' | 'channel'

function mapBlockType(raw: ArenaAPIBlock): BlockType {
  // Check attachments first (video/pdf override class)
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
      return 'text' // fallback
  }
}

/**
 * Normalize an Arena API block to the shape expected by ArenaBlock CoValue.
 * Returns plain object suitable for ArenaBlock.create().
 */
export function normalizeBlock(raw: ArenaAPIBlock): {
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
      return {
        ...base,
        url: raw.image?.display?.url ?? raw.image?.original?.url,
      }
    case 'text':
      return {
        ...base,
        content: raw.content ?? raw.title ?? '',
      }
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
      return {
        ...base,
        url: raw.attachment?.url,
        thumbnailUrl: raw.image?.display?.url,
      }
    case 'channel':
      return {
        ...base,
        channelSlug: (raw as any).slug,
        length: (raw as any).length ?? 0,
      }
  }
}

// ---------------------------------------------------------------------------
// Inflight request deduplication
// ---------------------------------------------------------------------------

const inflightRequests = new Map<string, Promise<void>>()

function getInflightKey(slug: string, page: number): string {
  return `${slug}:${page}`
}

// ---------------------------------------------------------------------------
// Core sync function
// ---------------------------------------------------------------------------

export type SyncChannelPageOptions = {
  per?: number
  force?: boolean
}

/**
 * Fetch a single page of channel contents and mutate the ArenaChannel CoValue.
 *
 * - page 1 or force=true: replaces all blocks, resets fetchedPages to [1]
 * - otherwise: appends blocks, adds page to fetchedPages
 *
 * @param cache - The ArenaCache CoValue (must be loaded)
 * @param slug - Channel slug to fetch
 * @param page - Page number (default: next unfetched page)
 * @param opts - { per?, force? }
 */
export async function syncChannelPage(
  cache: LoadedArenaCache,
  slug: string,
  page?: number,
  opts: SyncChannelPageOptions = {}
): Promise<void> {
  const { per = DEFAULT_PER, force = false } = opts

  // Find or create channel in cache
  let channel = cache.channels?.find(c => c?.slug === slug) as LoadedArenaChannel | undefined

  // Determine which page to fetch
  let targetPage = page
  if (targetPage === undefined) {
    if (!channel || isStale(channel) || force) {
      targetPage = 1
    } else {
      targetPage = getHighestFetchedPage(channel) + 1
    }
  }

  // Skip if not force and page already fetched and not stale
  if (!force && channel && hasPage(channel, targetPage) && !isStale(channel)) {
    console.debug('[channelSync] skip fetch (fresh)', { slug, targetPage })
    return
  }

  // Inflight deduplication
  const inflightKey = getInflightKey(slug, targetPage)
  const existing = inflightRequests.get(inflightKey)
  if (existing) {
    console.debug('[channelSync] reuse inflight', { slug, targetPage })
    return existing
  }

  const doFetch = async () => {
    console.debug('[channelSync] fetch start', { slug, targetPage, per, force })
    try {
      const headers = getAuthHeaders()
      const url = `https://api.are.na/v2/channels/${encodeURIComponent(slug)}/contents?page=${targetPage}&per=${per}&sort=position&direction=desc`

      const res = await arenaFetch(url, { headers, mode: 'cors' })
      if (!res.ok) {
        const errorMsg = res.status === 401
          ? 'Unauthorized. Please log in to Arena.'
          : `Arena fetch failed: ${res.status}`
        
        // Set error on channel if it exists
        if (channel) {
          channel.$jazz.set('error', errorMsg)
        }
        throw new Error(errorMsg)
      }

      const json = (await res.json()) as ArenaChannelResponse
      const rawBlocks = json.contents ?? []

      // Normalize blocks to CoValue shape
      const normalizedBlocks = rawBlocks.map(normalizeBlock)

      // Create ArenaBlock CoValues
      const blockCoValues = normalizedBlocks.map(data => ArenaBlock.create(data))

      // Get channel metadata from response (available on contents endpoint)
      const channelMeta = {
        title: json.title,
        channelId: String(json.id),
        length: json.length,
        updatedAt: json.updated_at,
        createdAt: json.created_at,
      }

      // Calculate hasMore
      const hasMore = rawBlocks.length === per

      // Create or update channel
      if (!channel) {
        // Create new channel
        const newChannel = ArenaChannel.create({
          slug,
          channelId: channelMeta.channelId,
          title: channelMeta.title,
          length: channelMeta.length,
          createdAt: channelMeta.createdAt,
          updatedAt: channelMeta.updatedAt,
          blocks: co.list(ArenaBlock).create(blockCoValues),
          lastFetchedAt: Date.now(),
          fetchedPages: co.list(z.number()).create([targetPage!]),
          hasMore,
        })

        // Add author if available
        if (json.user) {
          newChannel.$jazz.set('author', {
            id: json.user.id,
            username: json.user.username,
            fullName: json.user.full_name,
            avatarThumb: json.user.avatar_image?.thumb ?? (json.user.avatar as string) ?? undefined,
          })
        }

        cache.channels?.$jazz.push(newChannel)
        channel = newChannel as LoadedArenaChannel
      } else {
        // Update existing channel
        const isReplaceMode = targetPage === 1 || force

        if (isReplaceMode) {
          // Replace all blocks using splice (Option B - preserves list identity)
          if (channel.blocks) {
            channel.blocks.$jazz.splice(0, channel.blocks.length, ...blockCoValues)
          }
          // Reset fetchedPages to [1]
          if (channel.fetchedPages) {
            channel.fetchedPages.$jazz.splice(0, channel.fetchedPages.length, targetPage!)
          }
        } else {
          // Append blocks
          if (channel.blocks) {
            for (const block of blockCoValues) {
              channel.blocks.$jazz.push(block)
            }
          }
          // Add page to fetchedPages
          channel.fetchedPages?.$jazz.push(targetPage!)
        }

        // Update metadata using $jazz.set()
        channel.$jazz.set('title', channelMeta.title)
        channel.$jazz.set('channelId', channelMeta.channelId)
        channel.$jazz.set('length', channelMeta.length)
        channel.$jazz.set('updatedAt', channelMeta.updatedAt)
        channel.$jazz.set('hasMore', hasMore)
        channel.$jazz.set('lastFetchedAt', Date.now())
        channel.$jazz.set('error', undefined) // Clear any previous error

        // Update author if available
        if (json.user) {
          channel.$jazz.set('author', {
            id: json.user.id,
            username: json.user.username,
            fullName: json.user.full_name,
            avatarThumb: json.user.avatar_image?.thumb ?? (json.user.avatar as string) ?? undefined,
          })
        }
      }
    } finally {
      console.debug('[channelSync] fetch done', { slug, targetPage })
      inflightRequests.delete(inflightKey)
    }
  }

  const promise = doFetch()
  inflightRequests.set(inflightKey, promise)
  return promise
}

/**
 * Check if a page fetch is currently in flight.
 */
export function isPageInflight(slug: string, page: number): boolean {
  return inflightRequests.has(getInflightKey(slug, page))
}

/**
 * Invalidate a channel by clearing its staleness markers.
 * Next access will trigger a refresh.
 */
export function invalidateChannel(channel: LoadedArenaChannel): void {
  channel.$jazz.set('lastFetchedAt', undefined)
  channel.$jazz.set('hasMore', true)
  if (channel.fetchedPages) {
    channel.fetchedPages.$jazz.splice(0, channel.fetchedPages.length)
  }
}
