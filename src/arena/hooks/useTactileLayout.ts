import type { Card } from '../types'
import { calculateReferenceDimensions } from '../../arena/layout'
import type { LayoutMode } from '../layoutConfig'

export type { LayoutMode }

export interface LayoutConfig {
  mode: LayoutMode
  containerW: number
  containerH: number
  scrollOffset: number // In pixels
  items: Card[]
  isFocusMode?: boolean
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
  contentSize: { width: number; height: number }
}

// Constants
const GAP = 16

// Pure function for layout calculation - reusable by scroll restoration
export function calculateLayout(config: LayoutConfig): LayoutResult {
  const { mode, containerW, containerH, scrollOffset, items, isFocusMode } = config
  // For sizing, map folded modes back to their base layout family
  const sizingMode =
    mode === 'mini' ? 'stack' : mode === 'tab' ? 'row' : mode === 'vtab' ? 'column' : mode

  const { cardW: referenceCardW } = calculateReferenceDimensions(
    containerW,
    containerH,
    sizingMode as any
  )
  
  // In Focus Mode, cards scale up to 95% of the shorter viewport dimension
  // Otherwise, they use the standard responsive calculation
  const CARD_SIZE = isFocusMode 
    ? Math.min(containerW, containerH) * 0.80
    : referenceCardW
  
  const layoutMap = new Map<number, CardLayout>()
  let contentWidth = 0
  let contentHeight = 0

  // Early return if no items
  if (items.length === 0) {
    return { layoutMap, contentSize: { width: 0, height: 0 } }
  }

  switch (mode) {
    case 'mini':
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
        const effectiveScrollIndex = scrollOffset / pixelsPerCard
        const depth = index - effectiveScrollIndex

        let yOffset = 0
        let scale = 1
        let opacity = 1
        let zIndex = totalCards - index
        
        if (depth < 0) {
           // Card is "peeled off" - moves up and fades
           if (isFocusMode) {
              // Focus Mode: Aggressive cleanup
              yOffset = depth * 300 // Fly up faster
              opacity = 1 + (depth * 2.9) // Fade out much faster
              scale = Math.pow(0.98, Math.abs(depth)) // Shrink faster
           } else {
              // Regular Stack: Gentle peel
              yOffset = depth * 100 
              opacity = 1 + (depth * 2.9) 
              scale = Math.pow(0.98, Math.abs(depth))
           }
           zIndex = totalCards + Math.abs(depth) 
        } else {
           // Card is in stack
           if (isFocusMode) {
              // Focus Mode: Tight stack behind
              yOffset = depth * -16 // Tighter overlap
              scale = Math.pow(0.95, depth) // Faster recession
              opacity = Math.exp(-0.15 * depth) // Darker background
           } else {
              // Regular Stack
              yOffset = depth * -7 // 7px offset per card
              scale = Math.pow(0.915, depth)
              opacity = Math.exp(-0.45 * depth) 
           }
           zIndex = totalCards - index
        }

        

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
      })
      
      contentHeight = totalCards * pixelsPerCard + containerH
      contentWidth = containerW
      break
    }

    case 'tab':
    case 'row': {
      // Horizontal Row - apply scroll offset to X
      const centerY = containerH / 2 - CARD_SIZE / 2
      const totalCards = items.length
      
      items.forEach((item, index) => {
        const x = index * (CARD_SIZE + GAP) - scrollOffset
        const y = centerY
        const opacity = mode === 'tab' ? 0 : 1

        layoutMap.set(item.id, {
          x,
          y,
          width: CARD_SIZE,
          height: CARD_SIZE,
          scale: 1,
          opacity,
          zIndex: totalCards - index,
        })
      })

      contentWidth = items.length * (CARD_SIZE + GAP)
      contentHeight = containerH
      break
    }

    case 'vtab':
    case 'column': {
        // Vertical Column - apply scroll offset to Y
        const centerX = containerW / 2 - CARD_SIZE / 2
        const totalCards = items.length
        const colGap = GAP * 4
        
        items.forEach((item, index) => {
          const y = index * (CARD_SIZE + colGap) - scrollOffset
          const opacity = mode === 'vtab' ? 0 : 1

          layoutMap.set(item.id, {
            x: centerX,
            y,
            width: CARD_SIZE,
            height: CARD_SIZE,
            scale: 1,
            opacity,
            zIndex: totalCards - index,
          })
        })
        
        contentHeight = items.length * (CARD_SIZE + colGap)
        contentWidth = containerW
        break
    }

    case 'grid': {
        // Grid Layout - apply scroll offset to Y
        const cols = Math.max(1, Math.floor((containerW + GAP) / (CARD_SIZE + GAP)))
        const centerXOffset = (containerW - (cols * CARD_SIZE + (cols - 1) * GAP)) / 2
        const totalCards = items.length

        items.forEach((item, index) => {
            const col = index % cols
            const row = Math.floor(index / cols)
            
            const x = centerXOffset + col * (CARD_SIZE + GAP)
            const y = (row * (CARD_SIZE + GAP)) - scrollOffset

            layoutMap.set(item.id, {
                x,
                y,
                width: CARD_SIZE,
                height: CARD_SIZE,
                scale: 1,
                opacity: 1,
                zIndex: totalCards - index
            })
        })
        
        const rows = Math.ceil(items.length / cols)
        contentHeight = rows * (CARD_SIZE + GAP)
        contentWidth = containerW
        break
    }
  }

  return { layoutMap, contentSize: { width: contentWidth, height: contentHeight } }
}

export function useTactileLayout(config: LayoutConfig): LayoutResult {
  return calculateLayout(config)
}

// Helper: Get scroll bounds per mode
export function getScrollBounds(
  mode: LayoutMode,
  contentSize: { width: number; height: number },
  containerW: number,
  containerH: number,
  itemCount: number
): { min: number; max: number } {
  switch (mode) {
    case 'row':
    case 'tab':
      return {
        min: 0,
        max: Math.max(0, contentSize.width - containerW)
      }
    
    case 'column':
    case 'vtab':
    case 'grid':
      return {
        min: 0,
        max: Math.max(0, contentSize.height - containerH)
      }
    
    case 'mini':
    case 'stack':
      // Allow slight negative (peel up) and scroll through all cards
      return {
        min: -100,
        max: itemCount * 50
      }
  }
}
