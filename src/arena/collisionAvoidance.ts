import * as React from 'react'
import { Editor, type TLShapeId, EASINGS } from 'tldraw'
import { getGridSize, TILING_CONSTANTS } from './layout'
import { CARD_SHADOW, GHOST_BACKGROUND } from './constants'
import { rectsOverlap } from './tiling/validateCandidate'

export interface CollisionAvoidanceOptions {
  /** Editor instance for spatial queries */
  editor: Editor
  /** Shape ID to exclude from collision checks */
  shapeId: TLShapeId
  /** Gap between shapes in page units */
  gap?: number
  /** Grid size for snapping */
  gridSize?: number
  /** Maximum number of search rings for free position */
  maxSearchRings?: number
}

export interface Bounds {
  x: number
  y: number
  w: number
  h: number
}

export interface GhostCandidate extends Bounds {}

/**
 * Expand a rectangle by a given amount on all sides
 */
export function expandRect(bounds: Bounds, by: number): Bounds {
  return {
    x: bounds.x - by,
    y: bounds.y - by,
    w: bounds.w + 2 * by,
    h: bounds.h + 2 * by,
  }
}

/**
 * Get all neighboring shapes that could potentially collide with the given search bounds
 */
export function getNeighborBounds(
  editor: Editor,
  searchBounds: Bounds,
  shapeId: TLShapeId,
  gap: number,
  gridSize: number
): Array<{ x: number; y: number; w: number; h: number; type: string; id: string }> {
  const anyEditor = editor as any
  const result: Array<{ x: number; y: number; w: number; h: number; type: string; id: string }> = []

  const pushIfMatch = (s: any) => {
    if (!s || s.id === shapeId) return
    if (s.type !== 'portal' && s.type !== 'arena-block') return
    const b = editor.getShapePageBounds(s)
    if (!b) return
    if (!rectsOverlap(searchBounds as any, b as any)) return
    result.push({ x: b.x, y: b.y, w: b.w, h: b.h, type: s.type, id: s.id })
  }

  // 1) Try spatial queries (prefer intersection semantics)
  try {
    if (typeof anyEditor.getShapesInBounds === 'function') {
      const shapesIn = anyEditor.getShapesInBounds(searchBounds, { hitInside: false, hitOutside: true, margin: 0 }) || []
      for (const s of shapesIn) pushIfMatch(s)
    } else if (typeof anyEditor.getShapeIdsInBounds === 'function') {
      const ids = anyEditor.getShapeIdsInBounds(searchBounds, { hitInside: false, hitOutside: true, margin: 0 }) || []
      for (const id of ids) pushIfMatch(editor.getShape(id))
    }
  } catch {}

  // 2) Fallback / union with manual AABB filtering over rendered shapes
  try {
    const all = anyEditor.getCurrentPageRenderingShapesSorted?.() || editor.getCurrentPageShapes?.() || []
    for (const s of all) pushIfMatch(s)
  } catch {}

  return result
}

/**
 * Check if a candidate bounds is free of collisions with neighbors
 */
export function isBoundsFree(
  candidate: Bounds,
  neighbors: Array<{ x: number; y: number; w: number; h: number }>,
  gap: number
): boolean {
  for (const n of neighbors) {
    const expanded = expandRect(n, gap)
    if (rectsOverlap(candidate as any, expanded as any)) return false
  }
  return true
}

/**
 * Generate Manhattan distance offsets for collision-free position search
 */
export function manhattanOffsets(maxRings: number, step: number): Array<{ x: number; y: number }> {
  const arr: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }]
  for (let r = 1; r <= maxRings; r++) {
    const d = r * step
    arr.push({ x: +d, y: 0 }, { x: -d, y: 0 }, { x: 0, y: +d }, { x: 0, y: -d })
    arr.push({ x: +d, y: +d }, { x: -d, y: +d }, { x: +d, y: -d }, { x: -d, y: -d })
  }
  return arr
}

/**
 * Find the nearest collision-free bounds for a given seed position
 */
export function computeNearestFreeBounds(
  seed: Bounds,
  options: CollisionAvoidanceOptions
): Bounds {
  const { editor, shapeId, gap = TILING_CONSTANTS.gap, gridSize = getGridSize(), maxSearchRings = 20 } = options

  // Quick check with minimal margin (just gap, not gap + gridSize * 2)
  const quickMargin = gap
  const quickNeighbors = getNeighborBounds(editor, {
    x: seed.x - quickMargin,
    y: seed.y - quickMargin,
    w: seed.w + 2 * quickMargin,
    h: seed.h + 2 * quickMargin,
  }, shapeId, gap, gridSize)

  if (isBoundsFree(seed, quickNeighbors, gap)) return seed

  // Search outward with optimized ring count (8 instead of 20)
  // Use smaller search margin for performance
  const searchMargin = gap + gridSize
  for (const offset of manhattanOffsets(maxSearchRings, gridSize)) {
    const cx = Math.round((seed.x + offset.x) / gridSize) * gridSize
    const cy = Math.round((seed.y + offset.y) / gridSize) * gridSize
    const candidate = { x: cx, y: cy, w: seed.w, h: seed.h }

    // Reuse the quickNeighbors if the candidate is within that search area
    let neighbors = quickNeighbors
    if (Math.abs(cx - seed.x) > quickMargin || Math.abs(cy - seed.y) > quickMargin) {
      // Only query new neighbors if outside the quick search area
      neighbors = getNeighborBounds(editor, {
        x: candidate.x - searchMargin,
        y: candidate.y - searchMargin,
        w: candidate.w + 2 * searchMargin,
        h: candidate.h + 2 * searchMargin,
      }, shapeId, gap, gridSize)
    }

    if (isBoundsFree(candidate, neighbors, gap)) return candidate
  }

  return seed
}

/**
 * Hook for managing collision-free transforms in shape components
 */
export function useCollisionAvoidance(options: CollisionAvoidanceOptions) {
  const { editor, shapeId, gap, gridSize, maxSearchRings } = options

  // Compute ghost candidate while transforming
  const computeGhostCandidate = React.useCallback((currentBounds: Bounds): GhostCandidate | null => {
    const anyEditor = editor as any
    const isSelected = editor.getSelectedShapeIds().includes(shapeId)
    const isDragging = !!anyEditor.inputs?.isDragging
    const isResizing = !!anyEditor.inputs?.isResizing
    const isTransforming = isDragging || isResizing

    if (!isSelected || !isTransforming) return null

    return computeNearestFreeBounds(currentBounds, {
      editor,
      shapeId,
      gap,
      gridSize,
      maxSearchRings,
    })
  }, [editor, shapeId, gap, gridSize, maxSearchRings])

  // Apply end-of-gesture correction with smooth animation
  const applyEndOfGestureCorrection = React.useCallback((currentBounds: Bounds) => {
    const target = computeNearestFreeBounds(currentBounds, {
      editor,
      shapeId,
      gap,
      gridSize,
      maxSearchRings,
    })

    if (target.x !== currentBounds.x || target.y !== currentBounds.y) {
      try {
        editor.animateShape({
          id: shapeId,
          type: editor.getShape(shapeId)?.type as any,
          x: target.x,
          y: target.y
        }, {
          animation: {
            duration: 200,
            easing: EASINGS.easeInOutSine
          }
        })
      } catch {}
    }
  }, [editor, shapeId, gap, gridSize, maxSearchRings])

  return {
    computeGhostCandidate,
    applyEndOfGestureCorrection,
  }
}

/**
 * Props for the GhostOverlay component
 */
export interface GhostOverlayProps {
  /** The ghost candidate bounds to render */
  ghostCandidate: Bounds | null
  /** Current shape bounds for positioning */
  currentBounds: Bounds | null
  /** Border radius for the ghost (matches shape styling) */
  borderRadius?: number
  /** Whether the ghost should be visible */
  visible?: boolean
}

/**
 * Reusable ghost overlay component for collision-free transforms
 * Shows a semi-transparent preview of where the shape will move to avoid collisions
 */
export const GhostOverlay: React.FC<GhostOverlayProps> = ({
  ghostCandidate,
  currentBounds,
  borderRadius = 0,
  visible = true
}) => {
  if (!visible || !ghostCandidate || !currentBounds) return null

  const isDifferent = Math.abs(ghostCandidate.x - currentBounds.x) > 0.5 ||
                     Math.abs(ghostCandidate.y - currentBounds.y) > 0.5

  if (!isDifferent) return null

  const localLeft = ghostCandidate.x - currentBounds.x
  const localTop = ghostCandidate.y - currentBounds.y

  return React.createElement('div', {
    style: {
      position: 'absolute',
      left: localLeft,
      top: localTop,
      width: ghostCandidate.w,
      height: ghostCandidate.h,
      pointerEvents: 'none',
      border: '1px solid rgba(0,0,0,.02)',
      background: GHOST_BACKGROUND,
      boxShadow: CARD_SHADOW,
      mixBlendMode: 'normal',
      borderRadius,
      zIndex: -1,
    }
  })
}
