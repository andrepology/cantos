/**
 * Types for tactile portal minimize/restore functionality
 */

export type MinimizeRegion =
  | 'center'
  | 'top-left-corner'
  | 'top-right-corner'
  | 'bottom-left-corner'
  | 'bottom-right-corner'
  | 'top-edge'
  | 'bottom-edge'
  | 'left-edge'
  | 'right-edge'

export type AnchorPoint =
  | 'tl'  // Top-left
  | 'tr'  // Top-right
  | 'bl'  // Bottom-left
  | 'br'  // Bottom-right
  | 'top'    // Top edge
  | 'bottom' // Bottom edge
  | 'left'   // Left edge
  | 'right'  // Right edge

export interface MinimizeTarget {
  targetW: number
  targetH: number
  anchor: AnchorPoint
}

export interface AnchoredPosition {
  newX: number
  newY: number
}

export interface MinimizeConfig {
  threshold?: number
  animDuration?: number
  cornerSize?: { w: number; h: number }
  edgeSizes?: {
    top: { h: number }
    bottom: { h: number }
    left: { w: number }
    right: { w: number }
  }
}



