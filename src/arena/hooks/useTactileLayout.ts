import type { Card } from '../types'
import { calculateReferenceDimensions } from '../../arena/layout'
import type { LayoutMode } from '../layoutConfig'

export type { LayoutMode }

export interface LayoutItem {
  id: string
  aspect: number
  arenaId: number
}

export interface LayoutConfig {
  mode: LayoutMode
  containerW: number
  containerH: number
  scrollOffset: number // In pixels
  items: LayoutItem[]
  isFocusMode?: boolean
  focusedCardId?: string
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
  layoutMap: Map<string, CardLayout>
  contentSize: { width: number; height: number }
}

// Constants
const GAP = 16
const GRID_COLUMN_WIDTH = 128
const GRID_SIDE_PADDING = GRID_COLUMN_WIDTH * 0.5
export const STACK_SCROLL_STRIDE = 50
const LAYOUT_EDGE_PADDING = 64
const CHAT_METADATA_MIN_WIDTH = 216

// Configuration for the "tactile pile" scatter
const MINI_SCATTER = {
  x: 56,
  y: 64,
  rotation: 24,
}

const STACK_SCATTER = {
  x: 24,
  y: 12,
  rotation: 4,
}

// Global cache for normalized scatter values (-1 to 1)
// This ensures we only calculate the "chaos" for a card once in its lifetime
const SCATTER_CACHE = new Map<number, { nx: number; ny: number; nr: number }>()

function getNormalizedScatter(id: number) {
  let cached = SCATTER_CACHE.get(id)
  if (cached) return cached

  // Extremely simple, non-trig deterministic hashing
  // Uses primes to ensure variety across X, Y, and Rotation
  const nx = ((id * 4967) % 100) / 50 - 1
  const ny = ((id * 6551) % 100) / 50 - 1
  const nr = ((id * 9857) % 100) / 50 - 1

  cached = { nx, ny, nr }
  SCATTER_CACHE.set(id, cached)
  return cached
}

function getAspect(item: LayoutItem): number {
  return item.aspect || 1
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
  let { mode, containerW, containerH, scrollOffset, items, isFocusMode, focusedCardId } = config

  // Dynamic breakpoint: if grid would only have 1 column based on constants, simplify to column mode
  if (mode === 'grid') {
    const innerW = Math.max(0, containerW - GRID_SIDE_PADDING * 2)
    const cols = Math.max(1, Math.floor((innerW + GAP) / (GRID_COLUMN_WIDTH + GAP)))
    if (cols === 1) mode = 'column'
  }

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
  
  const layoutMap = new Map<string, CardLayout>()
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
          ? fitWithinViewport(getAspect(item), containerW, containerH, 0.90, 0.70)
          : fitWithinSquare(getAspect(item), CARD_SIZE)
        const effectiveScrollIndex = scrollOffset / pixelsPerCard
        const depth = index - effectiveScrollIndex

        let yOffset = 0
        let scale = 1
        let opacity = 1
        let zIndex = totalCards - index

        const absDepth = Math.abs(depth)
        const depthSign = depth < 0 ? -1 : 1

        if (isFocusMode) {
          yOffset = -depthSign * absDepth * 4
          scale = Math.pow(0.85, absDepth)
          opacity = depth < 0 ? 0 : Math.exp(-1.95 * absDepth)
        } else {
          yOffset = -depthSign * absDepth * 7
          scale = Math.pow(0.915, absDepth)
          opacity = depth < 0 ? 0 : Math.exp(-0.55 * absDepth)
        }

        if (depth < 0) {
          zIndex = -1 - Math.ceil(absDepth)
        }

        let x = centerX - fittedWidth / 2
        let y = centerY - fittedHeight / 2 + yOffset
        let rotation = 0

        // Apply a deterministic "scatter" to create a tactile pile look in stack and mini modes
        // We skip this in focus mode to keep the active card clean and readable
        if ((mode === 'stack' || mode === 'mini') && !isFocusMode) {
          const seed = item.arenaId || index
          const { nx, ny, nr } = getNormalizedScatter(seed)
          
          const config = mode === 'mini' ? MINI_SCATTER : STACK_SCATTER
          
          x += nx * config.x
          y += ny * config.y
          rotation = nr * config.rotation
        }

        layoutMap.set(item.id, {
            x,
            y,
            width: fittedWidth,
            height: fittedHeight,
            scale,
            opacity,
            zIndex: Math.floor(zIndex),
            rotation
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
        const aspect = getAspect(item)
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

        // Metadata visibility
        const showMetadata = mode === 'column' && containerW >= CHAT_METADATA_MIN_WIDTH
        const colGap = containerW >= CHAT_METADATA_MIN_WIDTH ? GAP * 4 : GAP

        let currentY = LAYOUT_EDGE_PADDING - scrollOffset
        let totalHeight = 0

        items.forEach((item, index) => {
          const aspect = getAspect(item)
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
            showMetadata
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
            const aspect = getAspect(item)
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
