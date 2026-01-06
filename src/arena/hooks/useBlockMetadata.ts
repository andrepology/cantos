import { useMemo, useEffect } from 'react'
import { useAccount, useCoState } from 'jazz-tools/react'
import { Account, ArenaBlock, ArenaCache, type LoadedArenaBlock } from '../../jazz/schema'
import { syncBlockMetadata } from '../blockSync'
import type { ConnectionItem } from '../../shapes/components/MetadataPanel'

export interface BlockMetadata {
  author: { id: number; name: string; avatarThumb?: string; avatarDisplay?: string } | null
  addedAt: string | null
  connections: ConnectionItem[]
  loading?: boolean
  error?: string
}

/**
 * Helper to look up a block's Jazz ID by its Arena ID from the global cache.
 */
export function useBlockId(blockId: number | undefined): string | undefined {
  const me = useAccount(Account, {
    resolve: { root: { arenaCache: true } },
  })
  
  const cacheId = useMemo(() => {
    if (!me.$isLoaded) return undefined
    return me.root?.arenaCache?.$jazz.id
  }, [me])

  const cache = useCoState(ArenaCache, cacheId, { resolve: { blocks: true } })

  return useMemo(() => {
    if (!blockId) return undefined
    if (!cache?.$isLoaded) return undefined
    if (!cache.blocks) return undefined
    
    const blockRef = cache.blocks[String(blockId)]
    if (!blockRef) return undefined
    return blockRef.$jazz.id
  }, [cache, blockId])
}

/**
 * Hook to get block metadata from the global blocks registry.
 * O(1) lookup via cache.blocks[blockId] - no channel traversal needed.
 * 
 * Jazz pattern: Pass IDs, subscribe locally
 * 
 * @param blockId - Arena block ID (numeric)
 */
export function useBlockMetadata(
  blockId: number | undefined
): BlockMetadata | null | undefined {
  const blockJazzId = useBlockId(blockId)

  // Subscribe directly to the block with connections resolved
  const block = useCoState(ArenaBlock, blockJazzId, {
    resolve: { user: true, connections: { $each: { author: true } } }
  })

  // Trigger sync when the block is loaded
  useEffect(() => {
    if (block?.$isLoaded) {
      syncBlockMetadata(block as LoadedArenaBlock).catch(() => {
        // Error is handled via block.connectionsError
      })
    }
  }, [block])

  // Transform to stable metadata object
  return useMemo((): BlockMetadata | null | undefined => {
    if (block === undefined) return undefined
    if (block === null) return null
    if (!block.$isLoaded) return undefined

    const loadedBlock = block as LoadedArenaBlock

    const connectionsList = loadedBlock.connections
    const connections: ConnectionItem[] = (connectionsList && connectionsList.$isLoaded)
      ? connectionsList
          .filter((c): c is NonNullable<typeof c> & { $isLoaded: true } => !!c && c.$isLoaded)
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
      : []

    return {
      author: (loadedBlock.user && loadedBlock.user.$isLoaded)
        ? {
            id: loadedBlock.user.id,
            name: loadedBlock.user.fullName || loadedBlock.user.username || `User #${loadedBlock.user.id}`,
            avatarThumb: loadedBlock.user.avatarThumb,
            avatarDisplay: loadedBlock.user.avatarDisplay,
          }
        : null,
      addedAt: loadedBlock.createdAt ?? null,
      connections,
      loading: loadedBlock.connectionsLastFetchedAt === undefined,
      error: loadedBlock.connectionsError,
    }
  }, [block])
}
