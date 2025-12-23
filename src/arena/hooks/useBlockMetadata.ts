import { useMemo, useEffect } from 'react'
import { useAccount, useCoState } from 'jazz-tools/react'
import { Account, ArenaBlock, ArenaCache, type LoadedArenaBlock } from '../../jazz/schema'
import { syncBlockMetadata } from '../blockSync'
import type { ConnectionItem } from '../ConnectionsPanel'

export interface BlockMetadata {
  author: { id: number; name: string; avatarThumb?: string } | null
  addedAt: string | null
  connections: ConnectionItem[]
  loading?: boolean
  error?: string
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
  // 1. Get cache ID from account root
  const me = useAccount(Account, {
    resolve: { root: { arenaCache: true } },
  })
  
  const cacheId = useMemo(() => {
    if (!me.$isLoaded) return undefined
    return me.root?.arenaCache?.$jazz.id
  }, [me])

  // 2. Subscribe to cache (just the blocks record)
  const cache = useCoState(ArenaCache, cacheId, { resolve: { blocks: true } })

  // 3. O(1) block lookup by Arena ID from co.record
  const blockJazzId = useMemo(() => {
    if (!blockId) return undefined
    if (cache === undefined || cache === null) return undefined
    if (!cache.blocks?.$isLoaded) return undefined
    
    // Access the record - Jazz returns the value or undefined if key doesn't exist
    const blockRef = cache.blocks[String(blockId)]
    if (!blockRef) return undefined
    
    // The reference always has an ID even if not fully loaded
    return blockRef.$jazz.id
  }, [cache, blockId])

  // 4. Subscribe directly to the block with connections resolved
  const block = useCoState(ArenaBlock, blockJazzId, {
    resolve: { user: true, connections: { $each: { author: true } } }
  })

  // 5. Trigger sync when the block is loaded
  useEffect(() => {
    if (block?.$isLoaded) {
      syncBlockMetadata(block as LoadedArenaBlock).catch(() => {
        // Error is handled via block.connectionsError
      })
    }
  }, [block])

  // 6. Transform to stable metadata object
  return useMemo((): BlockMetadata | null | undefined => {
    if (block === undefined) return undefined
    if (block === null) return null
    if (!block.$isLoaded) return undefined

    const loadedBlock = block as LoadedArenaBlock

    const connections: ConnectionItem[] = (loadedBlock.connections ?? [])
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
      author: (loadedBlock.user && loadedBlock.user.$isLoaded)
        ? {
            id: loadedBlock.user.id,
            name: loadedBlock.user.fullName || loadedBlock.user.username || `User #${loadedBlock.user.id}`,
            avatarThumb: loadedBlock.user.avatarThumb,
          }
        : null,
      addedAt: loadedBlock.createdAt ?? null,
      connections,
      loading: loadedBlock.connectionsLastFetchedAt === undefined,
      error: loadedBlock.connectionsError,
    }
  }, [block])
}
