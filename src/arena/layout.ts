// Centralized layout selection and reference dimension helpers for Arena Deck

export type LayoutMode = 'mini' | 'stack' | 'row' | 'column' | 'tab' | 'vtab' | 'grid'

export interface ReferenceDimensions {
  cardW: number
  cardH: number
  layoutMode: LayoutMode
}

export const LAYOUT_CONSTANTS = {
  // Mini if small in any dimension
  MINI_MAX_SIDE: 128,

  SQUARE_MIN: 0.85,
  SQUARE_MAX: 1.15,

  ROW_AR: 1.6,
  COL_AR: 0.625,
  
  // Tabs when very short but wide
  TABS_MAX_HEIGHT: 40,
  TABS_MIN_AR: 2.0,
  // Horizontal tabs when very narrow but tall
  HTABS_MAX_WIDTH: 60,
  HTABS_MAX_AR: 0.4,
  // Grid for large squarish canvases (supersedes stack)
  GRID_MIN_SIDE: 260,
  GRID_AR_MIN: 0.6,
  GRID_AR_MAX: 1.6,

  // Tactile constraints
  MIN_CARD_SIZE: 56,
  MAX_CARD_SIZE: 128,
} as const

export const snapToGrid = (value: number, gridSize: number): number => {
  return Math.round(value / gridSize) * gridSize
}

export const getGridSize = (): number => {
  return 8
}

// Centralized tiling parameters for consistent grid behavior across the app
export const TILING_CONSTANTS = {
  grid: getGridSize(),
  gap: getGridSize(), // 16 - twice the base grid for better spacing
  pageGap: getGridSize() * 4, // Same as gap by default
  minWidth: getGridSize() * 12,
  minHeight: getGridSize() * 12,
} as const

export function selectLayoutMode(width: number, height: number): LayoutMode {
  const ar = width / Math.max(1, height)
  const isSmall = width <= LAYOUT_CONSTANTS.MINI_MAX_SIDE || height <= LAYOUT_CONSTANTS.MINI_MAX_SIDE

  // Very short but wide → tab
  if (height <= LAYOUT_CONSTANTS.TABS_MAX_HEIGHT && ar >= LAYOUT_CONSTANTS.TABS_MIN_AR) {
    return 'tab'
  }

  // Very narrow but tall → vtab
  if (width <= LAYOUT_CONSTANTS.HTABS_MAX_WIDTH && ar <= LAYOUT_CONSTANTS.HTABS_MAX_AR) {
    return 'vtab'
  }

  // Small shapes: route by aspect ratio to prevent stack from appearing
  if (isSmall) {
    if (ar >= LAYOUT_CONSTANTS.SQUARE_MIN && ar <= LAYOUT_CONSTANTS.SQUARE_MAX) {
      return 'mini'
    } else if (ar >= LAYOUT_CONSTANTS.ROW_AR) {
      return 'row'
    } else if (ar <= LAYOUT_CONSTANTS.COL_AR) {
      return 'column'
    } else {
      // Small shapes in the "gap" ranges - default to mini to prevent stack
      return 'mini'
    }
  }

  // Large and roughly square → grid (supersedes stack)
  if (
    width >= LAYOUT_CONSTANTS.GRID_MIN_SIDE &&
    height >= LAYOUT_CONSTANTS.GRID_MIN_SIDE &&
    ar >= LAYOUT_CONSTANTS.GRID_AR_MIN &&
    ar <= LAYOUT_CONSTANTS.GRID_AR_MAX
  ) {
    return 'grid'
  }

  // Wide aspect ratio → row
  if (ar >= LAYOUT_CONSTANTS.ROW_AR) {
    return 'row'
  }

  // Tall aspect ratio → column
  if (ar <= LAYOUT_CONSTANTS.COL_AR) {
    return 'column'
  }

  // Default fallback → stack
  return 'stack'
}

export function calculateReferenceDimensions(
  containerWidth: number,
  containerHeight: number,
  targetLayoutMode?: LayoutMode
): ReferenceDimensions {
  const vw = containerWidth
  const vh = containerHeight

  const layoutMode = targetLayoutMode ?? selectLayoutMode(vw, vh)

  // Square stage size (deck area) with scrubber reserved height in stack mode
  const scrubberHeight = 48
  const availableH = layoutMode === 'stack' ? Math.max(0, vh - scrubberHeight) : vh
  const stageSide = Math.max(0, layoutMode === 'stack' ? availableH : Math.min(vw, vh))

  // Calculate card dimensions (mirrors Deck)
  // Standard tactile floor is 56px, but minimized modes (mini, tab, vtab) can scale smaller to avoid bleed
  const isMinimized = layoutMode === 'mini' || layoutMode === 'tab' || layoutMode === 'vtab'
  const minSize = isMinimized ? 8 : LAYOUT_CONSTANTS.MIN_CARD_SIZE
  const rawCardW = Math.min(LAYOUT_CONSTANTS.MAX_CARD_SIZE, Math.max(minSize, stageSide * 0.75))
  
  const cardW = rawCardW
  const cardH = cardW

  return { cardW, cardH, layoutMode }
}
