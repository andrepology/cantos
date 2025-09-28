import { memo } from 'react'
import type { TileCandidate } from './tiling/types'

export interface TilingPreviewOverlayProps {
  candidate: TileCandidate | null
  opacity?: number
  borderColor?: string
  fillColor?: string
}

const DEFAULT_OPACITY = 0.35

export const TilingPreviewOverlay = memo(function TilingPreviewOverlay({ candidate, opacity = DEFAULT_OPACITY, borderColor = 'rgba(0,0,0,0.35)', fillColor = 'rgba(0,0,0,0.1)' }: TilingPreviewOverlayProps) {
  if (!candidate) return null
  const { x, y, w, h } = candidate
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        pointerEvents: 'none',
        border: `1px solid ${borderColor}`,
        backgroundColor: fillColor,
        opacity,
        borderRadius: 4,
        boxSizing: 'border-box',
      }}
    />
  )
})

