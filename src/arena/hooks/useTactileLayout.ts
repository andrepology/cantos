import type { Card } from '../types'

export type LayoutMode = 'stack' | 'row' | 'column' | 'grid'

export interface LayoutConfig {
  mode: LayoutMode
  containerW: number
  containerH: number
  scrollOffset: number // In pixels
  items: Card[]
}

export interface CardLayout {
  x: number
  y: number
  width: number
  height: number
  scale: number
  opacity: number
  zIndex: number
  rotation?: number
}

export interface LayoutResult {
  layoutMap: Map<number, CardLayout>
  activeSetIds: Set<number>
  contentSize: { width: number; height: number }
}

// Constants
const CARD_SIZE = 200
const GAP = 16

export function useTactileLayout(config: LayoutConfig): LayoutResult {
  const { mode, containerW, containerH, scrollOffset, items } = config

  const layoutMap = new Map<number, CardLayout>()
  const activeSetIds = new Set<number>()
  let contentWidth = 0
  let contentHeight = 0

  // Early return if no items
  if (items.length === 0) {
    return { layoutMap, activeSetIds, contentSize: { width: 0, height: 0 } }
  }

  switch (mode) {
    case 'stack': {
      // Stack Logic
      // scrollOffset maps to "card index" (100px = 1 card depth)
      // But we treat it as pixels externally.
      // Let's say 100px per card for scrolling.
      const pixelsPerCard = 50
      const totalCards = items.length
      
      // Center of container
      const centerX = containerW / 2 - CARD_SIZE / 2
      const centerY = containerH / 2 - CARD_SIZE / 2

      items.forEach((item, index) => {
        // Calculate "depth" relative to scroll
        // If scrollOffset is 0, card 0 is at depth 0.
        // If scrollOffset is 100 (pixelsPerCard * 2), card 2 is at depth 0.
        const effectiveScrollIndex = scrollOffset / pixelsPerCard
        const depth = index - effectiveScrollIndex

        // We only render cards from slightly "behind" the view (negative depth) to some distance "ahead"
        // Or rather, typical stack: top card is 0, behind is 1, 2, 3...
        // If we scroll "down", we peel off cards.
        // So, "current top" is at index = scrollOffset / pixelsPerCard.
        
        // For this prototype, let's stick to the plan's "static" stack first, 
        // but with the index offset by scroll.
        
        // If depth is negative (it's been scrolled past/above), we push it up/out
        // If depth is positive, it's in the stack waiting to come up.
        
        let yOffset = 0
        let scale = 1
        let opacity = 1
        let zIndex = totalCards - index
        
        if (depth < 0) {
           // Card is "peeled off" - moves up and fades
           // depth is -1.5 -> 1.5 items peeled off
           yOffset = depth * 200 // Fly up
           opacity = 1 + (depth * 0.5) // Fade out quickly
           scale = 1
           zIndex = totalCards + Math.abs(depth) // Peeling off goes on top? or below? Usually on top if lifting.
        } else {
           // Card is in stack
           // depth 0 = top
           // depth 1 = 2nd
           yOffset = depth * -7 // 7px offset per card (as per plan)
           scale = Math.pow(0.915, depth)
           opacity = Math.exp(-0.1 * depth) // Plan said -0.8 but that's very fast falloff. Let's try slower.
           zIndex = totalCards - index
        }

        // Cap visibility for performance/sanity
        if (opacity < 0.05) return

        layoutMap.set(item.id, {
            x: centerX,
            y: centerY + yOffset,
            width: CARD_SIZE,
            height: CARD_SIZE,
            scale,
            opacity,
            zIndex: Math.floor(zIndex),
            rotation: 0
        })
        
        // Simple active set: if visible
        if (opacity > 0.01) activeSetIds.add(item.id)
      })
      
      contentHeight = totalCards * pixelsPerCard + containerH
      contentWidth = containerW
      break
    }

    case 'row': {
      // Horizontal Row
      // scrollOffset is pixels
      const startX = 0 // or centered? Let's start at 0 for now or center if few items.
      
      const centerY = containerH / 2 - CARD_SIZE / 2
      
      items.forEach((item, index) => {
        const x = index * (CARD_SIZE + GAP) - scrollOffset
        const y = centerY
        
        // Virtualization check (horizontal)
        if (x + CARD_SIZE < -100 || x > containerW + 100) {
            // Off screen
            return
        }

        layoutMap.set(item.id, {
            x: index * (CARD_SIZE + GAP) - scrollOffset,
            y,
            width: CARD_SIZE,
            height: CARD_SIZE,
            scale: 1,
            opacity: 1,
            zIndex: index,
        })
        activeSetIds.add(item.id)
      })

      contentWidth = items.length * (CARD_SIZE + GAP)
      contentHeight = containerH
      break
    }

    case 'column': {
        const centerX = containerW / 2 - CARD_SIZE / 2
        
        items.forEach((item, index) => {
            // Larger gap for column (chat style)
            const colGap = GAP * 4
            const y = index * (CARD_SIZE + colGap) - scrollOffset
            
            // Virtualization check
            if (y + CARD_SIZE < -100 || y > containerH + 100) return

            layoutMap.set(item.id, {
                x: centerX,
                y,
                width: CARD_SIZE,
                height: CARD_SIZE,
                scale: 1,
                opacity: 1,
                zIndex: index
            })
            activeSetIds.add(item.id)
        })
        contentHeight = items.length * (CARD_SIZE + GAP * 4)
        contentWidth = containerW
        break
    }

    case 'grid': {
        const cols = Math.max(1, Math.floor((containerW + GAP) / (CARD_SIZE + GAP)))
        const centerXOffset = (containerW - (cols * CARD_SIZE + (cols - 1) * GAP)) / 2

        items.forEach((item, index) => {
            const col = index % cols
            const row = Math.floor(index / cols)
            
            const x = centerXOffset + col * (CARD_SIZE + GAP)
            const y = row * (CARD_SIZE + GAP) - scrollOffset

            // Virtualization check
            if (y + CARD_SIZE < -100 || y > containerH + 100) return

            layoutMap.set(item.id, {
                x,
                y,
                width: CARD_SIZE,
                height: CARD_SIZE,
                scale: 1,
                opacity: 1,
                zIndex: index
            })
            activeSetIds.add(item.id)
        })
        
        const rows = Math.ceil(items.length / cols)
        contentHeight = rows * (CARD_SIZE + GAP)
        contentWidth = containerW
        break
    }
  }

  return { layoutMap, activeSetIds, contentSize: { width: contentWidth, height: contentHeight } }
}

