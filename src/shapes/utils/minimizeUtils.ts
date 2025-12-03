import type { MinimizeRegion, AnchorPoint, MinimizeTarget, AnchoredPosition, MinimizeConfig } from '../types/minimizeTypes'

/**
 * Default configuration for minimize/restore behavior
 */
const DEFAULT_CONFIG: Required<MinimizeConfig> = {
  threshold: 40,
  animDuration: 0.25,
  cornerSize: { w: 100, h: 100 },
  edgeSizes: {
    top: { h: 40 },
    bottom: { h: 40 },
    left: { w: 60 },
    right: { w: 60 }
  }
}

/**
 * Detects which region of a shape was clicked based on coordinates
 */
export function detectMinimizeRegion(
  x: number,
  y: number,
  w: number,
  h: number,
  threshold: number = DEFAULT_CONFIG.threshold
): MinimizeRegion {
  const isTop = y < threshold
  const isBottom = y > h - threshold
  const isLeft = x < threshold
  const isRight = x > w - threshold

  if (isTop && isLeft) return 'top-left-corner'
  if (isTop && isRight) return 'top-right-corner'
  if (isBottom && isLeft) return 'bottom-left-corner'
  if (isBottom && isRight) return 'bottom-right-corner'
  if (isTop) return 'top-edge'
  if (isBottom) return 'bottom-edge'
  if (isLeft) return 'left-edge'
  if (isRight) return 'right-edge'

  return 'center'
}

/**
 * Calculates the target dimensions and anchor point for minimize/restore based on region
 */
export function calculateMinimizeTarget(
  region: MinimizeRegion,
  isMinimized: boolean,
  currentW: number,
  currentH: number,
  restoredW?: number,
  restoredH?: number,
  config: MinimizeConfig = {}
): MinimizeTarget {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }

  if (isMinimized) {
    // RESTORE: Use stored dimensions or defaults
    return {
      targetW: restoredW || 320,
      targetH: restoredH || 320,
      anchor: 'tl' // Restore to top-left anchor
    }
  }

  // MINIMIZE: Determine target based on region
  if (region === 'center') {
    throw new Error('Cannot minimize from center region')
  }

  let targetW = currentW
  let targetH = currentH
  let anchor: AnchorPoint

  if (region.includes('corner')) {
    targetW = mergedConfig.cornerSize.w
    targetH = mergedConfig.cornerSize.h

    switch (region) {
      case 'top-left-corner': anchor = 'br'; break
      case 'top-right-corner': anchor = 'bl'; break
      case 'bottom-left-corner': anchor = 'tr'; break
      case 'bottom-right-corner': anchor = 'tl'; break
      default: anchor = 'tl' // fallback
    }
  } else {
    // Edges
    switch (region) {
      case 'top-edge':
        targetH = mergedConfig.edgeSizes.top.h
        anchor = 'bottom'
        break
      case 'bottom-edge':
        targetH = mergedConfig.edgeSizes.bottom.h
        anchor = 'top'
        break
      case 'left-edge':
        targetW = mergedConfig.edgeSizes.left.w
        anchor = 'right'
        break
      case 'right-edge':
        targetW = mergedConfig.edgeSizes.right.w
        anchor = 'left'
        break
      default:
        anchor = 'tl' // fallback
    }
  }

  return { targetW, targetH, anchor }
}

/**
 * Calculates new position based on anchor point to keep it fixed during resize
 */
export function calculateAnchoredPosition(
  currentX: number,
  currentY: number,
  currentW: number,
  currentH: number,
  targetW: number,
  targetH: number,
  anchor: AnchorPoint
): AnchoredPosition {
  let newX = currentX
  let newY = currentY

  switch (anchor) {
    case 'tl':
      newX = currentX
      newY = currentY
      break
    case 'tr':
      newX = currentX + currentW - targetW
      newY = currentY
      break
    case 'bl':
      newX = currentX
      newY = currentY + currentH - targetH
      break
    case 'br':
      newX = currentX + currentW - targetW
      newY = currentY + currentH - targetH
      break
    case 'top':
      newX = currentX
      newY = currentY
      break
    case 'bottom':
      newX = currentX
      newY = currentY + currentH - targetH
      break
    case 'left':
      newX = currentX
      newY = currentY
      break
    case 'right':
      newX = currentX + currentW - targetW
      newY = currentY
      break
  }

  return { newX, newY }
}
