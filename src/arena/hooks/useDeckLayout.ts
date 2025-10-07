import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { LayoutMode, ReferenceDimensions } from '../layout'
import { calculateReferenceDimensions, getGridSize, selectLayoutMode, snapToGrid } from '../layout'

export interface UseDeckLayoutOptions {
  width: number
  height: number
  referenceDimensions?: ReferenceDimensions
}

export interface UseDeckLayoutResult {
  layoutMode: LayoutMode
  vw: number
  vh: number
  gridSize: number
  snapToGrid: (value: number) => number
  stageSide: number
  scrubberHeight: number
  stackStageOffset: number
  cardW: number
  cardH: number
  spacerW: number
  spacerH: number
  paddingRowTB: number
  paddingRowLR: number
  paddingColTB: number
  paddingColLR: number
  tabHeight: number
  paddingTabsTB: number
  paddingTabsLR: number
  tabGap: number
  htabWidth: number
  paddingHTabsTB: number
  paddingHTabsLR: number
  htabGap: number
  miniDesignSide: number
  miniScale: number
}

export function useDeckLayout({
  width,
  height,
  referenceDimensions
}: UseDeckLayoutOptions): UseDeckLayoutResult {
  // Debounce incoming size to reduce re-layout jitter during resize
  const [vw, setVw] = useState(width)
  const [vh, setVh] = useState(height)
  useEffect(() => {
    const id = setTimeout(() => {
      setVw(width)
      setVh(height)
    }, 80)
    return () => clearTimeout(id)
  }, [width, height])

  const gridSize = getGridSize()
  const snapToGridFn = useCallback((value: number) => snapToGrid(value, gridSize), [gridSize])

  const layoutMode = useMemo(() => selectLayoutMode(vw, vh), [vw, vh])

  // Square stage size (deck area) with scrubber reserved height in stack mode
  const scrubberHeight = 48
  const stackStageOffset = 24
  const stageSide = useMemo(() => {
    const availableH = layoutMode === 'stack' ? Math.max(0, vh - scrubberHeight) : vh
    return Math.max(0, Math.min(vw, availableH))
  }, [vw, vh, layoutMode])

  // Mini mode: render at a comfortable design size and scale to fit
  const miniDesignSide = 280
  const miniScale = useMemo(() => {
    if (layoutMode !== 'mini') return 1
    const scale = Math.min(vw / Math.max(1, miniDesignSide), vh / Math.max(1, miniDesignSide))
    return Math.max(0.45, Math.min(1, scale))
  }, [layoutMode, vw, vh])

  // Base per-card bounding size inside the stage (square) - snapped to grid
  // Use reference dimensions if provided (for cross-shape coordination), otherwise calculate from container
  const baseCardDimensions = referenceDimensions || calculateReferenceDimensions(width, height, layoutMode)

  // Apply layout-aware dimension coordination
  let cardW = baseCardDimensions.cardW
  let cardH = baseCardDimensions.cardH

  if (referenceDimensions && layoutMode !== baseCardDimensions.layoutMode) {
    // We're using reference dimensions from a different layout mode
    // Apply layout-specific coordination rules
    if (layoutMode === 'row' && baseCardDimensions.layoutMode === 'stack') {
      // Row mode: maintain square aspect ratio by using deck's dimensions for both W and H
      cardW = baseCardDimensions.cardH // Use deck's height for both dimensions (square)
      cardH = baseCardDimensions.cardH // Use deck's height for both dimensions (square)
    } else if (layoutMode === 'column' && baseCardDimensions.layoutMode === 'stack') {
      // Column mode: match deck's card width, maintain square aspect ratio for non-images
      cardW = baseCardDimensions.cardW // Match deck's width
      cardH = cardW // Maintain square aspect ratio for channels and text cards
    }
    // For stack/mini modes, use the reference dimensions directly
  }

  // Grid mode uses compact tiles irrespective of reference dimensions
  if (layoutMode === 'grid') {
    const compact = snapToGrid(160, gridSize)
    cardW = compact
    cardH = compact
  }

  const spacerW = Math.max(0, snapToGrid(Math.round(cardW / 2), gridSize))
  const spacerH = Math.max(0, snapToGrid(Math.round(cardH / 2), gridSize))
  
  // Dynamic padding that scales with container height to prevent clipping
  const paddingScale = vh < 60 ? 0.05 : vh < 80 ? 0.08 : 0.1
  const paddingRowTB = snapToGrid(
    Math.max(2, Math.min(12, Math.round(vh * paddingScale))), 
    gridSize
  )
  const paddingRowLR = snapToGrid(12, gridSize)
  const paddingColTB = snapToGrid(24, gridSize)
  const paddingColLR = snapToGrid(24, gridSize)
  // Tabs layout sizing (compact)
  const tabHeight = snapToGrid(12, gridSize)
  const paddingTabsTB = snapToGrid(4, gridSize)
  const paddingTabsLR = snapToGrid(10, gridSize)
  const tabGap = snapToGrid(8, gridSize)
  // Horizontal tabs layout sizing (very compact)
  const htabWidth = snapToGrid(32, gridSize)
  const paddingHTabsTB = snapToGrid(4, gridSize)
  const paddingHTabsLR = snapToGrid(6, gridSize)
  const htabGap = snapToGrid(4, gridSize)

  return {
    layoutMode,
    vw,
    vh,
    gridSize,
    snapToGrid: snapToGridFn,
    stageSide,
    scrubberHeight,
    stackStageOffset,
    cardW,
    cardH,
    spacerW,
    spacerH,
    paddingRowTB,
    paddingRowLR,
    paddingColTB,
    paddingColLR,
    tabHeight,
    paddingTabsTB,
    paddingTabsLR,
    tabGap,
    htabWidth,
    paddingHTabsTB,
    paddingHTabsLR,
    htabGap,
    miniDesignSide,
    miniScale,
  }
}
