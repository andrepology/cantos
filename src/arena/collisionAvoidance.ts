import * as React from 'react'
import { type Editor, type TLShapeId, EASINGS } from 'tldraw'
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

// ─────────────────────────────────────────────────────────────────────────────
// Hysteresis: track last valid position per shape to prevent jitter
// ─────────────────────────────────────────────────────────────────────────────
const lastValidPositions = new Map<TLShapeId, { x: number; y: number }>()

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
    if (s.type !== 'portal' && s.type !== 'arena-block' && s.type !== 'tactile-portal') return
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
 * @deprecated Use distanceSortedOffsets for stable, closest-first results
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
 * Generate candidate offsets sorted by Euclidean distance from origin.
 * This ensures we always find the truly closest free position, not just
 * the first one in an arbitrary search pattern.
 */
export function distanceSortedOffsets(maxRings: number, step: number): Array<{ x: number; y: number; dist: number }> {
  const candidates: Array<{ x: number; y: number; dist: number }> = []
  
  // Generate all grid points within the search radius
  for (let dx = -maxRings; dx <= maxRings; dx++) {
    for (let dy = -maxRings; dy <= maxRings; dy++) {
      const x = dx * step
      const y = dy * step
      const dist = Math.sqrt(x * x + y * y)
      candidates.push({ x, y, dist })
    }
  }
  
  // Sort by distance (closest first)
  candidates.sort((a, b) => a.dist - b.dist)
  
  return candidates
}

/**
 * Find the nearest collision-free bounds for a given seed position.
 * 
 * Uses distance-sorted search (Option A) and hysteresis (Option B) for stability:
 * - Candidates are checked in true Euclidean distance order from seed
 * - Last valid position is remembered; we only switch if new position is closer by threshold
 */
export function computeNearestFreeBounds(
  seed: Bounds,
  options: CollisionAvoidanceOptions
): Bounds {
  const { editor, shapeId, gap = TILING_CONSTANTS.gap, gridSize = getGridSize(), maxSearchRings = 20 } = options
  
  // Hysteresis threshold: only switch positions if the new one is this much closer
  const hysteresisThreshold = gridSize * 0.5

  // Quick check with minimal margin (just gap, not gap + gridSize * 2)
  const quickMargin = gap
  const quickNeighbors = getNeighborBounds(editor, {
    x: seed.x - quickMargin,
    y: seed.y - quickMargin,
    w: seed.w + 2 * quickMargin,
    h: seed.h + 2 * quickMargin,
  }, shapeId, gap, gridSize)

  // If seed position is free, use it and update hysteresis
  if (isBoundsFree(seed, quickNeighbors, gap)) {
    lastValidPositions.set(shapeId, { x: seed.x, y: seed.y })
    return seed
  }

  // Check if the last valid position is still valid (hysteresis: prefer sticking)
  const lastValid = lastValidPositions.get(shapeId)
  if (lastValid) {
    const lastBounds = { x: lastValid.x, y: lastValid.y, w: seed.w, h: seed.h }
    const lastNeighbors = getNeighborBounds(editor, {
      x: lastValid.x - quickMargin,
      y: lastValid.y - quickMargin,
      w: seed.w + 2 * quickMargin,
      h: seed.h + 2 * quickMargin,
    }, shapeId, gap, gridSize)
    
    if (isBoundsFree(lastBounds, lastNeighbors, gap)) {
      // Last position still valid - compute distance from seed to last
      const distToLast = Math.sqrt(
        (seed.x - lastValid.x) ** 2 + (seed.y - lastValid.y) ** 2
      )
      
      // Search for a closer position using distance-sorted offsets
      const searchMargin = gap + gridSize
      const offsets = distanceSortedOffsets(maxSearchRings, gridSize)
      
      for (const offset of offsets) {
        // Skip if this offset would be farther than (distToLast - threshold)
        // No point checking positions that wouldn't beat the hysteresis
        if (offset.dist >= distToLast - hysteresisThreshold) continue
        
        const cx = Math.round((seed.x + offset.x) / gridSize) * gridSize
        const cy = Math.round((seed.y + offset.y) / gridSize) * gridSize
        const candidate = { x: cx, y: cy, w: seed.w, h: seed.h }
        
        // Compute actual distance from seed to this candidate
        const actualDist = Math.sqrt((seed.x - cx) ** 2 + (seed.y - cy) ** 2)
        
        // Only consider if significantly closer than last valid position
        if (actualDist >= distToLast - hysteresisThreshold) continue
        
        let neighbors = quickNeighbors
        if (Math.abs(cx - seed.x) > quickMargin || Math.abs(cy - seed.y) > quickMargin) {
          neighbors = getNeighborBounds(editor, {
            x: candidate.x - searchMargin,
            y: candidate.y - searchMargin,
            w: candidate.w + 2 * searchMargin,
            h: candidate.h + 2 * searchMargin,
          }, shapeId, gap, gridSize)
        }
        
        if (isBoundsFree(candidate, neighbors, gap)) {
          // Found a closer valid position
          lastValidPositions.set(shapeId, { x: cx, y: cy })
          return candidate
        }
      }
      
      // No closer position found, stick with last valid
      return lastBounds
    }
  }

  // No valid last position, do full distance-sorted search
  const searchMargin = gap + gridSize
  const offsets = distanceSortedOffsets(maxSearchRings, gridSize)
  
  for (const offset of offsets) {
    const cx = Math.round((seed.x + offset.x) / gridSize) * gridSize
    const cy = Math.round((seed.y + offset.y) / gridSize) * gridSize
    const candidate = { x: cx, y: cy, w: seed.w, h: seed.h }

    let neighbors = quickNeighbors
    if (Math.abs(cx - seed.x) > quickMargin || Math.abs(cy - seed.y) > quickMargin) {
      neighbors = getNeighborBounds(editor, {
        x: candidate.x - searchMargin,
        y: candidate.y - searchMargin,
        w: candidate.w + 2 * searchMargin,
        h: candidate.h + 2 * searchMargin,
      }, shapeId, gap, gridSize)
    }

    if (isBoundsFree(candidate, neighbors, gap)) {
      lastValidPositions.set(shapeId, { x: cx, y: cy })
      return candidate
    }
  }

  return seed
}

/**
 * Clear hysteresis state for a shape (call on drag end or shape delete)
 */
export function clearHysteresis(shapeId: TLShapeId): void {
  lastValidPositions.delete(shapeId)
}

/**
 * Lightweight compatibility hook: computes ghost candidates and applies end-of-gesture correction.
 * Kept for existing components that still render a ghost overlay.
 */
export function useCollisionAvoidance(options: CollisionAvoidanceOptions) {
  const { editor, shapeId, gap, gridSize, maxSearchRings } = options

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

// The hook has been removed in favor of ShapeUtil lifecycle usage.

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
