import { co, z } from 'jazz-tools'
import {
  ArenaBlock,
  ArenaChannelConnection,
  type LoadedArenaBlock,
} from '../jazz/schema'
import {
  fetchBlockConnectionsPage,
  fetchBlockDetails,
  toArenaAuthor,
} from './arenaClient'
import type { ArenaChannelListResponse } from './types'

const CONNECTIONS_PER = 50
const CONNECTIONS_MAX_AGE_MS = 60 * 60 * 1000 // 1 hour

const inflightConnections = new Map<number, Promise<void>>()
const inflightMeta = new Map<number, Promise<void>>()

function shouldSyncConnections(block: LoadedArenaBlock, force: boolean): boolean {
  if (force) return true
  const last = block.connectionsLastFetchedAt
  if (typeof last !== 'number') return true
  return Date.now() - last > CONNECTIONS_MAX_AGE_MS
}

function ensureConnections(block: LoadedArenaBlock): void {
  if (block.connections?.$isLoaded) return
  const owner = block.$jazz.owner
  block.$jazz.set('connections', co.list(ArenaChannelConnection).create([], owner ? { owner } : undefined))
}

function normalizeConnections(resp: ArenaChannelListResponse, owner: LoadedArenaBlock['$jazz']['owner'] | undefined) {
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

/**
 * Sync block connections from Arena to Jazz.
 */
export async function syncBlockConnections(
  block: LoadedArenaBlock,
  opts: { force?: boolean; signal?: AbortSignal } = {}
): Promise<void> {
  const { force = false, signal } = opts
  if (!block.arenaId) return
  if (!shouldSyncConnections(block, force)) return

  const blockId = block.arenaId
  const existing = inflightConnections.get(blockId)
  if (existing) return existing

  const promise = (async () => {
    const loaded = await block.$jazz.ensureLoaded({ resolve: { connections: true } })
    const blockWithConnections = loaded as LoadedArenaBlock

    ensureConnections(blockWithConnections)
    const connections = blockWithConnections.connections
    if (!connections?.$isLoaded) {
      throw new Error('Block connections list not loaded')
    }

    const all: Array<ReturnType<(typeof ArenaChannelConnection)['create']>> = []
    let page = 1
    let totalPages = 1

    while (page <= totalPages) {
      if (signal?.aborted) return
      const resp = await fetchBlockConnectionsPage(blockId, page, CONNECTIONS_PER, { signal })
      totalPages = Math.max(1, Number(resp.total_pages ?? 1))
      all.push(...normalizeConnections(resp, blockWithConnections.$jazz.owner))
      page += 1
    }

    connections.$jazz.splice(0, connections.length, ...all)
    blockWithConnections.$jazz.set('connectionsLastFetchedAt', Date.now())
    blockWithConnections.$jazz.set('connectionsError', undefined)
  })()
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Arena block connections fetch failed'
      block.$jazz.set('connectionsError', msg)
      throw err
    })
    .finally(() => {
      inflightConnections.delete(blockId)
    })

  inflightConnections.set(blockId, promise)
  return promise
}

/**
 * Sync block details (metadata) from Arena to Jazz.
 */
export async function syncBlockMetadata(
  block: LoadedArenaBlock,
  opts: { force?: boolean; signal?: AbortSignal } = {}
): Promise<void> {
  const { force = false, signal } = opts
  if (!block.arenaId) return

  const blockId = block.arenaId
  const existing = inflightMeta.get(blockId)
  if (existing) return existing

  const promise = (async () => {
    // Fresh metadata fetch
    const details = await fetchBlockDetails(blockId, { signal })
    
    block.$jazz.set('title', details.title)
    block.$jazz.set('description', details.description ?? undefined)
    block.$jazz.set('createdAt', details.created_at)
    block.$jazz.set('updatedAt', details.updated_at)
    block.$jazz.set('user', toArenaAuthor(details.user))
    
    // Also sync connections in parallel
    await syncBlockConnections(block, { force, signal })
  })().finally(() => {
    inflightMeta.delete(blockId)
  })

  inflightMeta.set(blockId, promise)
  return promise
}

