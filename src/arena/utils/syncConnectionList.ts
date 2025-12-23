/**
 * Shared utility for syncing paginated channel connection lists.
 * 
 * Used by:
 * - channelSync (channel.connections)
 * - blockSync (block.connections)
 * - authorSync (author.channels)
 * 
 * Jazz pattern: Fetch all pages, create CoValues, replace entire list.
 */

import type { Group } from 'jazz-tools'
import { ArenaChannelConnection } from '../../jazz/schema'
import { toArenaAuthor } from '../arenaClient'
import type { ArenaChannelListResponse, ArenaConnectedChannel } from '../types'

const DEFAULT_PER = 50

/** A loaded co.list of ArenaChannelConnection with Jazz methods */
export type LoadedConnectionList = {
  $isLoaded: true
  length: number
  $jazz: {
    splice: (start: number, deleteCount: number, ...items: unknown[]) => void
  }
}

export type ConnectionListTarget = {
  /** The co.list to populate (must be loaded) */
  connections: LoadedConnectionList
  /** Owner Group for creating new CoValues */
  owner: Group | undefined
  /** Setter for lastFetchedAt timestamp */
  setLastFetched: (timestamp: number) => void
  /** Setter for error message */
  setError: (error: string | undefined) => void
}

export type FetchPageFn = (
  page: number,
  per: number,
  signal?: AbortSignal
) => Promise<ArenaChannelListResponse>

/**
 * Normalizes API channel response to ArenaChannelConnection CoValues.
 */
function normalizeConnections(
  resp: ArenaChannelListResponse,
  owner: Group | undefined
): Array<ReturnType<typeof ArenaChannelConnection.create>> {
  const channels = Array.isArray(resp.channels) ? resp.channels : []
  return channels.map((c: ArenaConnectedChannel) => {
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

/**
 * Sync a paginated connection list from Arena API to Jazz co.list.
 * 
 * Fetches all pages and replaces the entire list atomically.
 * 
 * @param target - The connection list target with setters
 * @param fetchPage - Function to fetch a page of connections
 * @param opts - Options including per-page count and abort signal
 */
export async function syncConnectionList(
  target: ConnectionListTarget,
  fetchPage: FetchPageFn,
  opts: { per?: number; signal?: AbortSignal } = {}
): Promise<void> {
  const { per = DEFAULT_PER, signal } = opts
  
  if (!target.connections.$isLoaded) {
    throw new Error('Connection list not loaded')
  }

  const all: Array<ReturnType<typeof ArenaChannelConnection.create>> = []
  let page = 1
  let totalPages = 1

  try {
    while (page <= totalPages) {
      if (signal?.aborted) return
      
      const resp = await fetchPage(page, per, signal)
      totalPages = Math.max(1, Number(resp.total_pages ?? 1))
      all.push(...normalizeConnections(resp, target.owner))
      page++
    }

    // Replace entire list atomically
    target.connections.$jazz.splice(0, target.connections.length, ...all)
    target.setLastFetched(Date.now())
    target.setError(undefined)
  } catch (err) {
    if (signal?.aborted) return
    const msg = err instanceof Error ? err.message : 'Connection list sync failed'
    target.setError(msg)
    throw err
  }
}

/**
 * Check if a connection list should be synced based on age.
 */
export function shouldSyncConnections(
  lastFetchedAt: number | undefined | null,
  maxAgeMs: number,
  force: boolean
): boolean {
  if (force) return true
  if (typeof lastFetchedAt !== 'number') return true
  return Date.now() - lastFetchedAt > maxAgeMs
}

