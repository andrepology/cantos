import { useMotionValue, animate, MotionValue } from 'motion/react'
import { useCallback } from 'react'

export interface UsePressFeedbackOptions {
  scale?: number // How much to scale down (default: 0.95)
  stiffness?: number // Spring stiffness (default: 400)
  damping?: number // Spring damping (default: 25)
  disabled?: boolean // Disable feedback (default: false)
  onPointerDown?: (e: React.PointerEvent) => void // User-provided pointer down handler
  onPointerUp?: (e: React.PointerEvent) => void // User-provided pointer up handler
}

export interface UsePressFeedbackReturn {
  pressScale: MotionValue<number> // Motion value for combining with other transforms
  bind: {
    onPointerDown: (e: React.PointerEvent) => void
    onPointerUp: (e: React.PointerEvent) => void
  }
  style: {
    scale: MotionValue<number> // Ready-to-use scale transform for simple cases
    willChange: 'transform'
  }
}

/**
 * Hook that provides tactile press feedback for interactive elements.
 * Scales down on pointer down and springs back up on pointer up.
 */
export function usePressFeedback(options: UsePressFeedbackOptions = {}): UsePressFeedbackReturn {
  const {
    scale: pressScaleAmount = 0.95,
    stiffness = 400,
    damping = 25,
    disabled = false,
    onPointerDown: userOnPointerDown,
    onPointerUp: userOnPointerUp
  } = options

  // Motion value for press feedback
  const pressScale = useMotionValue(1)

  // Wrapper handlers that provide tactile feedback and call user handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!disabled) {
      animate(pressScale, pressScaleAmount, { type: "spring", stiffness, damping })
    }
    userOnPointerDown?.(e)
  }, [pressScale, pressScaleAmount, stiffness, damping, disabled, userOnPointerDown])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!disabled) {
      animate(pressScale, 1, { type: "spring", stiffness, damping })
    }
    userOnPointerUp?.(e)
  }, [pressScale, stiffness, damping, disabled, userOnPointerUp])

  // Ready-to-use scale transform for simple cases
  const scale = pressScale

  return {
    pressScale,
    bind: {
      onPointerDown: handlePointerDown,
      onPointerUp: handlePointerUp
    },
    style: {
      scale,
      willChange: 'transform'
    }
  }
}
