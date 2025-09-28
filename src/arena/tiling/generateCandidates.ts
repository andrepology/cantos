import type { AnchorInfo, CandidateGenerationOptions, RectLike, TileCandidate } from './types'
import { resolveCaps } from './types'

function snap(value: number, grid: number) {
  if (grid <= 0) return value
  return Math.round(value / grid) * grid
}

function snapRect(rect: RectLike, grid: number): RectLike {
  return {
    x: snap(rect.x, grid),
    y: snap(rect.y, grid),
    w: snap(rect.w, grid),
    h: snap(rect.h, grid),
  }
}

function primaryCandidates(anchor: AnchorInfo, gap: number, tileSize: RectLike) {
  const { aabb, orientation } = anchor
  const { w, h } = tileSize
  const right: TileCandidate = {
    source: 'primary-right',
    x: aabb.x + aabb.w + gap,
    y: aabb.y,
    w,
    h,
  }
  const below: TileCandidate = {
    source: 'primary-below',
    x: aabb.x,
    y: aabb.y + aabb.h + gap,
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
  const { orientation, aabb } = anchor
  const { w, h } = tileSize
  const caps = resolveCaps(partialCaps)
  for (const candidate of primaryCandidates(anchor, gap, tileSize)) {
    const snapped = snapRect(candidate, grid)
    yield { ...candidate, ...snapped }
  }
  if (orientation === 'row') {
    for (let step = 0; step <= caps.horizontalSteps; step++) {
      const x = aabb.x + step * grid
      const y = aabb.y
      const candidate: TileCandidate = {
        source: 'row-sweep',
        x,
        y,
        w,
        h,
      }
      const snapped = snapRect(candidate, grid)
      yield { ...candidate, ...snapped }
    }
    for (let drop = 1; drop <= caps.rowDrops; drop++) {
      const baseY = aabb.y + drop * (h + gap)
      for (let step = 0; step <= caps.horizontalSteps; step++) {
        const x = aabb.x + step * grid
        const candidate: TileCandidate = {
          source: drop === 1 ? 'row-drop' : 'row-sweep',
          x,
          y: baseY,
          w,
          h,
        }
        const snapped = snapRect(candidate, grid)
        yield { ...candidate, ...snapped }
      }
    }
  } else {
    for (let step = 0; step <= caps.verticalSteps; step++) {
      const y = aabb.y + step * grid
      const x = aabb.x
      const candidate: TileCandidate = {
        source: 'column-sweep',
        x,
        y,
        w,
        h,
      }
      const snapped = snapRect(candidate, grid)
      yield { ...candidate, ...snapped }
    }
    for (let col = 1; col <= caps.columnSteps; col++) {
      const baseX = aabb.x + col * (w + gap)
      for (let step = 0; step <= caps.verticalSteps; step++) {
        const candidate: TileCandidate = {
          source: col === 1 ? 'column-step' : 'column-sweep',
          x: baseX,
          y: aabb.y + step * grid,
          w,
          h,
        }
        const snapped = snapRect(candidate, grid)
        yield { ...candidate, ...snapped }
      }
    }
  }
}

export function snapCandidate(candidate: TileCandidate, grid: number): TileCandidate {
  const snapped = snapRect(candidate, grid)
  return { ...candidate, ...snapped }
}

