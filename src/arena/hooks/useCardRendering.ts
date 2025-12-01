import { useMemo } from 'react'
import type { Card } from '../types'
import type { LayoutMode, CardLayout } from './useTactileLayout'
import { recordCullingTiming } from '../tactilePerf'

// Constants for culling logic
const OVERSCAN = 200
const ACTIVE_SET_SIZE = 8
const STACK_PX_PER_CARD = 50
const STACK_TRAIL = 4

function getRenderableCardIds(
  items: Card[],
  layoutMap: Map<number, CardLayout>,
  scrollOffset: number,
  containerW: number,
  containerH: number,
  mode: LayoutMode
): { renderIds: Set<number>; activeIds: Set<number> } {
  const renderIds = new Set<number>()
  const activeIds = new Set<number>()

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const layout = layoutMap.get(item.id)
    if (!layout) continue
    
    // Stack/mini: limit to active window around scroll position
    if (mode === 'stack' || mode === 'mini') {
      const topIndex = Math.floor(scrollOffset / STACK_PX_PER_CARD)
      const start = Math.max(0, topIndex - STACK_TRAIL)
      const end = Math.min(items.length - 1, topIndex + ACTIVE_SET_SIZE - 1)

      if (i >= start && i <= end) {
        renderIds.add(item.id)
        activeIds.add(item.id)
      }
      continue
    }

    // Active set: first N cards (for smooth mode transitions) in non-stack modes
    const isInActiveSet = i < ACTIVE_SET_SIZE
    
    let isVisible = false
    
    const viewportLeft = -OVERSCAN
    const viewportRight = containerW + OVERSCAN
    const viewportTop = -OVERSCAN
    const viewportBottom = containerH + OVERSCAN
    
    // Simple AABB intersection
    isVisible = 
        layout.x + layout.width > viewportLeft &&
        layout.x < viewportRight &&
        layout.y + layout.height > viewportTop &&
        layout.y < viewportBottom
    
    // Render if visible OR in active set (for mode transitions)
    if (isVisible || isInActiveSet) {
      renderIds.add(item.id)
      
      // Active animation: visible cards OR active set cards
      if (isVisible || isInActiveSet) {
        activeIds.add(item.id)
      }
    }
  }
  
  return { renderIds, activeIds }
}

interface UseCardRenderingProps {
  items: Card[]
  layoutMap: Map<number, CardLayout>
  scrollOffset: number
  containerW: number
  containerH: number
  mode: LayoutMode
}

export function useCardRendering({
  items,
  layoutMap,
  scrollOffset,
  containerW,
  containerH,
  mode
}: UseCardRenderingProps) {
  return useMemo(() => {
    const t0 = performance.now()
    const result = getRenderableCardIds(items, layoutMap, scrollOffset, containerW, containerH, mode)
    const t1 = performance.now()
    recordCullingTiming(t1 - t0)
    return result
  }, [items, layoutMap, scrollOffset, containerW, containerH, mode])
}

