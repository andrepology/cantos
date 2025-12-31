/**
 * Shallow structure hook for channel block list.
 * 
 * This hook subscribes SHALLOWLY to the channel's blocks list,
 * giving us access to:
 * - Block IDs (for passing to child components)
 * - List length (for UI indicators)
 * - Pagination state (hasMore, length)
 * 
 * Re-renders ONLY when:
 * - Block list changes (add/remove/reorder)
 * - Channel pagination state changes
 * 
 * Does NOT re-render when:
 * - Individual block properties change (title, aspect, etc.)
 * 
 * This is used in combination with useLayoutMetrics which handles aspects.
 */

import { useMemo, useRef } from 'react'
import { useAccount, useCoState } from 'jazz-tools/react'
import { Account, ArenaCache, ArenaChannel } from '../../jazz/schema'

export interface ChannelStructure {
  /** Jazz CoValue ID of the channel (for passing to other hooks) */
  channelId: string | undefined
  /** Jazz CoValue IDs of all blocks in order */
  blockIds: string[]
  /** Whether more blocks are available to fetch */
  hasMore: boolean
  /** Total block count from API metadata */
  length: number | undefined
  /** True if channel data is still loading */
  loading: boolean
  /** Error message if channel failed to load */
  error: string | null
}

/**
 * Get shallow channel structure with block IDs and pagination state.
 * 
 * @param slug - Arena channel slug
 * @returns Channel structure with IDs and metadata (no block content)
 */
export function useChannelStructure(slug: string | undefined): ChannelStructure {
  // 1. Get ArenaCache ID from account root
  const me = useAccount(Account, { resolve: { root: true } })
  
  const cacheId = useMemo(() => {
    if (me === undefined || me === null) return undefined
    if (!me.$isLoaded) return undefined
    return me.root?.arenaCache?.$jazz.id
  }, [me])

  // 2. Subscribe to ArenaCache (resolves channels record container)
  const cache = useCoState(ArenaCache, cacheId, { resolve: { channels: true } })

  // 3. O(1) channel lookup by slug from co.record
  const channelId = useMemo(() => {
    if (!slug) return undefined
    if (!cache?.$isLoaded) return undefined
    if (!cache.channels?.$isLoaded) return undefined

    const channelRef = cache.channels[slug]
    if (!channelRef) return undefined
    
    return channelRef.$jazz.id
  }, [cache, slug])

  // 4. Subscribe SHALLOWLY to channel - blocks list only, not block contents
  const channel = useCoState(ArenaChannel, channelId, {
    resolve: { blocks: true }  // Shallow: list container, not items
  })

  // 5. Extract block IDs from shallow list with STABLE reference
  // The channel object changes on every Jazz update, but we only want
  // to return a new blockIds array when the actual IDs change.
  const prevBlockIds = useRef<string[]>([])
  
  const blockIds = useMemo(() => {
    if (!channel?.$isLoaded) return prevBlockIds.current.length === 0 ? prevBlockIds.current : []
    if (!channel.blocks?.$isLoaded) return prevBlockIds.current.length === 0 ? prevBlockIds.current : []
    
    // Extract current IDs
    const currentIds: string[] = []
    for (let i = 0; i < channel.blocks.length; i++) {
      const blockRef = channel.blocks[i]
      if (blockRef) {
        currentIds.push(blockRef.$jazz.id)
      }
    }
    
    // Compare with previous - only return new array if content changed
    const prev = prevBlockIds.current
    if (prev.length === currentIds.length) {
      let same = true
      for (let i = 0; i < prev.length; i++) {
        if (prev[i] !== currentIds[i]) {
          same = false
          break
        }
      }
      if (same) return prev // Return SAME reference if content unchanged
    }
    
    // Content changed - update ref and return new array
    prevBlockIds.current = currentIds
    return currentIds
  }, [channel])

  // 6. Derive loading state
  const loading = slug
    ? cache === undefined ||
      (cache !== null && !cache.$isLoaded) ||
      channel === undefined ||
      (channel !== null && !channel.$isLoaded)
    : false

  return {
    channelId,
    blockIds,
    hasMore: channel?.$isLoaded ? channel.hasMore ?? false : false,
    length: channel?.$isLoaded ? channel.length : undefined,
    loading,
    error: channel?.$isLoaded ? channel.error ?? null : null
  }
}


