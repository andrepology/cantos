import type { AnchorInfo, CandidateGenerationOptions, RectLike, TileCandidate, TilingOrientation } from './types'
import { resolveCaps } from './types'

function snapPosition(value: number, grid: number): number {
  if (grid <= 0) return value
  return Math.floor(value / grid) * grid
}

function snapSizeCeil(value: number, grid: number): number {
  if (grid <= 0) return value
  return Math.max(grid, Math.ceil(value / grid) * grid)
}

export function getSnappedAnchorAabb(anchor: AnchorInfo, grid: number): RectLike {
  const { aabb } = anchor
  return {
    x: snapPosition(aabb.x, grid),
    y: snapPosition(aabb.y, grid),
    w: snapSizeCeil(aabb.w, grid),
    h: snapSizeCeil(aabb.h, grid),
  }
}

function primaryCandidates(anchorAabb: RectLike, orientation: TilingOrientation, gap: number, tileSize: { w: number; h: number }) {
  const { w, h } = tileSize
  const right: TileCandidate = {
    source: 'primary-right',
    x: anchorAabb.x + anchorAabb.w + gap,
    y: anchorAabb.y,
    w,
    h,
  }
  const below: TileCandidate = {
    source: 'primary-below',
    x: anchorAabb.x,
    y: anchorAabb.y + anchorAabb.h + gap,
    w,
    h,
  }
  if (orientation === 'row') {
    return [right, below]
  }
  return [below, right]
}

export function* generateTileCandidates({ anchor, tileSize, params }: CandidateGenerationOptions): Generator<TileCandidate> {
  const { grid, gap, caps: partialCaps } = params
  const { orientation } = anchor
  // Use the real on-screen anchor AABB for alignment; sizes are snapped upstream
  const anchorAabb = anchor.aabb
  const anchorRight = anchorAabb.x + anchorAabb.w
  const anchorBottom = anchorAabb.y + anchorAabb.h
  const { w, h } = tileSize
  const caps = resolveCaps(partialCaps)
  for (const candidate of primaryCandidates(anchorAabb, orientation, gap, { w, h })) {
    yield candidate
  }
  if (orientation === 'row') {
    const slotStride = w + gap
    const sameRowStart = anchorRight + gap
    for (let slot = 1; slot <= caps.horizontalSteps; slot++) {
      const x = sameRowStart + (slot - 1) * slotStride
      const candidate: TileCandidate = {
        source: 'row-sweep',
        x,
        y: anchorAabb.y,
        w,
        h,
      }
      yield candidate
    }
    for (let drop = 1; drop <= caps.rowDrops; drop++) {
      const baseY = anchorBottom + gap + (drop - 1) * (h + gap)
      for (let slot = 0; slot <= caps.horizontalSteps; slot++) {
        if (drop === 1 && slot === 0) continue
        const x = anchorAabb.x + slot * slotStride
        const candidate: TileCandidate = {
          source: drop === 1 ? 'row-drop' : 'row-sweep',
          x,
          y: baseY,
          w,
          h,
        }
        yield candidate
      }
    }
  } else {
    const verticalStride = h + gap
    const downwardStart = anchorBottom + gap
    for (let slot = 1; slot <= caps.verticalSteps; slot++) {
      const y = downwardStart + (slot - 1) * verticalStride
      const candidate: TileCandidate = {
        source: 'column-sweep',
        x: anchorAabb.x,
        y,
        w,
        h,
      }
      yield candidate
    }
    const columnStride = w + gap
    for (let col = 1; col <= caps.columnSteps; col++) {
      const baseX = anchorRight + gap + (col - 1) * columnStride
      for (let slot = 0; slot <= caps.verticalSteps; slot++) {
        if (col === 1 && slot === 0) continue
        const y = anchorAabb.y + slot * verticalStride
        const candidate: TileCandidate = {
          source: col === 1 ? 'column-step' : 'column-sweep',
          x: baseX,
          y,
          w,
          h,
        }
        yield candidate
      }
    }
  }
}

export function snapCandidate(candidate: TileCandidate, grid: number): TileCandidate {
  return {
    ...candidate,
    x: snapPosition(candidate.x, grid),
    y: snapPosition(candidate.y, grid),
    w: snapSizeCeil(candidate.w, grid),
    h: snapSizeCeil(candidate.h, grid),
  }
}

