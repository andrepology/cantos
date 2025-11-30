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
const GRID_COLUMN_WIDTH = 128
const GRID_MIN_HEIGHT_MULT = 0.65
const GRID_MAX_HEIGHT_MULT = 1.8
const ROW_WIDTH_MIN_MULT = 0.65
const ROW_WIDTH_MAX_MULT = 1.8
const COLUMN_HEIGHT_MIN_MULT = 0.65
const COLUMN_HEIGHT_MAX_MULT = 1.8
export const STACK_SCROLL_STRIDE = 50

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function getCardAspect(card: Card): number {
  const aspect = (card as any)?.mockAspect
  if (aspect && Number.isFinite(aspect) && aspect > 0) return aspect
  return 1
}

function fitWithinSquare(aspect: number, size: number) {
  if (aspect >= 1) {
    const height = clamp(size / aspect, size * 0.4, size * 1.6)
    return { width: size, height }
  }
  const width = clamp(size * aspect, size * 0.4, size * 1.6)
  return { width, height: size }
}

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
      const pixelsPerCard = STACK_SCROLL_STRIDE
      const totalCards = items.length
      const centerX = containerW / 2
      const centerY = containerH / 2

      items.forEach((item, index) => {
        const { width: fittedWidth, height: fittedHeight } = fitWithinSquare(getCardAspect(item), CARD_SIZE)
        const effectiveScrollIndex = scrollOffset / pixelsPerCard
        const depth = index - effectiveScrollIndex

        let yOffset = 0
        let scale = 1
        let opacity = 1
        let zIndex = totalCards - index
        
        if (depth < 0) {
           // Past cards: Fly "forward" past the camera
           // Gentle scale up (1.0 -> 1.2 max) prevents "explosion" artifacts
           // Capped at 1.2 to ensure they don't occlude the entire view if opacity lingers
           scale = Math.min(1.2, 1 + Math.abs(depth) * 0.05)
           
           // Fade out over ~5 cards distance so we can see them flying in
           opacity = Math.max(0, 1 - Math.abs(depth) * 1.2)
           
           // Continue motion path: move "down" (positive Y) as they pass
           // Soft clamp ensures they don't fly infinitely far, but maintain continuous motion
           const parallaxSpeed = isFocusMode ? -60 : -45
           const targetY = depth * parallaxSpeed
           // Soft limit to keeping them within ~1 screen height
           const limit = containerH * 0.9
           yOffset = targetY / (1 + Math.abs(targetY) / limit)
           
           // Ensure they render on top
           zIndex = totalCards + 100 + Math.abs(depth)
        } else {
           if (isFocusMode) {
              yOffset = depth * -4
              scale = Math.pow(0.65, depth)
              opacity = Math.exp(-0.15 * depth)
           } else {
              yOffset = depth * -7
              scale = Math.pow(0.915, depth)
              opacity = Math.exp(-0.45 * depth)
           }
           zIndex = totalCards - index
        }

        layoutMap.set(item.id, {
            x: centerX - fittedWidth / 2,
            y: centerY - fittedHeight / 2 + yOffset,
            width: fittedWidth,
            height: fittedHeight,
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
      const rowHeight = CARD_SIZE
      const minWidth = rowHeight * ROW_WIDTH_MIN_MULT
      const maxWidth = rowHeight * ROW_WIDTH_MAX_MULT
      const centerY = containerH / 2 - rowHeight / 2
      const totalCards = items.length
      let currentX = -scrollOffset
      let totalWidth = 0
      
      items.forEach((item, index) => {
        const aspect = getCardAspect(item)
        const cardWidth = clamp(rowHeight * aspect, minWidth, maxWidth)
        const opacity = mode === 'tab' ? 0 : 1

        layoutMap.set(item.id, {
          x: currentX,
          y: centerY,
          width: cardWidth,
          height: rowHeight,
          scale: 1,
          opacity,
          zIndex: totalCards - index,
        })

        currentX += cardWidth + GAP
        totalWidth += cardWidth
      })

      contentWidth = totalWidth + GAP * Math.max(0, totalCards - 1)
      contentHeight = containerH
      break
    }

    case 'vtab':
    case 'column': {
        const columnWidth = CARD_SIZE
        const minHeight = columnWidth * COLUMN_HEIGHT_MIN_MULT
        const maxHeight = columnWidth * COLUMN_HEIGHT_MAX_MULT
        const centerX = containerW / 2 - columnWidth / 2
        const totalCards = items.length
        const colGap = GAP * 4
        let currentY = -scrollOffset
        let totalHeight = 0
        
        items.forEach((item, index) => {
          const aspect = getCardAspect(item)
          const cardHeight = clamp(columnWidth / aspect, minHeight, maxHeight)
          const opacity = mode === 'vtab' ? 0 : 1

          layoutMap.set(item.id, {
            x: centerX,
            y: currentY,
            width: columnWidth,
            height: cardHeight,
            scale: 1,
            opacity,
            zIndex: totalCards - index,
          })

          currentY += cardHeight + colGap
          totalHeight += cardHeight
        })
        
        contentHeight = totalHeight + colGap * Math.max(0, totalCards - 1)
        contentWidth = containerW
        break
    }

    case 'grid': {
        const columnWidth = GRID_COLUMN_WIDTH
        const cols = Math.max(1, Math.floor((containerW + GAP) / (columnWidth + GAP)))
        const centerXOffset = (containerW - (cols * columnWidth + (cols - 1) * GAP)) / 2
        const columnHeights = Array(cols).fill(0)
        const minCardHeight = columnWidth * GRID_MIN_HEIGHT_MULT
        const maxCardHeight = columnWidth * GRID_MAX_HEIGHT_MULT
        const totalCards = items.length

        items.forEach((item, index) => {
            const aspect = getCardAspect(item)
            const unclampedHeight = columnWidth / aspect
            const cardHeight = clamp(unclampedHeight, minCardHeight, maxCardHeight)

            let targetCol = 0
            if (cols > 1) {
              let smallestHeight = columnHeights[0]
              for (let c = 1; c < cols; c++) {
                if (columnHeights[c] < smallestHeight) {
                  smallestHeight = columnHeights[c]
                  targetCol = c
                }
              }
            }

            const x = centerXOffset + targetCol * (columnWidth + GAP)
            const y = columnHeights[targetCol] - scrollOffset

            layoutMap.set(item.id, {
                x,
                y,
                width: columnWidth,
                height: cardHeight,
                scale: 1,
                opacity: 1,
                zIndex: totalCards - index
            })

            columnHeights[targetCol] += cardHeight + GAP
        })

        const maxColumnHeight = columnHeights.length > 0 ? Math.max(...columnHeights) : 0
        contentHeight = Math.max(0, maxColumnHeight - GAP)
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
        max: itemCount * STACK_SCROLL_STRIDE
      }
  }
}
