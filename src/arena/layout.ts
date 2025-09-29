// Centralized layout selection and reference dimension helpers for Arena Deck

export type LayoutMode = 'mini' | 'stack' | 'row' | 'column' | 'tabs'

export interface ReferenceDimensions {
  cardW: number
  cardH: number
  layoutMode: LayoutMode
}

export const LAYOUT_CONSTANTS = {
  // Force mini at extremely small sizes regardless of aspect
  MINI_FORCE_SIDE: 120,
  // Mini if small and roughly squareish
  MINI_MIN_SIDE: 140,
  SQUARE_MIN: 0.85,
  SQUARE_MAX: 1.15,
  ROW_AR: 1.6,
  COL_AR: 0.625,
  // Tabs when very short but wide
  TABS_MAX_HEIGHT: 96,
  TABS_MIN_AR: 2.0,
} as const

export const snapToGrid = (value: number, gridSize: number): number => {
  return Math.round(value / gridSize) * gridSize
}

export const getGridSize = (): number => {
  return 8
}

export function selectLayoutMode(width: number, height: number): LayoutMode {
  const s = Math.min(width, height)
  const ar = width / Math.max(1, height)

  // Small but wide → tabs
  if (height <= LAYOUT_CONSTANTS.TABS_MAX_HEIGHT && ar >= LAYOUT_CONSTANTS.TABS_MIN_AR) {
    return 'tabs'
  }

  // At very small sizes, always mini
  if (s <= LAYOUT_CONSTANTS.MINI_FORCE_SIDE) {
    return 'mini'
  }
  // Otherwise, small and squareish → mini
  if (s <= LAYOUT_CONSTANTS.MINI_MIN_SIDE && ar >= LAYOUT_CONSTANTS.SQUARE_MIN && ar <= LAYOUT_CONSTANTS.SQUARE_MAX) {
    return 'mini'
  }
  if (ar >= LAYOUT_CONSTANTS.ROW_AR) {
    return 'row'
  }
  if (ar <= LAYOUT_CONSTANTS.COL_AR) {
    return 'column'
  }
  return 'stack'
}

export function calculateReferenceDimensions(
  containerWidth: number,
  containerHeight: number,
  targetLayoutMode?: LayoutMode
): ReferenceDimensions {
  const gridSize = getGridSize()
  const vw = containerWidth
  const vh = containerHeight

  const layoutMode = targetLayoutMode ?? selectLayoutMode(vw, vh)

  // Square stage size (deck area) with scrubber reserved height in stack mode
  const scrubberHeight = 48
  const availableH = layoutMode === 'stack' ? Math.max(0, vh - scrubberHeight) : vh
  const stageSide = Math.max(0, Math.min(vw, availableH))

  // Calculate card dimensions (mirrors Deck)
  const rawCardW = Math.min(320, Math.max(60, stageSide * 0.75))
  const cardW = snapToGrid(rawCardW, gridSize)
  const cardH = cardW

  return { cardW, cardH, layoutMode }
}


