export type TilingOrientation = 'row' | 'column'

export interface RectLike {
  x: number
  y: number
  w: number
  h: number
}

export function rectEquals(a: RectLike | null | undefined, b: RectLike | null | undefined): boolean {
  if (!a || !b) return !a && !b
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

export interface TilingCaps {
  /** Maximum additional horizontal grid steps to check in the anchor row (beyond the primary slot). */
  horizontalSteps: number
  /** Maximum number of rows to drop below the anchor when searching (row orientation). */
  rowDrops: number
  /** Maximum additional vertical grid steps to check in the anchor column (beyond the primary slot). */
  verticalSteps: number
  /** Maximum number of columns to scan to the right of the anchor (column orientation). */
  columnSteps: number
}

export interface TilingParams {
  grid: number
  gap: number
  caps?: Partial<TilingCaps>
}

export interface AnchorInfo {
  /** Page-space axis-aligned bounding box of the anchor. */
  aabb: RectLike
  orientation: TilingOrientation
}

export interface TileSize {
  w: number
  h: number
}

export interface TileCandidate extends RectLike {
  /** Identifier describing how the candidate was generated (primary, fallback, sweep, etc). */
  source: 'primary-right' | 'primary-below' | 'primary-column' | 'primary-row' | 'row-sweep' | 'row-drop' | 'column-sweep' | 'column-step'
}

export interface CandidateGenerationOptions {
  anchor: AnchorInfo
  tileSize: TileSize
  params: TilingParams
}

export const DEFAULT_TILING_CAPS: TilingCaps = {
  horizontalSteps: 12,
  rowDrops: 4,
  verticalSteps: 12,
  columnSteps: 4,
}

export function resolveCaps(partial?: Partial<TilingCaps>): TilingCaps {
  if (!partial) return DEFAULT_TILING_CAPS
  return {
    horizontalSteps: partial.horizontalSteps ?? DEFAULT_TILING_CAPS.horizontalSteps,
    rowDrops: partial.rowDrops ?? DEFAULT_TILING_CAPS.rowDrops,
    verticalSteps: partial.verticalSteps ?? DEFAULT_TILING_CAPS.verticalSteps,
    columnSteps: partial.columnSteps ?? DEFAULT_TILING_CAPS.columnSteps,
  }
}

export function getOrientationFromSize(w: number, h: number): TilingOrientation {
  return w >= h ? 'row' : 'column'
}

