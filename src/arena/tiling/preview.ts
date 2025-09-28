import type { Editor, TLShapeId } from 'tldraw'
import { generateTileCandidates } from './generateCandidates'
import { isCandidateFree } from './validateCandidate'
import type { AnchorInfo, RectLike, TileCandidate, TileSize, TilingParams } from './types'
import { resolveCaps } from './types'

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
}

function clampCandidateToBounds(candidate: TileCandidate, bounds: RectLike, grid: number): TileCandidate | null {
  const fitsHorizontally = candidate.w <= bounds.w
  const fitsVertically = candidate.h <= bounds.h
  if (!fitsHorizontally || !fitsVertically) return null

  const minX = bounds.x
  const minY = bounds.y
  const maxX = bounds.x + bounds.w - candidate.w
  const maxY = bounds.y + bounds.h - candidate.h

  const snap = (value: number) => (grid > 0 ? Math.round((value - minX) / grid) * grid + minX : value)

  let x = Math.max(minX, Math.min(candidate.x, maxX))
  let y = Math.max(minY, Math.min(candidate.y, maxY))

  if (grid > 0) {
    const snapX = snap(x - minX, grid) + minX
    const snapY = snap(y - minY, grid) + minY
    x = Math.max(minX, Math.min(snapX, maxX))
    y = Math.max(minY, Math.min(snapY, maxY))
  }

  return { ...candidate, x, y }
}

function rectsOverlap(a: RectLike, b: RectLike) {
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  )
}

export function computePreviewCandidate({ editor, anchor, tileSize, params, epsilon, ignoreIds, pageBounds, blockedAabbs = [] }: PreviewParams): TileCandidate | null {
  const baseCaps = resolveCaps(params.caps)
  const horizontalStep = Math.max(8, baseCaps.horizontalSteps)
  const verticalStep = Math.max(8, baseCaps.verticalSteps)
  const rowDropStep = Math.max(2, baseCaps.rowDrops || 1)
  const columnStep = Math.max(2, baseCaps.columnSteps || 1)
  const seen = new Set<string>()

  const expansionLevels = 6

  for (let expansion = 0; expansion <= expansionLevels; expansion++) {
    const expandedCaps = {
      horizontalSteps: baseCaps.horizontalSteps + expansion * horizontalStep,
      rowDrops: baseCaps.rowDrops + expansion * rowDropStep,
      verticalSteps: baseCaps.verticalSteps + expansion * verticalStep,
      columnSteps: baseCaps.columnSteps + expansion * columnStep,
    }

    const paramWithCaps: TilingParams = {
      ...params,
      caps: expandedCaps,
    }

    const generator = generateTileCandidates({ anchor, tileSize, params: paramWithCaps })

    for (const candidate of generator) {
      const boundedCandidate = pageBounds ? clampCandidateToBounds(candidate, pageBounds, params.grid) : candidate
      if (!boundedCandidate) continue
      const key = `${boundedCandidate.x}:${boundedCandidate.y}:${boundedCandidate.w}:${boundedCandidate.h}`
      if (seen.has(key)) continue
      seen.add(key)

      let overlapsBlocked = false
      for (const blocked of blockedAabbs) {
        if (rectsOverlap(boundedCandidate, blocked)) {
          overlapsBlocked = true
          break
        }
      }
      if (overlapsBlocked) continue

      if (isCandidateFree({ editor, candidate: boundedCandidate, epsilon, ignoreIds })) {
        return boundedCandidate
      }
    }
  }

  return null
}

