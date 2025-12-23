import { useMemo, useEffect } from 'react'
import { useAccount, useCoState } from 'jazz-tools/react'
import { Account, ArenaBlock } from '../../jazz/schema'
import { syncBlockMetadata } from '../blockSync'
import type { ConnectionItem } from '../ConnectionsPanel'

export interface BlockMetadata {
  author: { id: number; name: string; avatarThumb?: string } | null
  addedAt: string | null
  connections: ConnectionItem[]
  loading?: boolean
  error?: string
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
  const block = useCoState(ArenaBlock, blockJazzId ?? undefined, {
    resolve: { user: true, connections: { $each: { author: true } } }
  })

  // 3. Trigger sync when the block is loaded
  useEffect(() => {
    if (block?.$isLoaded) {
      syncBlockMetadata(block).catch(() => {
        // Error is handled via block.connectionsError
      })
    }
  }, [block])

  return useMemo(() => {
    if (block === undefined || !block.$isLoaded) return undefined
    if (block === null) return null

    const connections: ConnectionItem[] = (block.connections ?? [])
      .filter((c): c is NonNullable<typeof c> => !!c && c.$isLoaded)
      .map((c) => ({
        id: c.id,
        slug: c.slug,
        title: c.title,
        author: (c.author && c.author.$isLoaded) 
          ? (c.author.fullName || c.author.username) 
          : undefined,
        updatedAt: c.updatedAt,
        length: c.length,
      }))

    return {
      author: (block.user && block.user.$isLoaded)
        ? {
            id: block.user.id,
            name: block.user.fullName || block.user.username || `User #${block.user.id}`,
            avatarThumb: block.user.avatarThumb,
          }
        : null,
      addedAt: block.createdAt ?? null,
      connections,
      loading: block.connectionsLastFetchedAt === undefined,
      error: block.connectionsError,
    }
  }, [block])
}
