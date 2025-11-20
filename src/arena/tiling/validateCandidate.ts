import type { Editor, TLShapeId } from 'tldraw'
import { type TileCandidate, type RectLike } from './types'

export function rectsOverlap(a: RectLike, b: RectLike): boolean {
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  )
}

export interface CandidateValidationParams {
  editor: Editor
  candidate: TileCandidate
  epsilon: number
  ignoreIds?: TLShapeId[]
}

function expand(aabb: RectLike, epsilon: number): RectLike {
  if (epsilon <= 0) return aabb
  return {
    x: aabb.x - epsilon,
    y: aabb.y - epsilon,
    w: aabb.w + epsilon * 2,
    h: aabb.h + epsilon * 2,
  }
}

function getBlockingObstacles(editor: Editor, bounds: RectLike, ignoreIds?: TLShapeId[]): TLShapeId[] {
  const ignore = new Set(ignoreIds ?? [])
  const ids: TLShapeId[] = []

  // Get all shapes and filter them
  const allShapes = editor.getCurrentPageRenderingShapesSorted()
  for (const shape of allShapes) {
    if (!shape) continue
    if (ignore.has(shape.id)) continue
    if (shape.isLocked) continue
    const shapeBounds = editor.getShapePageBounds(shape)
    if (!shapeBounds) continue
    if (rectsOverlap(bounds, shapeBounds)) {
      ids.push(shape.id)
    }
  }
  return ids
}

export function getBlockingShapeIds({ editor, candidate, epsilon, ignoreIds }: CandidateValidationParams): TLShapeId[] {
  const aabb = expand(candidate, epsilon)
  const obstacles = getBlockingObstacles(editor, aabb, ignoreIds)
  if (obstacles.length === 0) return []
  const blocking: TLShapeId[] = []
  for (const id of obstacles) {
    const shape = editor.getShape(id)
    if (!shape) continue
    const shapeBounds = editor.getShapePageBounds(shape)
    if (!shapeBounds) continue
    if (rectsOverlap(aabb, shapeBounds)) {
      blocking.push(id)
    }
  }
  return blocking
}

export function isCandidateFree(params: CandidateValidationParams): boolean {
  return getBlockingShapeIds(params).length === 0
}


