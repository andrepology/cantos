import { useMotionValue, useSpring, type MotionValue } from 'motion/react'
import { useCallback, useRef } from 'react'

export interface UsePressFeedbackOptions {
  scale?: number // How much to scale down on press (default: 0.95)
  hoverScale?: number // How much to scale up on hover (default: 1.02)
  stiffness?: number // Spring stiffness (default: 400)
  damping?: number // Spring damping (default: 25)
  disabled?: boolean // Disable feedback (default: false)
  onPointerDown?: (e: React.PointerEvent) => void // User-provided pointer down handler
  onPointerUp?: (e: React.PointerEvent) => void // User-provided pointer up handler
}

export interface UsePressFeedbackReturn {
  pressScale: MotionValue<number> // Smoothly animated motion value for scale transform
  bind: {
    onPointerDown: (e: React.PointerEvent) => void
    onPointerUp: (e: React.PointerEvent) => void
    onMouseEnter: (e: React.MouseEvent) => void
    onMouseLeave: (e: React.MouseEvent) => void
  }
  style: {
    scale: MotionValue<number> // Ready-to-use scale transform
    willChange: 'transform'
  }
}

/**
 * Hook that provides tactile press and hover feedback for interactive elements.
 * Uses Motion's useSpring for smooth, physics-based animations.
 * 
 * Scales up slightly on hover, down on press, and springs back smoothly.
 */
export function usePressFeedback(options: UsePressFeedbackOptions = {}): UsePressFeedbackReturn {
  const {
    scale: pressScaleAmount = 0.96,
    hoverScale: hoverScaleAmount = 1.02,
    stiffness = 400,
    damping = 25,
    disabled = false,
    onPointerDown: userOnPointerDown,
    onPointerUp: userOnPointerUp
  } = options

  // Base motion value that we update imperatively
  const scaleTarget = useMotionValue(1)
  
  // useSpring provides smooth spring-based tracking of scaleTarget
  // This is the idiomatic Motion pattern for smooth animated values
  const pressScale = useSpring(scaleTarget, { stiffness, damping })
  
  // Track hover state with a ref (no need for MotionValue overhead)
  const isHoveredRef = useRef(false)

  // Wrapper handlers that provide tactile feedback and call user handlers
  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    if (!disabled) {
      isHoveredRef.current = true
      scaleTarget.set(hoverScaleAmount)
    }
  }, [scaleTarget, hoverScaleAmount, disabled])

  const handleMouseLeave = useCallback((e: React.MouseEvent) => {
    if (!disabled) {
      isHoveredRef.current = false
      scaleTarget.set(1)
    }
  }, [scaleTarget, disabled])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!disabled) {
      scaleTarget.set(pressScaleAmount)
    }
    userOnPointerDown?.(e)
  }, [scaleTarget, pressScaleAmount, disabled, userOnPointerDown])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!disabled) {
      // Return to hover scale if still hovered, otherwise to normal scale
      const targetScale = isHoveredRef.current ? hoverScaleAmount : 1
      scaleTarget.set(targetScale)
    }
    userOnPointerUp?.(e)
  }, [scaleTarget, hoverScaleAmount, disabled, userOnPointerUp])

  return {
    pressScale,
    bind: {
      onPointerDown: handlePointerDown,
      onPointerUp: handlePointerUp,
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave
    },
    style: {
      scale: pressScale,
      willChange: 'transform'
    }
  }
}
