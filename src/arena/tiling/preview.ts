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
  debug?: boolean
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

function clampCandidateToBounds(candidate: TileCandidate, bounds: RectLike, _grid: number): TileCandidate | null {
  const fitsHorizontally = candidate.w <= bounds.w
  const fitsVertically = candidate.h <= bounds.h
  if (!fitsHorizontally || !fitsVertically) return null

  const minX = bounds.x
  const minY = bounds.y
  const maxX = bounds.x + bounds.w - candidate.w
  const maxY = bounds.y + bounds.h - candidate.h

  let x = Math.max(minX, Math.min(candidate.x, maxX))
  let y = Math.max(minY, Math.min(candidate.y, maxY))

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

export function computePreviewCandidate({ editor, anchor, tileSize, params, epsilon, ignoreIds, pageBounds, blockedAabbs = [], debug = false }: PreviewParams): TileCandidate | null | ComputePreviewResult {
  const baseCaps = resolveCaps(params.caps)
  const horizontalStep = Math.max(8, baseCaps.horizontalSteps)
  const verticalStep = Math.max(8, baseCaps.verticalSteps)
  const rowDropStep = Math.max(2, baseCaps.rowDrops || 1)
  const columnStep = Math.max(2, baseCaps.columnSteps || 1)
  const seen = new Set<string>()

  const expansionLevels = 6

  const samples: CandidateDebugSample[] = debug ? [] : ([] as never)

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
      const rejectedByBounds = !boundedCandidate
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
      const key = `${boundedCandidate.x}:${boundedCandidate.y}:${boundedCandidate.w}:${boundedCandidate.h}`
      if (seen.has(key)) {
        if (debug) {
          samples.push({
            source: boundedCandidate.source,
            x: boundedCandidate.x,
            y: boundedCandidate.y,
            w: boundedCandidate.w,
            h: boundedCandidate.h,
            bounded: true,
            rejectedByBounds: false,
            rejectedAsDuplicate: true,
            rejectedByBlockedList: false,
            blockingIdsCount: 0,
            accepted: false,
          })
        }
        continue
      }
      seen.add(key)

      let overlapsBlocked = false
      for (const blocked of blockedAabbs) {
        if (rectsOverlap(boundedCandidate, blocked)) {
          overlapsBlocked = true
          break
        }
      }
      if (overlapsBlocked) {
        if (debug) {
          samples.push({
            source: boundedCandidate.source,
            x: boundedCandidate.x,
            y: boundedCandidate.y,
            w: boundedCandidate.w,
            h: boundedCandidate.h,
            bounded: true,
            rejectedByBounds: false,
            rejectedAsDuplicate: false,
            rejectedByBlockedList: true,
            blockingIdsCount: 0,
            accepted: false,
          })
        }
        continue
      }

      const isFree = isCandidateFree({ editor, candidate: boundedCandidate, epsilon, ignoreIds })
      if (debug) {
        const blockingIdsCount = isFree ? 0 : 1 // cheap signal; full list is heavier here
        samples.push({
          source: boundedCandidate.source,
          x: boundedCandidate.x,
          y: boundedCandidate.y,
          w: boundedCandidate.w,
          h: boundedCandidate.h,
          bounded: true,
          rejectedByBounds: false,
          rejectedAsDuplicate: false,
          rejectedByBlockedList: false,
          blockingIdsCount,
          accepted: isFree,
        })
      }
      if (isFree) {
        if (debug) {
          return { candidate: boundedCandidate, samples }
        }
        return boundedCandidate
      }
    }
  }

  if (debug) {
    return { candidate: null, samples }
  }
  return null
}

