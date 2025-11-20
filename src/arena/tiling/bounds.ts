import type { RectLike, TileCandidate } from './types'

export function insetRect(bounds: RectLike | null | undefined, inset: number): RectLike | null {
  if (!bounds) return null
  if (inset <= 0) return bounds
  const w = bounds.w - inset * 2
  const h = bounds.h - inset * 2
  if (w <= 0 || h <= 0) return null
  return {
    x: bounds.x + inset,
    y: bounds.y + inset,
    w,
    h,
  }
}

export function clampCandidateToInset(candidate: TileCandidate, insetBounds: RectLike | null): TileCandidate | null {
  if (!insetBounds) return candidate
  const fitsHorizontally = candidate.w <= insetBounds.w
  const fitsVertically = candidate.h <= insetBounds.h
  if (!fitsHorizontally || !fitsVertically) return null

  const minX = insetBounds.x
  const minY = insetBounds.y
  const maxX = insetBounds.x + insetBounds.w - candidate.w
  const maxY = insetBounds.y + insetBounds.h - candidate.h

  const x = Math.max(minX, Math.min(candidate.x, maxX))
  const y = Math.max(minY, Math.min(candidate.y, maxY))

  return { ...candidate, x, y }
}

export function isInsideInset(candidate: RectLike, insetBounds: RectLike | null): boolean {
  if (!insetBounds) return true
  return (
    candidate.x >= insetBounds.x &&
    candidate.y >= insetBounds.y &&
    candidate.x + candidate.w <= insetBounds.x + insetBounds.w &&
    candidate.y + candidate.h <= insetBounds.y + insetBounds.h
  )
}


