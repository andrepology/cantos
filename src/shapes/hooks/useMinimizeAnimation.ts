import { useMotionValue, animate } from 'motion/react'
import { useLayoutEffect } from 'react'
import type { MinimizeConfig } from '../types/minimizeTypes'

/**
 * Hook for managing minimize/restore animation state using motion values
 */
export function useMinimizeAnimation(
  w: number,
  h: number,
  x: number,
  y: number,
  config: MinimizeConfig = {}
) {
  const animDuration = config.animDuration || 0.25

  // Motion values for animating visual state
  const contentW = useMotionValue(w)
  const contentH = useMotionValue(h)
  const contentX = useMotionValue(0)
  const contentY = useMotionValue(0)

  // Sync motion values when props change to reset visual state to logical state
  useLayoutEffect(() => {
    contentW.stop()
    contentH.stop()
    contentX.stop()
    contentY.stop()

    contentW.set(w)
    contentH.set(h)
    contentX.set(0)
    contentY.set(0)
  }, [w, h, x, y, contentW, contentH, contentX, contentY])

  /**
   * Animates the minimize/restore transition
   */
  const animateTransition = (
    targetW: number,
    targetH: number,
    newX: number,
    newY: number,
    currentX: number,
    currentY: number
  ) => {
    // Calculate visual deltas (how much the content should move visually)
    const visualDeltaX = newX - currentX
    const visualDeltaY = newY - currentY

    // Animate dimensions
    animate(contentW, targetW, { duration: animDuration, ease: 'easeInOut' })
    animate(contentH, targetH, { duration: animDuration, ease: 'easeInOut' })

    // Animate position (only if there's movement)
    if (visualDeltaX !== 0) {
      animate(contentX, visualDeltaX, { duration: animDuration, ease: 'easeInOut' })
    }
    if (visualDeltaY !== 0) {
      animate(contentY, visualDeltaY, { duration: animDuration, ease: 'easeInOut' })
    }
  }

  return {
    contentW,
    contentH,
    contentX,
    contentY,
    animateTransition
  }
}


