/**
 * Hook for retrieving channel metadata from the Jazz cache.
 *
 * O(1) lookup via cache.channels[slug] (co.record).
 * Returns metadata (author, createdAt, updatedAt, connections) from ArenaChannel CoValue,
 * or null if the channel is not found in the cache.
 * 
 * Pattern: Pass IDs, subscribe locally (per Jazz playbook)
 */

import { useMemo } from 'react'
import { useAccount, useCoState } from 'jazz-tools/react'
import { Account, ArenaCache, ArenaChannel, type LoadedArenaChannel } from '../../jazz/schema'
import type { ConnectionItem } from '../../shapes/components/MetadataPanel'

export interface ChannelMetadata {
  author: { id: number; name: string; avatarThumb?: string; avatarDisplay?: string } | null
  createdAt: string | null
  updatedAt: string | null
  connections: ConnectionItem[]
  loading?: boolean
  error?: string
}

/**
 * Helper to look up a channel's Jazz ID by its slug from the global cache.
 */
export function useChannelId(slug: string | undefined): string | undefined {
  const me = useAccount(Account, {
    resolve: { root: { arenaCache: true } },
  })
  
  const cacheId = useMemo(() => {
    if (!me.$isLoaded) return undefined
    return me.root?.arenaCache?.$jazz.id
  }, [me])

  const cache = useCoState(ArenaCache, cacheId, { resolve: { channels: true } })

  return useMemo(() => {
    if (!slug) return undefined
    if (!cache?.$isLoaded) return undefined
    if (!cache.channels) return undefined

    const channelRef = cache.channels[slug]
    if (!channelRef) return undefined
    return channelRef.$jazz.id
  }, [cache, slug])
}

export function useChannelMetadata(slug: string | undefined): ChannelMetadata | null | undefined {
  const channelId = useChannelId(slug)

  // Subscribe to the specific channel with connections resolved
  const channel = useCoState(ArenaChannel, channelId, {
    resolve: { 
      connections: { $each: { author: true } },
      author: true 
    },
  })

  // Transform to stable metadata object
  return useMemo((): ChannelMetadata | null | undefined => {
    if (channel === undefined) return undefined
    if (channel === null) return null
    if (!channel.$isLoaded) return undefined

    const loadedChannel = channel as LoadedArenaChannel

    return {
      author: (loadedChannel.author?.$isLoaded) ? {
        id: loadedChannel.author.id,
        name: loadedChannel.author.fullName || loadedChannel.author.username || `User #${loadedChannel.author.id}`,
        avatarThumb: loadedChannel.author.avatarThumb,
        avatarDisplay: loadedChannel.author.avatarDisplay,
      } : null,
      createdAt: loadedChannel.createdAt || null,
      updatedAt: loadedChannel.updatedAt || null,
      connections: (loadedChannel.connections && loadedChannel.connections.$isLoaded 
        ? loadedChannel.connections
            .filter((conn): conn is NonNullable<typeof conn> & { $isLoaded: true } => !!conn && conn.$isLoaded)
            .map((conn): ConnectionItem => ({
              id: conn.id,
              title: conn.title || 'Untitled',
              slug: conn.slug,
              author: conn.author?.$isLoaded 
                ? (conn.author.fullName || conn.author.username) 
                : undefined,
              length: conn.length,
            }))
        : []),
      loading: loadedChannel.connectionsLastFetchedAt === undefined,
      error: loadedChannel.connectionsError,
    }
  }, [channel])
}
