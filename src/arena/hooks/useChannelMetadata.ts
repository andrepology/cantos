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
  const { me } = useAccount(Account, {
    resolve: {
      root: {
        arenaCache: { channels: true },
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

    // Build connections list from linked channels in the cache
    const connections: ConnectionItem[] = (me.root.arenaCache.channels || []).reduce<ConnectionItem[]>((acc, linkedChannel) => {
      if (!linkedChannel || linkedChannel.slug === slug) return acc // Skip self

      const conn: ConnectionItem = {
        id: acc.length + 1, // Numeric ID based on position in list
        title: linkedChannel.title || linkedChannel.slug || 'Untitled',
        slug: linkedChannel.slug,
        author: linkedChannel.author?.fullName || linkedChannel.author?.username,
        blockCount: linkedChannel.length,
      }
      acc.push(conn)
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
