export type ResponsiveFontOptions = {
  width: number
  height: number
  compact?: boolean
  minPx?: number
  maxPx?: number
  slopeK?: number
}

export type ResponsiveFont = { fontSizePx: number; lineHeight: number }

export function computeResponsiveFont({ width, height, compact, minPx = 6, maxPx = 22, slopeK = 0.055 }: ResponsiveFontOptions): ResponsiveFont {
  const minDim = Math.max(1, Math.min(width, height))
  let size = Math.round(slopeK * minDim)
  if (compact) size = Math.max(minPx, Math.floor(size * 0.92))
  size = Math.max(minPx, Math.min(maxPx, size))
  const t = (size - minPx) / Math.max(1, maxPx - minPx)
  const lineHeight = 1.45 - 0.12 * Math.max(0, Math.min(1, t))
  return { fontSizePx: size, lineHeight }
}


