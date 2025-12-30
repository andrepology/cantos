import { useMemo } from 'react'
import { calculateReferenceDimensions, type ReferenceDimensions } from '../../arena/layout'
import { computeResponsiveFont } from '../../arena/typography'

export type PortalMode = 'search' | 'channel' | 'user'

export interface PortalDimensions {
  // Search UI
  searchFont: {
    fontSizePx: number
    lineHeight: number
  }
  searchPadding: {
    containerVertical: number
    containerHorizontal: number
    inputVertical: number
    inputLeft: number
  }
  
  // Label UI
  baseFontPx: number
  zoomAwareFontPx: number
  labelHeight: number
  labelOffset: number
  labelIconPx: number
  profileIconPx: number
  
  // Layout
  sideGapPx: number
  gapW: number
  
  // Mode and visibility
  mode: PortalMode
  hasTarget: boolean
  hideLabelAboveShape: boolean
  predictedLayoutMode: string
  referenceDimensions?: ReferenceDimensions
}

export function usePortalDimensions(
  w: number,
  h: number,
  z: number,
  channel?: string,
  userId?: number
): PortalDimensions {
  // Determine mode
  const hasTarget = (!!channel && channel.trim() !== '') || !!userId
  const mode: PortalMode = !hasTarget ? 'search' : (channel ? 'channel' : 'user')

  // Search UI calculations
  const searchFont = useMemo(
    () => computeResponsiveFont({ width: w, height: h, compact: false, minPx: 12, maxPx: 32, slopeK: 0.16 }),
    [w, h]
  )

  const searchPadding = useMemo(() => {
    const minDim = Math.max(1, Math.min(w, h))
    const basePadding = Math.max(4, Math.min(16, minDim * 0.04))
    return {
      containerVertical: Math.round(basePadding * 1.2),
      containerHorizontal: Math.round(basePadding),
      inputVertical: Math.round(basePadding * 0.6),
      inputLeft: Math.round(basePadding * 1.5),
    }
  }, [w, h])

  // Label UI calculations
  const sideGapPx = 8
  const gapW = sideGapPx / z
  const baseFontPx = 14
  const zoomAwareFontPx = baseFontPx / Math.min(z, 1.5)
  const labelHeight = zoomAwareFontPx * 1.2 - 8
  const labelOffset = -20 / Math.min(z, 1.5)
  const labelIconPx = Math.max(1, Math.floor(zoomAwareFontPx))
  const profileIconPx = labelIconPx

  // Reference dimensions for coordination with other shapes
  const referenceDimensions: ReferenceDimensions | undefined = useMemo(() => {
    if (!channel && !userId) return undefined
    return calculateReferenceDimensions(w, h, 'stack')
  }, [channel, userId, w, h])

  // Predict layout mode to coordinate label visibility
  const predictedLayoutMode = useMemo(() => {
    return calculateReferenceDimensions(w, h).layoutMode
  }, [w, h])

  const hideLabelAboveShape = predictedLayoutMode === 'mini' || predictedLayoutMode === 'tab' || predictedLayoutMode === 'vtab'

  return {
    searchFont,
    searchPadding,
    baseFontPx,
    zoomAwareFontPx,
    labelHeight,
    labelOffset,
    labelIconPx,
    profileIconPx,
    sideGapPx,
    gapW,
    mode,
    hasTarget,
    hideLabelAboveShape,
    predictedLayoutMode,
    referenceDimensions,
  }
}

