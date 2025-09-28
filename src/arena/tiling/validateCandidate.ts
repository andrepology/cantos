import type { Editor, TLShapeId } from 'tldraw'
import { type TileCandidate, type RectLike } from './types'

export interface CandidateValidationParams {
  editor: Editor
  candidate: TileCandidate
  epsilon: number
  ignoreIds?: TLShapeId[]
}

export function expand(aabb: RectLike, epsilon: number): RectLike {
  if (epsilon <= 0) return aabb
  return {
    x: aabb.x - epsilon,
    y: aabb.y - epsilon,
    w: aabb.w + epsilon * 2,
    h: aabb.h + epsilon * 2,
  }
}

export function getCandidateAabb(candidate: RectLike): RectLike {
  return {
    x: candidate.x,
    y: candidate.y,
    w: candidate.w,
    h: candidate.h,
  }
}

export function intersects(a: RectLike, b: RectLike): boolean {
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  )
}

export function getObstacleIds(editor: Editor, bounds: RectLike, ignoreIds?: TLShapeId[]): TLShapeId[] {
  const ignore = new Set(ignoreIds ?? [])
  const ids: TLShapeId[] = []
  const result = editor.getShapesInBounds?.(bounds, { type: 'any', pageId: editor.getCurrentPageId() })
  if (Array.isArray(result)) {
    for (const shape of result) {
      if (!shape) continue
      if (ignore.has(shape.id)) continue
      if (shape.isLocked) continue
      if (!shape.isHidden) {
        ids.push(shape.id)
      }
    }
    return ids
  }
  const pageIds = editor.getCurrentPageShapeIds()
  for (const id of pageIds) {
    if (ignore.has(id)) continue
    const shape = editor.getShape(id)
    if (!shape) continue
    if (shape.isLocked) continue
    if (shape.isHidden) continue
    const shapeBounds = editor.getShapePageBounds(shape)
    if (!shapeBounds) continue
    if (intersects(bounds, shapeBounds)) {
      ids.push(id)
    }
  }
  return ids
}

export function getBlockingShapeIds({ editor, candidate, epsilon, ignoreIds }: CandidateValidationParams): TLShapeId[] {
  const aabb = expand(getCandidateAabb(candidate), epsilon)
  const obstacles = getObstacleIds(editor, aabb, ignoreIds)
  if (obstacles.length === 0) return []
  const blocking: TLShapeId[] = []
  for (const id of obstacles) {
    const shape = editor.getShape(id)
    if (!shape) continue
    const shapeBounds = editor.getShapePageBounds(shape)
    if (!shapeBounds) continue
    if (intersects(aabb, shapeBounds)) {
      blocking.push(id)
    }
  }
  return blocking
}

export function isCandidateFree(params: CandidateValidationParams): boolean {
  return getBlockingShapeIds(params).length === 0
}

export interface FindFirstFitParams {
  editor: Editor
  candidates: Iterable<TileCandidate>
  epsilon: number
  ignoreIds?: TLShapeId[]
}

export function findFirstFreeCandidate({ editor, candidates, epsilon, ignoreIds }: FindFirstFitParams): TileCandidate | null {
  for (const candidate of candidates) {
    if (isCandidateFree({ editor, candidate, epsilon, ignoreIds })) {
      return candidate
    }
  }
  return null
}


