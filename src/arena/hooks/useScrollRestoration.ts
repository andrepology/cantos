import { useCallback } from 'react'
import type { LayoutMode, CardLayout } from './useTactileLayout'
import type { Card } from '../types'
import { calculateLayout, getScrollBounds } from './useTactileLayout'

interface TransitionResult {
  nextScrollOffset: number
}

export function useScrollRestoration(
  currentMode: LayoutMode,
  currentScroll: number,
  items: Card[],
  viewport: { w: number; h: number }
) {
  const getTransitionData = useCallback((nextMode: LayoutMode): TransitionResult => {
    if (items.length === 0) {
      return { nextScrollOffset: 0 }
    }

    // 1. Calculate Current Layout to find Anchor
    // Use current mode & scroll offset to get ACTUAL VISUAL POSITIONS
    const currentLayout = calculateLayout({
      mode: currentMode,
      items,
      containerW: viewport.w,
      containerH: viewport.h,
      scrollOffset: currentScroll
    })

    // 2. Find Anchor Card (closest to viewport center)
    let anchorId = items[0].id
    let minDistance = Infinity
    
    const viewportCenterX = viewport.w / 2
    const viewportCenterY = viewport.h / 2

    for (const [id, layout] of currentLayout.layoutMap.entries()) {
      // Layout coordinates are now always viewport-relative
      const centerX = layout.x + layout.width / 2
      const centerY = layout.y + layout.height / 2
      
      const dx = centerX - viewportCenterX
      const dy = centerY - viewportCenterY
      const dist = Math.hypot(dx, dy)
      
      if (dist < minDistance) {
        minDistance = dist
        anchorId = id
      }
    }

    // 3. Calculate Target Scroll
    // We want the anchor card to end up at the viewport center in the new mode.
    // We can't just calculate the layout with scroll=0, because that gives us "content space" coordinates relative to top/left.
    // Actually, "content space" IS what we need to solve for scroll.
    
    // Calculate "Base Layout" (Scroll = 0) to know where cards live in the new world
    const baseLayout = calculateLayout({
      mode: nextMode,
      items,
      containerW: viewport.w,
      containerH: viewport.h,
      scrollOffset: 0 
    })

    const targetLayout = baseLayout.layoutMap.get(anchorId)
    if (!targetLayout) {
       return { nextScrollOffset: 0 }
    }

    let nextScroll = 0
    
    if (nextMode === 'stack' || nextMode === 'mini') {
        // Stack special case: scroll maps to index depth, not pixel position
        const index = items.findIndex(c => c.id === anchorId)
        if (index !== -1) {
            nextScroll = index * 50 
        }
    } else if (nextMode === 'row' || nextMode === 'tab') {
        // Center horizontally
        // We want (baseX - scroll) + width/2 = viewportWidth/2
        // baseX + width/2 - scroll = viewportWidth/2
        // scroll = baseX + width/2 - viewportWidth/2
        nextScroll = (targetLayout.x + targetLayout.width / 2) - (viewport.w / 2)
    } else {
        // Column / Grid: Center vertically
        // scroll = baseY + height/2 - viewportHeight/2
        nextScroll = (targetLayout.y + targetLayout.height / 2) - (viewport.h / 2)
    }

    // Clamp result to valid bounds to prevent "snap" on first user interaction
    // This ensures we don't return a "centered" position that requires invalid negative scrolling (whitespace)
    // which would immediately vanish when the user touches the scroll wheel.
    const bounds = getScrollBounds(nextMode, baseLayout.contentSize, viewport.w, viewport.h, items.length)
    nextScroll = Math.max(bounds.min, Math.min(bounds.max, nextScroll))

    return { nextScrollOffset: nextScroll }

  }, [currentMode, currentScroll, items, viewport])

  const getResizeScrollOffset = useCallback((prevW: number, prevH: number): number => {
      if (items.length === 0) return 0
      
      // 1. Calculate Old Layout to find Anchor
      const oldLayout = calculateLayout({
          mode: currentMode,
          items,
          containerW: prevW,
          containerH: prevH,
          scrollOffset: currentScroll
      })
      
      // 2. Find Anchor (closest to center of OLD viewport)
      let anchorId = items[0].id
      let minDistance = Infinity
      const oldCenterX = prevW / 2
      const oldCenterY = prevH / 2
      
      for (const [id, layout] of oldLayout.layoutMap.entries()) {
          const centerX = layout.x + layout.width / 2
          const centerY = layout.y + layout.height / 2
          const dist = Math.hypot(centerX - oldCenterX, centerY - oldCenterY)
          if (dist < minDistance) {
              minDistance = dist
              anchorId = id
          }
      }
      
      // 3. Calculate Target Scroll in NEW Viewport
      // Base layout (scroll 0) in new viewport
      const newBaseLayout = calculateLayout({
          mode: currentMode,
          items,
          containerW: viewport.w,
          containerH: viewport.h,
          scrollOffset: 0
      })
      
      const targetLayout = newBaseLayout.layoutMap.get(anchorId)
      if (!targetLayout) return 0
      
      let nextScroll = 0
      if (currentMode === 'stack' || currentMode === 'mini') {
           // Stack typically doesn't need resize adjustment unless we want to preserve depth exactly?
           // Actually stack depends on container center. Scroll is index-based.
           // If we resize, center moves, but scroll (index) should probably stay same?
           // Or do we want to anchor the specific card?
           // Stack scroll is "index * 50". It doesn't depend on W/H.
           // So we can return currentScroll.
           return currentScroll
      } else if (currentMode === 'row' || currentMode === 'tab') {
          // Center horizontally
          nextScroll = (targetLayout.x + targetLayout.width / 2) - (viewport.w / 2)
      } else {
          // Column / Grid / VTab
          nextScroll = (targetLayout.y + targetLayout.height / 2) - (viewport.h / 2)
      }
      
      const bounds = getScrollBounds(currentMode, newBaseLayout.contentSize, viewport.w, viewport.h, items.length)
      return Math.max(bounds.min, Math.min(bounds.max, nextScroll))
  }, [currentMode, currentScroll, items, viewport])

  return { getTransitionData, getResizeScrollOffset }
}
