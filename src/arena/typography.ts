export type ResponsiveFontOptions = {
  width: number
  height: number
  compact?: boolean
  minPx?: number
  maxPx?: number
  slopeK?: number
}

export type ResponsiveFont = { fontSizePx: number; lineHeight: number }

export function computeResponsiveFont({ width, height, compact, minPx = 6, maxPx = 22, slopeK = 0.040 }: ResponsiveFontOptions): ResponsiveFont {
  const minDim = Math.max(1, Math.min(width, height))
  let size = Math.round(slopeK * minDim)
  if (compact) size = Math.max(minPx, Math.floor(size * 0.92))
  size = Math.max(minPx, Math.min(maxPx, size))
  const t = (size - minPx) / Math.max(1, maxPx - minPx)
  const lineHeight = 1.45 - 0.12 * Math.max(0, Math.min(1, t))
  return { fontSizePx: size, lineHeight }
}

export type PackedFontOptions = {
  text: string
  width: number
  height: number
  minFontSize?: number
  maxFontSize?: number
  padding?: number
  lineHeight?: number
}

export type PackedFontResult = {
  fontSizePx: number
  lineHeight: number
  maxLines: number
  charsPerLine: number
  overflow: boolean
  padding: number  // Base padding value (for backward compatibility)
  asymmetricPadding: string  // CSS padding string optimized for text readability
}

/**
 * Computes responsive padding that scales with card dimensions.
 * Larger cards get more padding, smaller cards get less.
 *
 * @param width - Card width
 * @param height - Card height
 * @param minPadding - Minimum padding in pixels (default: 4)
 * @param maxPadding - Maximum padding in pixels (default: 24)
 * @returns Scaled padding value
 */
export function computeScaledPadding(
  width: number,
  height: number,
  minPadding = 8,
  maxPadding = 24
): number {
  // Use the minimum dimension to determine padding
  const minDim = Math.min(width, height)

  // Scale padding between min and max based on card size
  // Small cards (< 64px): minimal padding
  // Medium cards (128px): moderate padding
  // Large cards (> 256px): maximum padding
  const normalized = Math.max(0, Math.min(1, (minDim - 64) / (256 - 64)))
  const padding = minPadding + (maxPadding - minPadding) * normalized

  // Round to nearest 2px for cleaner layout
  return Math.round(padding / 2) * 2
}

/**
 * Computes asymmetric padding string optimized for text readability.
 * Uses more padding on right than left, with adjusted top/bottom.
 *
 * @param width - Card width
 * @param height - Card height
 * @param minPadding - Minimum base padding (default: 4)
 * @param maxPadding - Maximum base padding (default: 24)
 * @returns CSS padding string: "top right bottom left"
 */
export function computeAsymmetricTextPadding(
  width: number,
  height: number,
  minPadding = 8,
  maxPadding = 24
): string {
  const basePadding = computeScaledPadding(width, height, minPadding, maxPadding)

  // For text readability: more padding on right than left
  // Right gets ~40% more padding than left for better visual balance
  const leftPadding = basePadding
  const rightPadding = Math.round(basePadding * 1.6) // 110% more on right

  // Top gets slightly more than base, bottom gets slightly less
  // This creates a natural reading flow
  const topPadding = Math.round(basePadding * 0.8)
  const bottomPadding = Math.round(basePadding * 0.9)

  // Round all to nearest 1px for clean layout
  const roundToEven = (n: number) => Math.round(n)

  return `${roundToEven(topPadding)}px ${roundToEven(rightPadding)}px ${roundToEven(bottomPadding)}px ${roundToEven(leftPadding)}px`
}

/**
 * Computes optimal font size to pack as much text as possible into given dimensions.
 * Uses binary search to find the largest font size where all text fits.
 * Designed for spatial canvases where users can zoom to read small text.
 */
export function computePackedFont({
  text,
  width,
  height,
  minFontSize = 6,
  maxFontSize = 32,
  padding,  // If not provided, will be auto-scaled
  lineHeight = 1.2,
}: PackedFontOptions): PackedFontResult {
  // Auto-scale padding if not explicitly provided
  const actualPadding = padding !== undefined ? padding : computeScaledPadding(width, height)

  // Handle edge cases
  if (!text || text.length === 0) {
    return {
      fontSizePx: minFontSize,
      lineHeight,
      maxLines: 0,
      charsPerLine: 0,
      overflow: false,
      padding: actualPadding,
      asymmetricPadding: computeAsymmetricTextPadding(width, height),
    }
  }

  const availableWidth = Math.max(1, width - 2 * actualPadding)
  const availableHeight = Math.max(1, height - 2 * actualPadding)

  // Estimate character width as 0.6 * fontSize (based on typical proportional fonts)
  const estimateCharsPerLine = (fontSize: number) => {
    const charWidth = fontSize * 0.6
    return Math.floor(availableWidth / charWidth)
  }

  const estimateMaxLines = (fontSize: number) => {
    const lineHeightPx = fontSize * lineHeight
    return Math.floor(availableHeight / lineHeightPx)
  }

  // Check if text fits at a given font size
  const textFitsAt = (fontSize: number): boolean => {
    const charsPerLine = estimateCharsPerLine(fontSize)
    if (charsPerLine <= 0) return false

    const maxLines = estimateMaxLines(fontSize)
    if (maxLines <= 0) return false

    // Calculate how many lines we need for the text
    // Simple word-wrapping simulation
    const words = text.split(/\s+/)
    let currentLine = ''
    let linesNeeded = 1

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word
      if (testLine.length > charsPerLine) {
        if (currentLine) {
          // Start new line
          linesNeeded++
          currentLine = word
        } else {
          // Single word longer than line - will need to break it
          linesNeeded += Math.ceil(word.length / charsPerLine)
          currentLine = ''
        }
      } else {
        currentLine = testLine
      }
    }

    return linesNeeded <= maxLines
  }

  // Binary search for optimal font size
  let low = minFontSize
  let high = maxFontSize
  let bestFontSize = minFontSize
  let overflow = true

  // First check if even minimum size fits
  if (textFitsAt(minFontSize)) {
    overflow = false
    // Binary search for largest size that fits
    while (high - low > 0.5) {
      const mid = (low + high) / 2
      if (textFitsAt(mid)) {
        bestFontSize = mid
        low = mid
      } else {
        high = mid
      }
    }
  } else {
    // Text doesn't fit even at minimum - we have overflow
    bestFontSize = minFontSize
    overflow = true
  }

  // Round to nearest 0.5px for cleaner rendering
  bestFontSize = Math.round(bestFontSize * 2) / 2

  return {
    fontSizePx: bestFontSize,
    lineHeight,
    maxLines: estimateMaxLines(bestFontSize),
    charsPerLine: estimateCharsPerLine(bestFontSize),
    overflow,
    padding: actualPadding,
    asymmetricPadding: computeAsymmetricTextPadding(width, height),
  }
}


