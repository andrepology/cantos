import type {
  AnchorInfo,
  CandidateGenerationOptions,
  RectLike,
  TileCandidate,
  TilingMode,
  TilingOrientation,
  TilingSpiralCaps,
  TilingParams,
} from './types'
import { resolveCaps, resolveSpiralCaps } from './types'

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

export function* generateTileCandidates({ anchor, tileSize, params }: CandidateGenerationOptions, debugCollector?: { spiralPath: Array<{ x: number; y: number; order: number; valid: boolean }> }): Generator<TileCandidate> {
  const mode: TilingMode = params.mode ?? 'spiral'
  const anchorAabb = anchor.aabb

  if (mode === 'spiral') {
    yield* generateSpiralCandidates({
      anchorAabb,
      tileSize,
      params,
      spiralCaps: resolveSpiralCaps(params.spiralCaps),
      debugCollector,
    })
    return
  }

  const { gap } = params
  const { orientation } = anchor
  const { w, h } = tileSize
  const caps = resolveCaps(params.caps)
  const anchorRight = anchorAabb.x + anchorAabb.w
  const anchorBottom = anchorAabb.y + anchorAabb.h

  const primaries: TileCandidate[] = [
    {
      source: 'primary-right',
      x: anchorAabb.x + anchorAabb.w + gap,
      y: anchorAabb.y,
      w,
      h,
    },
    {
      source: 'primary-below',
      x: anchorAabb.x,
      y: anchorAabb.y + anchorAabb.h + gap,
      w,
      h,
    },
  ]

  for (const candidate of primaries) {
    yield candidate
  }

  const maxDistance = Math.max(caps.horizontalSteps, caps.verticalSteps, caps.columnSteps, caps.rowDrops)

  if (orientation === 'row') {
    for (let distance = 1; distance <= maxDistance; distance++) {
      const rightX = anchorAabb.x + anchorAabb.w + gap + (distance - 1) * (w + gap)
      yield {
        source: 'row-sweep',
        x: rightX,
        y: anchorAabb.y,
        w,
        h,
      }
      const belowY = anchorAabb.y + anchorAabb.h + gap + (distance - 1) * (h + gap)
      yield {
        source: 'row-drop',
        x: anchorAabb.x,
        y: belowY,
        w,
        h,
      }
    }
  } else {
    for (let distance = 1; distance <= maxDistance; distance++) {
      const belowY = anchorAabb.y + anchorAabb.h + gap + (distance - 1) * (h + gap)
      yield {
        source: 'column-sweep',
        x: anchorAabb.x,
        y: belowY,
        w,
        h,
      }
      const rightX = anchorAabb.x + anchorAabb.w + gap + (distance - 1) * (w + gap)
      yield {
        source: 'column-step',
        x: rightX,
        y: anchorAabb.y,
        w,
        h,
      }
    }
  }
}


interface SpiralGenerationOptions {
  anchorAabb: RectLike
  tileSize: { w: number; h: number }
  params: TilingParams
  spiralCaps: TilingSpiralCaps
  debugCollector?: { spiralPath: Array<{ x: number; y: number; order: number; valid: boolean }> }
}

function* generateSpiralCandidates({ anchorAabb, tileSize, params, spiralCaps, debugCollector }: SpiralGenerationOptions): Generator<TileCandidate> {
  const { gap } = params
  const { w, h } = tileSize
  const maxRings = Math.max(1, spiralCaps.rings)
  const maxBaseSteps = spiralCaps.maxSteps > 0 ? spiralCaps.maxSteps : Infinity
  let baseStepsEmitted = 0

  const emitOffset = (offsetX: number, offsetY: number): { candidates: TileCandidate[]; shouldContinue: boolean } => {
    const radius = Math.max(Math.abs(offsetX), Math.abs(offsetY))
    if (radius > maxRings) {
      return { candidates: [], shouldContinue: false }
    }
    if (baseStepsEmitted >= maxBaseSteps) {
      return { candidates: [], shouldContinue: false }
    }
    baseStepsEmitted += 1
    const candidates = buildSpiralCandidatesForOffset({
      anchorAabb,
      tileSize,
      gap,
      offsetX,
      offsetY,
    })

    // Collect debug data for spiral path visualization
    if (debugCollector && candidates.length > 0) {
      const candidate = candidates[0] // Use first candidate for path position
      debugCollector.spiralPath.push({
        x: candidate.x + candidate.w / 2, // Center point
        y: candidate.y + candidate.h / 2,
        order: baseStepsEmitted,
        valid: true // Will be validated later in the preview process
      })
    }

    return { candidates, shouldContinue: baseStepsEmitted < maxBaseSteps }
  }

  const initial = emitOffset(1, 0)
  for (const candidate of initial.candidates) {
    yield candidate
  }
  if (!initial.shouldContinue) return

  let offsetX = 1
  let offsetY = 0
  let ring = 1

  while (baseStepsEmitted < maxBaseSteps) {
    // Down ring times
    for (let i = 0; i < ring; i++) {
      offsetY += 1
      const result = emitOffset(offsetX, offsetY)
      for (const candidate of result.candidates) yield candidate
      if (!result.shouldContinue) return
    }
    // Left ring + 1 times
    for (let i = 0; i < ring + 1; i++) {
      offsetX -= 1
      const result = emitOffset(offsetX, offsetY)
      for (const candidate of result.candidates) yield candidate
      if (!result.shouldContinue) return
    }
    // Up ring + 1 times
    for (let i = 0; i < ring + 1; i++) {
      offsetY -= 1
      const result = emitOffset(offsetX, offsetY)
      for (const candidate of result.candidates) yield candidate
      if (!result.shouldContinue) return
    }
    // Right ring + 2 times
    for (let i = 0; i < ring + 2; i++) {
      offsetX += 1
      const result = emitOffset(offsetX, offsetY)
      for (const candidate of result.candidates) yield candidate
      if (!result.shouldContinue) return
    }
    ring += 2
  }
}

interface BuildSpiralCandidatesArgs {
  anchorAabb: RectLike
  tileSize: { w: number; h: number }
  gap: number
  offsetX: number
  offsetY: number
}

function buildSpiralCandidatesForOffset({
  anchorAabb,
  tileSize,
  gap,
  offsetX,
  offsetY,
}: BuildSpiralCandidatesArgs): TileCandidate[] {
  const { w, h } = tileSize
  const baseX = resolveSpiralX(anchorAabb, w, gap, offsetX)
  const baseY = resolveSpiralY(anchorAabb, h, gap, offsetY)

  return [
    {
      source: 'spiral',
      x: baseX,
      y: baseY,
      w,
      h,
    },
  ]
}

function resolveSpiralX(anchorAabb: RectLike, tileWidth: number, gap: number, offsetX: number): number {
  const stride = tileWidth + gap
  if (offsetX > 0) {
    return anchorAabb.x + anchorAabb.w + gap + (offsetX - 1) * stride
  }
  if (offsetX === 0) {
    return anchorAabb.x
  }
  return anchorAabb.x + offsetX * stride
}

function resolveSpiralY(anchorAabb: RectLike, tileHeight: number, gap: number, offsetY: number): number {
  const stride = tileHeight + gap
  if (offsetY > 0) {
    return anchorAabb.y + anchorAabb.h + gap + (offsetY - 1) * stride
  }
  if (offsetY === 0) {
    return anchorAabb.y
  }
  return anchorAabb.y + offsetY * stride
}

interface ComputeShrinkVariantsArgs {
  baseValue: number
  maxSteps: number
  grid: number
}

function computeShrinkVariants({ baseValue, maxSteps, grid }: ComputeShrinkVariantsArgs): number[] {
  if (maxSteps <= 0) return []
  const variants: number[] = []
  if (baseValue <= 0) return variants
  const step = grid > 0 ? grid : baseValue / (maxSteps + 1)
  const minimum = grid > 0 ? grid : Math.max(1, baseValue * 0.25)

  for (let i = 1; i <= maxSteps; i++) {
    let next = baseValue - i * step
    if (grid > 0) {
      next = Math.floor(next / grid) * grid
    }
    if (next >= baseValue) continue
    if (next < minimum) break
    const normalized = Number(next.toFixed(4))
    if (variants.length && Math.abs(variants[variants.length - 1] - normalized) < 1e-4) {
      continue
    }
    variants.push(normalized)
  }

  return variants
}

