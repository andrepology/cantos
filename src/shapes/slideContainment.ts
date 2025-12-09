import type { Editor, TLShape, TLShapeId } from 'tldraw'
import { SLIDE_SIZE } from '../editor/SlidesManager'

export const SLIDE_CONTAINMENT_MARGIN = 16

export interface Bounds {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Find the slide that contains the center of the given bounds.
 * Falls back to the nearest slide, or the canonical slide size at origin.
 */
export function findContainingSlide(editor: Editor, bounds: Bounds): Bounds {
  const cx = bounds.x + bounds.w / 2
  const cy = bounds.y + bounds.h / 2

  // Get all slide shapes on the current page
  const slides = editor.getCurrentPageShapes().filter(
    (s): s is TLShape & { type: 'slide' } => s.type === 'slide'
  )

  // First pass: find slide whose bounds contain the center point
  for (const slide of slides) {
    const b = editor.getShapePageBounds(slide)
    if (!b) continue
    if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) {
      return { x: b.x, y: b.y, w: b.w, h: b.h }
    }
  }

  // Second pass: find nearest slide by distance to center
  let nearest: Bounds | null = null
  let nearestDist = Infinity

  for (const slide of slides) {
    const b = editor.getShapePageBounds(slide)
    if (!b) continue
    
    const dx = Math.max(b.x - cx, 0, cx - (b.x + b.w))
    const dy = Math.max(b.y - cy, 0, cy - (b.y + b.h))
    const dist = Math.hypot(dx, dy)
    
    if (dist < nearestDist) {
      nearestDist = dist
      nearest = { x: b.x, y: b.y, w: b.w, h: b.h }
    }
  }

  // Fallback: canonical slide at origin
  return nearest ?? { x: 0, y: 0, w: SLIDE_SIZE.w, h: SLIDE_SIZE.h }
}

/**
 * Clamp bounds to stay within a slide, respecting margin.
 * Returns new x, y position (does not modify width/height).
 */
export function clampPositionToSlide(
  bounds: Bounds,
  slide: Bounds,
  margin: number = SLIDE_CONTAINMENT_MARGIN
): { x: number; y: number } {
  const minX = slide.x + margin
  const minY = slide.y + margin
  const maxX = slide.x + slide.w - margin - bounds.w
  const maxY = slide.y + slide.h - margin - bounds.h

  return {
    x: Math.min(Math.max(bounds.x, minX), maxX),
    y: Math.min(Math.max(bounds.y, minY), maxY),
  }
}

/**
 * Get the maximum allowed dimensions for a shape within a slide.
 */
export function getMaxDimensionsInSlide(
  slide: Bounds,
  margin: number = SLIDE_CONTAINMENT_MARGIN
): { maxW: number; maxH: number } {
  return {
    maxW: Math.max(1, slide.w - 2 * margin),
    maxH: Math.max(1, slide.h - 2 * margin),
  }
}

/**
 * Clamp dimensions to fit within the slide interior.
 */
export function clampDimensionsToSlide(
  w: number,
  h: number,
  slide: Bounds,
  minW: number,
  minH: number,
  margin: number = SLIDE_CONTAINMENT_MARGIN
): { w: number; h: number } {
  const { maxW, maxH } = getMaxDimensionsInSlide(slide, margin)
  return {
    w: Math.max(minW, Math.min(w, maxW)),
    h: Math.max(minH, Math.min(h, maxH)),
  }
}

/**
 * Compute constrained position for a shape being translated.
 * Call this from ShapeUtil.onTranslate to enforce real-time containment.
 */
export function computeConstrainedTranslate(
  editor: Editor,
  shapeId: TLShapeId,
  currentX: number,
  currentY: number
): { x: number; y: number } | undefined {
  const shape = editor.getShape(shapeId)
  if (!shape) return undefined

  const pageBounds = editor.getShapePageBounds(shape)
  if (!pageBounds) return undefined

  // Use current position with the shape's dimensions
  const bounds: Bounds = {
    x: currentX,
    y: currentY,
    w: pageBounds.w,
    h: pageBounds.h,
  }

  const slide = findContainingSlide(editor, bounds)
  const clamped = clampPositionToSlide(bounds, slide)

  // Only return if position changed
  if (Math.abs(clamped.x - currentX) < 0.01 && Math.abs(clamped.y - currentY) < 0.01) {
    return undefined
  }

  return clamped
}
