/**
 * Selector-filtered hook for layout metrics (aspect ratios).
 * 
 * This hook subscribes deeply to channel blocks but uses a selector
 * to extract ONLY layout-relevant data (id, arenaId, aspect).
 * 
 * Re-renders ONLY when:
 * - Block list changes (add/remove/reorder)
 * - Any block's aspect ratio changes
 * 
 * Does NOT re-render when:
 * - Block title/description/content changes
 * - Block user metadata changes
 * - Any non-layout property changes
 * 
 * This is the key performance optimization for the sync-induced render storm.
 */

import { useCoState } from 'jazz-tools/react'
import type { MaybeLoaded, Loaded } from 'jazz-tools'
import { ArenaChannel, type LoadedArenaBlock } from '../../jazz/schema'

export interface LayoutItem {
  id: string      // Jazz CoValue ID
  arenaId: number // Arena API block ID
  aspect: number  // Width / Height ratio for Masonry layout
}

// Type for the resolved channel with blocks
type ResolvedChannel = Loaded<typeof ArenaChannel, { blocks: { $each: true } }>

/**
 * Deep equality check for layout items array.
 * Only compares id, arenaId, and aspect - ignores all other block properties.
 */
function layoutItemsEqual(
  a: LayoutItem[],
  b: LayoutItem[]
): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false

  for (let i = 0; i < a.length; i++) {
    const itemA = a[i]
    const itemB = b[i]
    if (itemA.id !== itemB.id) return false
    if (itemA.arenaId !== itemB.arenaId) return false
    if (itemA.aspect !== itemB.aspect) return false
  }
  return true
}

/**
 * Subscribe to channel blocks and extract only layout metrics.
 * 
 * @param channelId - Jazz CoValue ID of the ArenaChannel
 * @returns Stable array of LayoutItems that only changes when layout-relevant data changes
 */
export function useLayoutMetrics(channelId: string | undefined): LayoutItem[] {
  return useCoState(
    ArenaChannel,
    channelId,
    {
      resolve: { blocks: { $each: true } },
      select: (channel: MaybeLoaded<ResolvedChannel>): LayoutItem[] => {
        if (!channel?.$isLoaded) return []
        if (!channel.blocks?.$isLoaded) return []
        
        return channel.blocks
          .filter((b): b is LoadedArenaBlock => b?.$isLoaded === true)
          .map(b => ({
            id: b.$jazz.id,
            arenaId: b.arenaId ?? Number(b.blockId) ?? 0,
            aspect: b.aspect ?? 1
          }))
      },
      equalityFn: layoutItemsEqual
    }
  )
}

