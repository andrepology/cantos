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

export function useChannelMetadata(slug: string | undefined): ChannelMetadata | null | undefined {
  // 1. Get cache ID from account root
  const me = useAccount(Account, {
    resolve: { root: { arenaCache: true } },
  })
  
  const cacheId = useMemo(() => {
    if (!me.$isLoaded) return undefined
    return me.root?.arenaCache?.$jazz.id
  }, [me])

  // 2. Subscribe to cache (just the channels record)
  const cache = useCoState(ArenaCache, cacheId, { resolve: { channels: true } })

  // 3. O(1) channel lookup by slug from co.record
  const channelId = useMemo(() => {
    if (!slug) return undefined
    if (cache === undefined || cache === null) return undefined
    if (!cache.channels?.$isLoaded) return undefined

    const channelRef = cache.channels[slug]
    if (!channelRef) return undefined
    return channelRef.$jazz.id
  }, [cache, slug])

  // 4. Subscribe to the specific channel with connections resolved
  const channel = useCoState(ArenaChannel, channelId, {
    resolve: { 
      connections: { $each: { author: true } },
      author: true 
    },
  })

  // 5. Transform to stable metadata object
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
      connections: (loadedChannel.connections?.filter(conn => conn?.$isLoaded).map((conn): ConnectionItem => ({
        id: conn.id,
        title: conn.title || 'Untitled',
        slug: conn.slug,
        author: conn.author?.$isLoaded 
          ? (conn.author.fullName || conn.author.username) 
          : undefined,
        length: conn.length,
      }))) ?? [],
      loading: loadedChannel.connectionsLastFetchedAt === undefined,
      error: loadedChannel.connectionsError,
    }
  }, [channel])
}
