import { memo } from 'react'
import type React from 'react'
import type { AnchorInfo, RectLike, TileCandidate } from './tiling/types'

export interface TilingPreviewOverlayProps {
  candidate: TileCandidate | null
  opacity?: number
  borderColor?: string
  fillColor?: string
  // Optional debug visualization
  debugSamples?: Array<{
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
  }>
  anchorAabb?: AnchorInfo['aabb'] | null
  snappedAnchorAabb?: RectLike | null
  pageBounds?: RectLike | null
}

const DEFAULT_OPACITY = 0.35

export const TilingPreviewOverlay = memo(function TilingPreviewOverlay({ candidate, opacity = DEFAULT_OPACITY, borderColor = 'rgba(0,0,0,0.35)', fillColor = 'rgba(0,0,0,0.1)', debugSamples, anchorAabb, snappedAnchorAabb, pageBounds }: TilingPreviewOverlayProps) {
  const layers: React.ReactElement[] = []
  if (pageBounds) {
    const { x, y, w, h } = pageBounds
    layers.push(
      <div
        key="page"
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: w,
          height: h,
          pointerEvents: 'none',
          border: '1px dashed rgba(0,128,255,0.4)',
          borderRadius: 4,
          boxSizing: 'border-box',
        }}
      />
    )
  }
  const isDebug = Array.isArray(debugSamples)
  if (isDebug && anchorAabb) {
    const { x, y, w, h } = anchorAabb
    layers.push(
      <div
        key="anchor"
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: w,
          height: h,
          pointerEvents: 'none',
          border: '2px solid rgba(255,128,0,0.7)',
          borderRadius: 4,
          boxSizing: 'border-box',
        }}
      />
    )
  }
  if (isDebug && snappedAnchorAabb) {
    const { x, y, w, h } = snappedAnchorAabb
    layers.push(
      <div
        key="snapped-anchor"
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: w,
          height: h,
          pointerEvents: 'none',
          border: '1px dashed rgba(128,128,128,0.5)',
          borderRadius: 4,
          boxSizing: 'border-box',
        }}
      />
    )
  }
  if (isDebug) {
    debugSamples.forEach((s, i) => {
      const color = s.accepted
        ? 'rgba(0,200,0,0.6)'
        : s.rejectedByBounds
        ? 'rgba(200,0,0,0.5)'
        : s.rejectedByBlockedList
        ? 'rgba(200,0,0,0.5)'
        : s.rejectedAsDuplicate
        ? 'rgba(128,128,128,0.35)'
        : 'rgba(0,0,0,0.2)'
      const stroke = s.accepted ? '2px solid rgba(0,160,0,0.9)' : '1px solid rgba(0,0,0,0.35)'
      layers.push(
        <div
          key={`sample-${i}`}
          title={`${s.source}${s.accepted ? ' ✓' : ''}`}
          style={{
            position: 'absolute',
            left: s.x,
            top: s.y,
            width: s.w,
            height: s.h,
            pointerEvents: 'none',
            border: stroke,
            backgroundColor: color,
            opacity: 0.15,
            borderRadius: 3,
            boxSizing: 'border-box',
          }}
        />
      )
    })
  }
  if (candidate) {
    const { x, y, w, h } = candidate
    layers.push(
      <div
        key="candidate"
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: w,
          height: h,
          pointerEvents: 'none',
          border: `2px solid ${borderColor}`,
          backgroundColor: fillColor,
          opacity,
          borderRadius: 4,
          boxSizing: 'border-box',
        }}
      />
    )
  }
  if (layers.length === 0) return null
  return <>{layers}</>
})

