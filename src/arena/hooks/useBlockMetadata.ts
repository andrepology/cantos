/**
 * Hook for retrieving block metadata from the Jazz Arena cache.
 *
 * Mirrors the approach in `useChannelMetadata` but scoped to a single block.
 * Returns the block's author + created timestamp when available.
 */

import { useMemo } from 'react'
import { useAccount, useCoState } from 'jazz-tools/react'
import { Account, ArenaChannel, ArenaBlock, type LoadedArenaBlock } from '../../jazz/schema'

export interface BlockMetadata {
  author: { id: number; name: string; avatarThumb?: string } | null
  addedAt: string | null
}

export function useBlockMetadata(
  channelSlug: string | undefined,
  blockId: number | undefined
): BlockMetadata | null | undefined {
  // 1. Lookup the Jazz ID for the requested block.
  // We resolve the channels and their block lists to find the specific block's Jazz ID.
  
  const blockJazzId = useAccount(Account, {
    resolve: {
      root: {
        arenaCache: { 
          channels: { 
            $each: { blocks: true } 
          } 
        },
      },
    },
    select: (me) => {
      if (!me.$isLoaded || !channelSlug || !blockId || !me.root?.arenaCache?.channels) return undefined
      
      const channel = me.root.arenaCache.channels.find((c) => c?.slug === channelSlug)
      if (!channel || !channel.$isLoaded || !channel.blocks) return null

      const block = channel.blocks.find((b) => {
        if (!b || !b.$isLoaded) return false
        // Check both arenaId (numeric) and blockId (numeric string)
        if (typeof b.arenaId === 'number' && b.arenaId === blockId) return true
        const numericBlockId = Number(b.blockId)
        return Number.isFinite(numericBlockId) && numericBlockId === blockId
      })

      return block?.$jazz.id ?? null
    }
  })

  // 2. Subscribe directly to the block metadata (the leaf).
  // This ensures we only re-render when THIS block or its author changes,
  // rather than any change in the entire channel.
  return useCoState(ArenaBlock, blockJazzId ?? undefined, {
    resolve: { user: true },
    select: (block): BlockMetadata | null | undefined => {
      // Handle loading/missing states of the block subscription itself
      if (block === undefined || !block.$isLoaded) return undefined
      if (block === null) return null

      return {
        author: (block.user && block.user.$isLoaded)
          ? {
              id: block.user.id,
              name: block.user.fullName || block.user.username || `User #${block.user.id}`,
              avatarThumb: block.user.avatarThumb,
            }
          : null,
        addedAt: block.createdAt ?? null,
      }
    },
    equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b)
  })
}
