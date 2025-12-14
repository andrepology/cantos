/**
 * Hook for retrieving channel metadata from the Jazz cache.
 *
 * Returns real metadata (author, createdAt, updatedAt, connections) from ArenaChannel CoValue,
 * or null if the channel is not found in the cache.
 */

import { useMemo } from 'react'
import { useAccount } from 'jazz-tools/react'
import { Account, type LoadedArenaChannel } from '../../jazz/schema'
import type { ConnectionItem } from '../ConnectionsPanel'

export interface ChannelMetadata {
  author: { id: number; name: string } | null
  createdAt: string | null
  updatedAt: string | null
  connections: ConnectionItem[]
}

export function useChannelMetadata(slug: string | undefined): ChannelMetadata | null {
  const me = useAccount(Account, {
    resolve: {
      root: {
        arenaCache: { channels: { $each: { connections: true } } },
      },
    },
  })

  return useMemo(() => {
    if (!slug || !me?.root?.arenaCache?.channels) return null

    // Find the channel by slug
    const channel = me.root.arenaCache.channels.find(c => c?.slug === slug)
    if (!channel) return null

    // Extract author metadata
    const author = channel.author
      ? {
          id: channel.author.id,
          name: channel.author.fullName || channel.author.username || `User #${channel.author.id}`,
        }
      : null

    // Build connections list from stored ArenaChannelConnection CoValues
    const connections: ConnectionItem[] = (channel.connections || []).reduce<ConnectionItem[]>((acc, conn) => {
      if (!conn) return acc

      const item: ConnectionItem = {
        id: conn.id,
        title: conn.title || 'Untitled',
        slug: conn.slug,
        author: conn.author?.fullName || conn.author?.username,
        length: conn.length,
      }
      acc.push(item)
      return acc
    }, [])

    return {
      author,
      createdAt: channel.createdAt || null,
      updatedAt: channel.updatedAt || null,
      connections,
    }
  }, [slug, me?.root?.arenaCache?.channels])
}
