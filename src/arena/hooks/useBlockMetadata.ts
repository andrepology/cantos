/**
 * Hook for retrieving block metadata from the Jazz Arena cache.
 *
 * Mirrors the approach in `useChannelMetadata` but scoped to a single block.
 * Returns the block's author + created timestamp when available.
 */

import { useMemo } from 'react'
import { useAccount, useCoState } from 'jazz-tools/react'
import { Account, ArenaChannel, type LoadedArenaBlock } from '../../jazz/schema'

export interface BlockMetadata {
  author: { id: number; name: string } | null
  addedAt: string | null
}

export function useBlockMetadata(
  channelSlug: string | undefined,
  blockId: number | undefined
): BlockMetadata | null {
  const { me } = useAccount(Account, {
    resolve: {
      root: {
        arenaCache: { channels: true },
      },
    },
  })

  // Lookup the Jazz ID for the requested channel (stable primitive dep).
  const channelId = useMemo(() => {
    if (!channelSlug || !me?.root?.arenaCache?.channels) return undefined
    const channel = me.root.arenaCache.channels.find((c) => c?.slug === channelSlug)
    return channel?.$jazz.id
  }, [channelSlug, me?.root?.arenaCache?.channels])

  // Subscribe to the channel so we can inspect its block list.
  const channel = useCoState(ArenaChannel, channelId, {
    resolve: { blocks: { $each: { user: true } } },
  })

  return useMemo(() => {
    if (!channel || typeof blockId !== 'number') return null
    if (!channel.blocks || channel.blocks.length === 0) return null

    const block = channel.blocks.find((b) => {
      if (!b) return false
      if (typeof b.arenaId === 'number' && b.arenaId === blockId) return true
      const numericBlockId = Number(b.blockId)
      return Number.isFinite(numericBlockId) && numericBlockId === blockId
    }) as LoadedArenaBlock | undefined

    if (!block) return null

    const author = block.user
      ? {
          id: block.user.id,
          name: block.user.fullName || block.user.username || `User #${block.user.id}`,
        }
      : null

    return {
      author,
      addedAt: block.createdAt ?? null,
    }
  }, [channel, blockId])
}
