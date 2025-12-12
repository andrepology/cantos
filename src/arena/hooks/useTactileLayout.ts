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
  focusedCardId?: number
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
  showMetadata?: boolean
}

export interface LayoutResult {
  layoutMap: Map<number, CardLayout>
  contentSize: { width: number; height: number }
}

// Constants
const GAP = 16
const GRID_COLUMN_WIDTH = 128
const GRID_SIDE_PADDING = GRID_COLUMN_WIDTH * 0.5
export const STACK_SCROLL_STRIDE = 50
const LAYOUT_EDGE_PADDING = 64
const CHAT_METADATA_MIN_WIDTH = 216

function getCardAspect(card: Card): number {
  const aspect = (card as any)?.aspect ?? (card as any)?.mockAspect
  if (aspect && Number.isFinite(aspect) && aspect > 0) return aspect
  return 1
}

function fitWithinSquare(aspect: number, size: number) {
  if (aspect >= 1) {
    return { width: size, height: size / aspect }
  }
  return { width: size * aspect, height: size }
}

function fitWithinViewport(
  aspect: number,
  containerW: number,
  containerH: number,
  maxWidthRatio: number = 0.85,
  maxHeightRatio: number = 0.85
) {
  const maxWidth = containerW * maxWidthRatio
  const maxHeight = containerH * maxHeightRatio

  if (aspect >= 1) {
    // Landscape: try to use max width, constrain by height
    let width = maxWidth
    let height = width / aspect

    if (height > maxHeight) {
      // Too tall, constrain by height instead
      height = maxHeight
      width = height * aspect
    }

    return { width, height }
  } else {
    // Portrait: try to use max height, constrain by width
    let height = maxHeight
    let width = height * aspect

    if (width > maxWidth) {
      // Too wide, constrain by width instead
      width = maxWidth
      height = width / aspect
    }

    return { width, height }
  }
}

// Pure function for layout calculation - reusable by scroll restoration
export function calculateLayout(config: LayoutConfig): LayoutResult {
  const { mode, containerW, containerH, scrollOffset, items, isFocusMode, focusedCardId } = config
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
    ? Math.min(containerW, containerH) * 0.85
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
        const { width: fittedWidth, height: fittedHeight } = isFocusMode
          ? fitWithinViewport(getCardAspect(item), containerW, containerH, 0.90, 0.70)
          : fitWithinSquare(getCardAspect(item), CARD_SIZE)
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
           
           // Push passed cards below the stack so they cannot intercept pointer events
           zIndex = -Math.abs(depth) - 1
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
      const centerY = containerH / 2 - rowHeight / 2
      const totalCards = items.length
      let currentX = LAYOUT_EDGE_PADDING - scrollOffset
      let totalWidth = 0
      
      items.forEach((item, index) => {
        const aspect = getCardAspect(item)
        const cardWidth = rowHeight * aspect
        const opacity = mode === 'tab' ? 0 : 1
        const baseZIndex = totalCards - index
        const zIndex = item.id === focusedCardId ? totalCards + 1 : baseZIndex

        layoutMap.set(item.id, {
          x: currentX,
          y: centerY,
          width: cardWidth,
          height: rowHeight,
          scale: 1,
          opacity,
          zIndex,
        })

        currentX += cardWidth + GAP
        totalWidth += cardWidth
      })

      contentWidth = LAYOUT_EDGE_PADDING + totalWidth + GAP * Math.max(0, totalCards - 1) + LAYOUT_EDGE_PADDING
      contentHeight = containerH
      break
    }

    case 'vtab':
    case 'column': {
        // Smooth transition from CARD_SIZE to wider column width to avoid discontinuity
        const TRANSITION_START = 200
        const TRANSITION_END = 300
        const growthFactor = Math.max(0, Math.min(1, (containerW - TRANSITION_START) / (TRANSITION_END - TRANSITION_START)))
        const targetWidth = Math.min(containerW * 0.6, 400) // Cap at reasonable max
        const columnWidth = CARD_SIZE + (targetWidth - CARD_SIZE) * growthFactor
        const centerX = containerW / 2 - columnWidth / 2
        const totalCards = items.length
        // Use smaller gap when metadata won't be shown (narrow containers)
        const colGap = containerW >= CHAT_METADATA_MIN_WIDTH ? GAP * 4 : GAP
        let currentY = LAYOUT_EDGE_PADDING - scrollOffset
        let totalHeight = 0

        items.forEach((item, index) => {
          const aspect = getCardAspect(item)
          const cardHeight = columnWidth / aspect
          const opacity = mode === 'vtab' ? 0 : 1
          const baseZIndex = totalCards - index
          const zIndex = item.id === focusedCardId ? totalCards + 1 : baseZIndex

          layoutMap.set(item.id, {
            x: centerX,
            y: currentY,
            width: columnWidth,
            height: cardHeight,
            scale: 1,
            opacity,
            zIndex,
            showMetadata: mode === 'column' && containerW >= CHAT_METADATA_MIN_WIDTH
          })

          currentY += cardHeight + colGap
          totalHeight += cardHeight
        })

        contentHeight = LAYOUT_EDGE_PADDING + totalHeight + colGap * Math.max(0, totalCards - 1) + LAYOUT_EDGE_PADDING
        contentWidth = containerW
        break
    }

    case 'grid': {
        const columnWidth = GRID_COLUMN_WIDTH
        const innerW = Math.max(0, containerW - GRID_SIDE_PADDING * 2)
        const cols = Math.max(1, Math.floor((innerW + GAP) / (columnWidth + GAP)))
        const usedW = cols * columnWidth + (cols - 1) * GAP
        const centerXOffset = GRID_SIDE_PADDING + Math.max(0, (innerW - usedW) / 2)
        const columnHeights = Array(cols).fill(0)
        const totalCards = items.length

        items.forEach((item, index) => {
            const aspect = getCardAspect(item)
            const cardHeight = columnWidth / aspect
            const baseZIndex = totalCards - index
            const zIndex = item.id === focusedCardId ? totalCards + 1 : baseZIndex

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
            const y = columnHeights[targetCol] + LAYOUT_EDGE_PADDING - scrollOffset

            layoutMap.set(item.id, {
                x,
                y,
                width: columnWidth,
                height: cardHeight,
                scale: 1,
                opacity: 1,
                zIndex
            })

            columnHeights[targetCol] += cardHeight + GAP
        })

        const maxColumnHeight = columnHeights.length > 0 ? Math.max(...columnHeights) : 0
        contentHeight = LAYOUT_EDGE_PADDING + Math.max(0, maxColumnHeight - GAP) + LAYOUT_EDGE_PADDING
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
