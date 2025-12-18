/**
 * Hook for retrieving channel metadata from the Jazz cache.
 *
 * Returns real metadata (author, createdAt, updatedAt, connections) from ArenaChannel CoValue,
 * or null if the channel is not found in the cache.
 */

import { useMemo } from 'react'
import { useAccount, useCoState } from 'jazz-tools/react'
import { Account, ArenaChannel, type LoadedArenaChannel } from '../../jazz/schema'
import type { ConnectionItem } from '../ConnectionsPanel'

export interface ChannelMetadata {
  author: { id: number; name: string; avatarThumb?: string } | null
  createdAt: string | null
  updatedAt: string | null
  connections: ConnectionItem[]
}

export function useChannelMetadata(slug: string | undefined): ChannelMetadata | null {
  // 1. Get the channel ID from the account root shallowly.
  // We only need the list of channels and their slugs to find the right ID.
  const channelId = useAccount(Account, {
    resolve: {
      root: {
        arenaCache: { channels: { $each: true } },
      },
    },
    select: (me) => {
      if (!me.$isLoaded || !slug || !me.root?.arenaCache?.channels) return undefined
      const channel = me.root.arenaCache.channels.find((c) => c?.slug === slug)
      return channel?.$jazz.id
    },
  })

  // 2. Subscribe to the specific channel with its connections resolved.
  // This avoids deep-loading EVERY channel in the cache.
  return useCoState(ArenaChannel, channelId, {
    resolve: { 
      connections: { $each: { author: true } },
      author: true 
    },
    select: (channel): ChannelMetadata | null => {
      if (!channel || !channel.$isLoaded) return null

      // Transform into stable metadata object
      return {
        author: (channel.author && channel.author.$isLoaded) ? {
          id: channel.author.id,
          name: channel.author.fullName || channel.author.username || `User #${channel.author.id}`,
          avatarThumb: channel.author.avatarThumb,
        } : null,
        createdAt: channel.createdAt || null,
        updatedAt: channel.updatedAt || null,
        connections: (channel.connections?.map((conn): ConnectionItem | null => {
          if (!conn || !conn.$isLoaded) return null
          return {
            id: conn.id,
            title: conn.title || 'Untitled',
            slug: conn.slug,
            author: (conn.author && conn.author.$isLoaded) 
              ? (conn.author.fullName || conn.author.username) 
              : undefined,
            length: conn.length,
          }
        }).filter((c): c is ConnectionItem => c !== null)) ?? []
      }
    },
    equalityFn: (a: ChannelMetadata | null, b: ChannelMetadata | null) => JSON.stringify(a) === JSON.stringify(b)
  })
}
