export type LayoutMode = 'mini' | 'stack' | 'row' | 'column' | 'tab' | 'vtab' | 'grid'

// Threshold constants for layout mode selection
export const LAYOUT_THRESHOLDS = {
  // Mini: small shapes where full layouts don't make sense
  MINI_MAX_SIDE: 104,

  // Aspect ratio boundaries
  SQUARE_MIN: 0.85,
  SQUARE_MAX: 1.15,
  ROW_AR: 1.6,
  COL_AR: 0.625,

  // Tab modes: very short/wide or narrow/tall
  TABS_MAX_HEIGHT: 40,
  TABS_MIN_AR: 2.0,
  VTABS_MAX_WIDTH: 60,
  VTABS_MAX_AR: 0.4,

  // Grid mode: large squarish canvases
  GRID_MIN_SIDE: 260,
  GRID_AR_MIN: 0.6,
  GRID_AR_MAX: 1.6,
} as const

export function selectLayoutMode(width: number, height: number): LayoutMode {
  const ar = width / Math.max(1, height)

  // Safety First: If any dimension is smaller than the tactile floor (56px),
  // force a minimized mode to prevent cards from bleeding out.
  const TACTILE_FLOOR = 56
  if (width < TACTILE_FLOOR || height < TACTILE_FLOOR) {
    if (width < TACTILE_FLOOR && height < TACTILE_FLOOR) return 'mini'
    if (width < TACTILE_FLOOR) return 'vtab'
    return 'tab'
  }

  const isSmall = width <= LAYOUT_THRESHOLDS.MINI_MAX_SIDE || height <= LAYOUT_THRESHOLDS.MINI_MAX_SIDE

  // Check for tab modes first (explicit ribbon states)
  if (height <= LAYOUT_THRESHOLDS.TABS_MAX_HEIGHT && ar >= LAYOUT_THRESHOLDS.TABS_MIN_AR) {
    return 'tab'
  }

  if (width <= LAYOUT_THRESHOLDS.VTABS_MAX_WIDTH && ar <= LAYOUT_THRESHOLDS.VTABS_MAX_AR) {
    return 'vtab'
  }

  // Mini mode for small shapes (unless already caught by tab/vtab)
  if (isSmall) {
    if (LAYOUT_THRESHOLDS.SQUARE_MIN <= ar && ar <= LAYOUT_THRESHOLDS.SQUARE_MAX) {
      return 'mini'
    } else if (ar >= LAYOUT_THRESHOLDS.ROW_AR) {
      return 'row'
    } else if (ar <= LAYOUT_THRESHOLDS.COL_AR) {
      return 'column'
    } else {
      return 'mini'
    }
  }

  // Grid mode for large squarish shapes
  if (
    width >= LAYOUT_THRESHOLDS.GRID_MIN_SIDE &&
    height >= LAYOUT_THRESHOLDS.GRID_MIN_SIDE &&
    ar >= LAYOUT_THRESHOLDS.GRID_AR_MIN &&
    ar <= LAYOUT_THRESHOLDS.GRID_AR_MAX
  ) {
    return 'grid'
  }

  // Standard aspect-ratio routing
  if (ar >= LAYOUT_THRESHOLDS.ROW_AR) {
    return 'row'
  } else if (ar <= LAYOUT_THRESHOLDS.COL_AR) {
    return 'column'
  } else {
    return 'stack'
  }
}
