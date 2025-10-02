import type { Editor, TLShapeId } from 'tldraw'
import { clampCandidateToInset, isInsideInset, insetRect, rectsOverlap } from './bounds'
import { generateTileCandidates } from './generateCandidates'
import { isCandidateFree } from './validateCandidate'
import type {
  AnchorInfo,
  RectLike,
  TileCandidate,
  TileSize,
  TilingParams,
  TilingMode,
} from './types'
import { resolveCaps, resolveSpiralCaps } from './types'

export interface PreviewState {
  anchorId: TLShapeId | null
  anchor: AnchorInfo | null
  tileSize: TileSize | null
  candidate: TileCandidate | null
}

export interface PreviewParams {
  editor: Editor
  anchor: AnchorInfo
  tileSize: TileSize
  params: TilingParams
  epsilon: number
  ignoreIds?: TLShapeId[]
  pageBounds?: RectLike | null
  blockedAabbs?: RectLike[]
  debug?: boolean
  collectDebugData?: {
    spiralPath: Array<{ x: number; y: number; order: number; valid: boolean }>
    collisionBoxes: RectLike[]
  }
}

export interface CandidateDebugSample {
  source: string
  x: number
  y: number
  w: number
  h: number
  bounded: boolean
  rejectedByBounds: boolean
  rejectedAsDuplicate: boolean
  rejectedByBlockedList: boolean
  blockingIdsCount: number
  accepted: boolean
}

export interface ComputePreviewResult {
  candidate: TileCandidate | null
  samples?: CandidateDebugSample[]
}

const MAX_FIT_ATTEMPTS = 12

export function computePreviewCandidate({ editor, anchor, tileSize, params, epsilon, ignoreIds, pageBounds, blockedAabbs = [], debug = false, collectDebugData }: PreviewParams): TileCandidate | null | ComputePreviewResult {
  const mode: TilingMode = params.mode ?? 'sweep'
  const baseCaps = resolveCaps(params.caps)
  const baseSpiralCaps = mode === 'spiral' ? resolveSpiralCaps(params.spiralCaps) : null
  const horizontalStep = Math.max(8, baseCaps.horizontalSteps)
  const verticalStep = Math.max(8, baseCaps.verticalSteps)
  const rowDropStep = Math.max(2, baseCaps.rowDrops || 1)
  const columnStep = Math.max(2, baseCaps.columnSteps || 1)
  const spiralRingStep = baseSpiralCaps ? Math.max(1, Math.floor(baseSpiralCaps.rings / 2) || 1) : 0
  const spiralStepIncrement = baseSpiralCaps ? Math.max(baseSpiralCaps.maxSteps / 6, 16) : 0
  const seen = new Set<string>()

  const expansionLevels = 6

  const samples: CandidateDebugSample[] = debug ? [] : ([] as never)

  const pageInset = insetRect(pageBounds, params.pageGap ?? params.gap)
  const minW = Math.max(1, params.minWidth ?? params.grid ?? 1)
  const minH = Math.max(1, params.minHeight ?? params.grid ?? 1)

  // Collect all shape bounds for collision visualization
  if (collectDebugData) {
    const allShapes = editor.getCurrentPageRenderingShapesSorted()
    for (const shape of allShapes) {
      if (!shape || (ignoreIds && ignoreIds.includes(shape.id))) continue
      const shapeBounds = editor.getShapePageBounds(shape)
      if (shapeBounds) {
        collectDebugData.collisionBoxes.push(shapeBounds)
      }
    }
  }

  for (let expansion = 0; expansion <= expansionLevels; expansion++) {
    const expandedCaps = {
      horizontalSteps: baseCaps.horizontalSteps + expansion * horizontalStep,
      rowDrops: baseCaps.rowDrops + expansion * rowDropStep,
      verticalSteps: baseCaps.verticalSteps + expansion * verticalStep,
      columnSteps: baseCaps.columnSteps + expansion * columnStep,
    }

    const expandedSpiralCaps = baseSpiralCaps
      ? {
          rings: baseSpiralCaps.rings + expansion * spiralRingStep,
          maxSteps: baseSpiralCaps.maxSteps + Math.floor(expansion * spiralStepIncrement),
          widthShrinkSteps: baseSpiralCaps.widthShrinkSteps,
          heightShrinkSteps: baseSpiralCaps.heightShrinkSteps,
        }
      : undefined

    const paramWithCaps: TilingParams = {
      ...params,
      caps: expandedCaps,
      spiralCaps: expandedSpiralCaps ?? params.spiralCaps,
    }

    const generator = generateTileCandidates({ anchor, tileSize, params: paramWithCaps }, collectDebugData)

    for (const candidate of generator) {
      const boundedCandidate = clampCandidateToInset(candidate, pageInset)
      if (!boundedCandidate) {
        if (debug) {
          samples.push({
            source: candidate.source,
            x: candidate.x,
            y: candidate.y,
            w: candidate.w,
            h: candidate.h,
            bounded: false,
            rejectedByBounds: true,
            rejectedAsDuplicate: false,
            rejectedByBlockedList: false,
            blockingIdsCount: 0,
            accepted: false,
          })
        }
        continue
      }

      const variants = buildCandidateVariants({
        base: boundedCandidate,
        anchor: anchor.aabb,
        params,
        pageInset,
        minW,
        minH,
      })

      for (const variant of variants) {
        const result = evaluateVariant({
          variant,
          anchor,
          params,
          editor,
          epsilon,
          ignoreIds,
          pageInset,
          blockedAabbs,
          seen,
          debug,
          samples,
        })

        if (result) {
          return debug ? { candidate: result, samples } : result
        }
      }
    }
  }

  if (debug) {
    return { candidate: null, samples }
  }
  return null
}

interface AnchoredInfo {
  axis: 'horizontal' | 'vertical'
  edge: 'left' | 'right' | 'top' | 'bottom'
  anchorGap: number
}

interface BuildCandidateVariantsArgs {
  base: TileCandidate
  anchor: RectLike
  params: TilingParams
  pageInset: RectLike | null
  minW: number
  minH: number
}

function buildCandidateVariants({ base, anchor, params, pageInset, minW, minH }: BuildCandidateVariantsArgs): TileCandidate[] {
  const variants: TileCandidate[] = [base]
  const anchored = resolveAnchoredInfo(anchor, base)
  if (!anchored) return variants

  const grid = params.grid > 0 ? params.grid : 1
  const minWidth = Math.max(grid, minW)
  const minHeight = Math.max(grid, minH)

  if (anchored.axis === 'horizontal') {
    let width = base.w - grid
    let attempts = 0
    while (width >= minWidth && attempts < MAX_FIT_ATTEMPTS) {
      const candidate = adjustWidth(base, width, anchored.edge)
      if (isInsideInset(candidate, pageInset)) {
        variants.push({ ...candidate, source: 'spiral-fit-width' })
      }
      width -= grid
      attempts += 1
    }
  } else {
    let height = base.h - grid
    let attempts = 0
    while (height >= minHeight && attempts < MAX_FIT_ATTEMPTS) {
      const candidate = adjustHeight(base, height, anchored.edge)
      if (isInsideInset(candidate, pageInset)) {
        variants.push({ ...candidate, source: 'spiral-fit-height' })
      }
      height -= grid
      attempts += 1
    }
  }

  return variants
}

interface EvaluateVariantArgs {
  variant: TileCandidate
  anchor: AnchorInfo
  params: TilingParams
  editor: Editor
  epsilon: number
  ignoreIds?: TLShapeId[]
  pageInset: RectLike | null
  blockedAabbs: RectLike[]
  seen: Set<string>
  debug: boolean
  samples: CandidateDebugSample[]
}

function evaluateVariant({ variant, anchor, params, editor, epsilon, ignoreIds, pageInset, blockedAabbs, seen, debug, samples }: EvaluateVariantArgs): TileCandidate | null {
  if (!isInsideInset(variant, pageInset)) {
    if (debug) {
      samples.push({
        source: variant.source,
        x: variant.x,
        y: variant.y,
        w: variant.w,
        h: variant.h,
        bounded: false,
        rejectedByBounds: true,
        rejectedAsDuplicate: false,
        rejectedByBlockedList: false,
        blockingIdsCount: 0,
        accepted: false,
      })
    }
    return null
  }

  const key = `${variant.x}:${variant.y}:${variant.w}:${variant.h}`
  if (seen.has(key)) {
    if (debug) {
      samples.push({
        source: variant.source,
        x: variant.x,
        y: variant.y,
        w: variant.w,
        h: variant.h,
        bounded: true,
        rejectedByBounds: false,
        rejectedAsDuplicate: true,
        rejectedByBlockedList: false,
        blockingIdsCount: 0,
        accepted: false,
      })
    }
    return null
  }
  seen.add(key)

  if (overlapsBlocked(variant, blockedAabbs)) {
    if (debug) {
      samples.push({
        source: variant.source,
        x: variant.x,
        y: variant.y,
        w: variant.w,
        h: variant.h,
        bounded: true,
        rejectedByBounds: false,
        rejectedAsDuplicate: false,
        rejectedByBlockedList: true,
        blockingIdsCount: 0,
        accepted: false,
      })
    }
    return null
  }

  const free = isCandidateFree({ editor, candidate: variant, epsilon, ignoreIds })
  if (debug) {
    const blockingIdsCount = free ? 0 : 1
    samples.push({
      source: variant.source,
      x: variant.x,
      y: variant.y,
      w: variant.w,
      h: variant.h,
      bounded: true,
      rejectedByBounds: false,
      rejectedAsDuplicate: false,
      rejectedByBlockedList: false,
      blockingIdsCount,
      accepted: free,
    })
  }

  if (!free) return null

  const harmonized = applyHarmony({
    candidate: variant,
    anchor: anchor.aabb,
    params,
    pageInset,
    editor,
    epsilon,
    ignoreIds,
    blockedAabbs,
  })

  if (harmonized) {
    const harmonyKey = `${harmonized.x}:${harmonized.y}:${harmonized.w}:${harmonized.h}`
    if (!seen.has(harmonyKey)) {
      if (isInsideInset(harmonized, pageInset) && !overlapsBlocked(harmonized, blockedAabbs)) {
        const harmonyFree = isCandidateFree({ editor, candidate: harmonized, epsilon, ignoreIds })
        if (debug) {
          const blockingIdsCount = harmonyFree ? 0 : 1
          samples.push({
            source: harmonized.source,
            x: harmonized.x,
            y: harmonized.y,
            w: harmonized.w,
            h: harmonized.h,
            bounded: true,
            rejectedByBounds: false,
            rejectedAsDuplicate: false,
            rejectedByBlockedList: false,
            blockingIdsCount,
            accepted: harmonyFree,
          })
        }
        if (harmonyFree) {
          return harmonized
        }
      } else if (debug) {
        samples.push({
          source: harmonized.source,
          x: harmonized.x,
          y: harmonized.y,
          w: harmonized.w,
          h: harmonized.h,
          bounded: false,
          rejectedByBounds: !isInsideInset(harmonized, pageInset),
          rejectedAsDuplicate: false,
          rejectedByBlockedList: isInsideInset(harmonized, pageInset) ? overlapsBlocked(harmonized, blockedAabbs) : false,
          blockingIdsCount: 0,
          accepted: false,
        })
      }
    } else if (debug) {
      samples.push({
        source: harmonized.source,
        x: harmonized.x,
        y: harmonized.y,
        w: harmonized.w,
        h: harmonized.h,
        bounded: true,
        rejectedByBounds: false,
        rejectedAsDuplicate: true,
        rejectedByBlockedList: false,
        blockingIdsCount: 0,
        accepted: false,
      })
    }
  }

  return variant
}

function overlapsBlocked(candidate: RectLike, blockedAabbs: RectLike[]): boolean {
  for (const blocked of blockedAabbs) {
    if (rectsOverlap(candidate, blocked)) {
      return true
    }
  }
  return false
}

function resolveAnchoredInfo(anchor: RectLike, candidate: RectLike): AnchoredInfo | null {
  const gaps: Array<{ axis: 'horizontal' | 'vertical'; edge: AnchoredInfo['edge']; value: number }> = []

  const gapRight = candidate.x - (anchor.x + anchor.w)
  if (gapRight >= 0) gaps.push({ axis: 'horizontal', edge: 'left', value: gapRight })

  const gapLeft = anchor.x - (candidate.x + candidate.w)
  if (gapLeft >= 0) gaps.push({ axis: 'horizontal', edge: 'right', value: gapLeft })

  const gapBottom = candidate.y - (anchor.y + anchor.h)
  if (gapBottom >= 0) gaps.push({ axis: 'vertical', edge: 'top', value: gapBottom })

  const gapTop = anchor.y - (candidate.y + candidate.h)
  if (gapTop >= 0) gaps.push({ axis: 'vertical', edge: 'bottom', value: gapTop })

  if (gaps.length === 0) return null

  gaps.sort((a, b) => a.value - b.value)
  const nearest = gaps[0]
  return {
    axis: nearest.axis,
    edge: nearest.edge,
    anchorGap: nearest.value,
  }
}

function adjustWidth(base: TileCandidate, width: number, edge: AnchoredInfo['edge']): TileCandidate {
  if (edge === 'right') {
    return { ...base, x: base.x + (base.w - width), w: width }
  }
  return { ...base, w: width }
}

function adjustHeight(base: TileCandidate, height: number, edge: AnchoredInfo['edge']): TileCandidate {
  if (edge === 'bottom') {
    return { ...base, y: base.y + (base.h - height), h: height }
  }
  return { ...base, h: height }
}

interface HarmonyArgs {
  candidate: TileCandidate
  anchor: RectLike
  params: TilingParams
  pageInset: RectLike | null
  editor: Editor
  epsilon: number
  ignoreIds?: TLShapeId[]
  blockedAabbs: RectLike[]
}

function applyHarmony({ candidate, anchor, params, pageInset, editor, epsilon, ignoreIds, blockedAabbs }: HarmonyArgs): TileCandidate | null {
  const anchored = resolveAnchoredInfo(anchor, candidate)
  if (!anchored) return null

  const oppositeDirection = anchored.edge === 'left' ? 'right' : anchored.edge === 'right' ? 'left' : anchored.edge === 'top' ? 'down' : 'up'
  const boundary = findNearestBoundary({ editor, candidate, direction: oppositeDirection, pageInset, ignoreIds })
  if (!boundary) return null

  const anchorGap = anchored.anchorGap
  const boundaryGap = boundary.distance

  if (!(anchorGap > boundaryGap)) {
    return null
  }

  const grid = params.grid > 0 ? params.grid : 1
  const shrinkAmount = Math.min(
    Math.ceil((anchorGap - boundaryGap) / grid) * grid,
    anchored.axis === 'horizontal' ? candidate.w - grid : candidate.h - grid,
  )

  if (shrinkAmount <= 0) {
    return null
  }

  let adjusted: TileCandidate
  if (anchored.axis === 'horizontal') {
    const newWidth = candidate.w - shrinkAmount
    if (newWidth < grid) return null
    adjusted = anchored.edge === 'right'
      ? { ...candidate, x: candidate.x + shrinkAmount, w: newWidth, source: 'spiral-harmony' }
      : { ...candidate, w: newWidth, source: 'spiral-harmony' }
  } else {
    const newHeight = candidate.h - shrinkAmount
    if (newHeight < grid) return null
    adjusted = anchored.edge === 'bottom'
      ? { ...candidate, y: candidate.y + shrinkAmount, h: newHeight, source: 'spiral-harmony' }
      : { ...candidate, h: newHeight, source: 'spiral-harmony' }
  }

  if (!isInsideInset(adjusted, pageInset)) {
    return null
  }

  if (overlapsBlocked(adjusted, blockedAabbs)) {
    return null
  }

  // Ensure the adjusted candidate still respects the boundary requirement
  const verifyBoundary = findNearestBoundary({ editor, candidate: adjusted, direction: oppositeDirection, pageInset, ignoreIds })
  if (!verifyBoundary) return null
  const newGap = verifyBoundary.distance
  if (Math.abs(newGap - anchorGap) > grid) {
    return null
  }

  return adjusted
}

interface BoundaryInfo {
  distance: number
  position: number
}

interface BoundaryArgs {
  editor: Editor
  candidate: TileCandidate
  direction: 'right' | 'left' | 'down' | 'up'
  pageInset: RectLike | null
  ignoreIds?: TLShapeId[]
}

function findNearestBoundary({ editor, candidate, direction, pageInset, ignoreIds }: BoundaryArgs): BoundaryInfo | null {
  let nearestDistance = Number.POSITIVE_INFINITY
  let boundaryPosition: number | null = null

  const candidateRight = candidate.x + candidate.w
  const candidateBottom = candidate.y + candidate.h

  switch (direction) {
    case 'right': {
      if (pageInset) {
        const distance = pageInset.x + pageInset.w - candidateRight
        if (distance >= 0 && distance < nearestDistance) {
          nearestDistance = distance
          boundaryPosition = pageInset.x + pageInset.w
        }
      }
      const bounds = buildSearchRegion(candidate, direction, pageInset)
      if (bounds) {
        for (const shapeBounds of collectShapeBoundsInRegion(editor, bounds, ignoreIds)) {
          if (!spansOverlap(candidate.y, candidateBottom, shapeBounds.y, shapeBounds.y + shapeBounds.h)) continue
          const distance = shapeBounds.x - candidateRight
          if (distance >= 0 && distance < nearestDistance) {
            nearestDistance = distance
            boundaryPosition = shapeBounds.x
          }
        }
      }
      break
    }
    case 'left': {
      if (pageInset) {
        const distance = candidate.x - pageInset.x
        if (distance >= 0 && distance < nearestDistance) {
          nearestDistance = distance
          boundaryPosition = pageInset.x
        }
      }
      const bounds = buildSearchRegion(candidate, direction, pageInset)
      if (bounds) {
        for (const shapeBounds of collectShapeBoundsInRegion(editor, bounds, ignoreIds)) {
          if (!spansOverlap(candidate.y, candidateBottom, shapeBounds.y, shapeBounds.y + shapeBounds.h)) continue
          const distance = candidate.x - (shapeBounds.x + shapeBounds.w)
          if (distance >= 0 && distance < nearestDistance) {
            nearestDistance = distance
            boundaryPosition = shapeBounds.x + shapeBounds.w
          }
        }
      }
      break
    }
    case 'down': {
      if (pageInset) {
        const distance = pageInset.y + pageInset.h - candidateBottom
        if (distance >= 0 && distance < nearestDistance) {
          nearestDistance = distance
          boundaryPosition = pageInset.y + pageInset.h
        }
      }
      const bounds = buildSearchRegion(candidate, direction, pageInset)
      if (bounds) {
        for (const shapeBounds of collectShapeBoundsInRegion(editor, bounds, ignoreIds)) {
          if (!spansOverlap(candidate.x, candidateRight, shapeBounds.x, shapeBounds.x + shapeBounds.w)) continue
          const distance = shapeBounds.y - candidateBottom
          if (distance >= 0 && distance < nearestDistance) {
            nearestDistance = distance
            boundaryPosition = shapeBounds.y
          }
        }
      }
      break
    }
    case 'up': {
      if (pageInset) {
        const distance = candidate.y - pageInset.y
        if (distance >= 0 && distance < nearestDistance) {
          nearestDistance = distance
          boundaryPosition = pageInset.y
        }
      }
      const bounds = buildSearchRegion(candidate, direction, pageInset)
      if (bounds) {
        for (const shapeBounds of collectShapeBoundsInRegion(editor, bounds, ignoreIds)) {
          if (!spansOverlap(candidate.x, candidateRight, shapeBounds.x, shapeBounds.x + shapeBounds.w)) continue
          const distance = candidate.y - (shapeBounds.y + shapeBounds.h)
          if (distance >= 0 && distance < nearestDistance) {
            nearestDistance = distance
            boundaryPosition = shapeBounds.y + shapeBounds.h
          }
        }
      }
      break
    }
  }

  if (!Number.isFinite(nearestDistance) || boundaryPosition === null) {
    return null
  }

  return { distance: nearestDistance, position: boundaryPosition }
}

function buildSearchRegion(candidate: TileCandidate, direction: BoundaryArgs['direction'], pageInset: RectLike | null): RectLike | null {
  const candidateRight = candidate.x + candidate.w
  const candidateBottom = candidate.y + candidate.h

  switch (direction) {
    case 'right': {
      const limit = pageInset ? pageInset.x + pageInset.w : candidateRight + 4096
      const width = Math.max(0, limit - candidateRight)
      if (width <= 0) return null
      return { x: candidateRight, y: candidate.y, w: width, h: candidate.h }
    }
    case 'left': {
      const limit = pageInset ? pageInset.x : Math.max(0, candidate.x - 4096)
      const width = Math.max(0, candidate.x - limit)
      if (width <= 0) return null
      return { x: candidate.x - width, y: candidate.y, w: width, h: candidate.h }
    }
    case 'down': {
      const limit = pageInset ? pageInset.y + pageInset.h : candidateBottom + 4096
      const height = Math.max(0, limit - candidateBottom)
      if (height <= 0) return null
      return { x: candidate.x, y: candidateBottom, w: candidate.w, h: height }
    }
    case 'up': {
      const limit = pageInset ? pageInset.y : Math.max(0, candidate.y - 4096)
      const height = Math.max(0, candidate.y - limit)
      if (height <= 0) return null
      return { x: candidate.x, y: candidate.y - height, w: candidate.w, h: height }
    }
  }
}

function spansOverlap(minA: number, maxA: number, minB: number, maxB: number): boolean {
  return !(maxA <= minB || maxB <= minA)
}

function collectShapeBoundsInRegion(editor: Editor, region: RectLike, ignoreIds?: TLShapeId[]): RectLike[] {
  const ignore = new Set(ignoreIds ?? [])
  const boundsList: RectLike[] = []

  // Get all shapes and filter them
  const allShapes = editor.getCurrentPageRenderingShapesSorted()
  for (const shape of allShapes) {
    if (!shape || ignore.has(shape.id) || shape.isLocked) continue
    const shapeBounds = editor.getShapePageBounds(shape)
    if (!shapeBounds) continue
    if (!rectsOverlap(region, shapeBounds)) continue
    boundsList.push(shapeBounds)
  }

  return boundsList
}

