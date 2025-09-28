import type { Editor, TLShapeId } from 'tldraw'
import { generateTileCandidates } from './generateCandidates'
import { isCandidateFree } from './validateCandidate'
import type { AnchorInfo, RectLike, TileCandidate, TileSize, TilingParams } from './types'

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
    x = Math.max(minX, Math.min(snap(x), maxX))
    y = Math.max(minY, Math.min(Math.round((y - minY) / grid) * grid + minY, maxY))
  }

  return { ...candidate, x, y }
}

export function computePreviewCandidate({ editor, anchor, tileSize, params, epsilon, ignoreIds, pageBounds }: PreviewParams): TileCandidate | null {
  const generator = generateTileCandidates({ anchor, tileSize, params })
  for (const candidate of generator) {
    const boundedCandidate = pageBounds ? clampCandidateToBounds(candidate, pageBounds, params.grid) : candidate
    if (!boundedCandidate) continue
    if (isCandidateFree({ editor, candidate: boundedCandidate, epsilon, ignoreIds })) {
      return boundedCandidate
    }
  }
  return null
}

