import { useState, useRef, useCallback, useEffect } from 'react'
import type { MixBlendBorderHandle } from '../MixBlendBorder'

/**
 * Hook for managing hover state with imperative border updates.
 * Provides a single source of truth for hover state that coordinates
 * between UI effects and border visual feedback.
 */
export function useHoverBorder() {
  const [isHovered, setIsHovered] = useState(false)
  const borderRef = useRef<MixBlendBorderHandle>(null)

  // Update border imperatively when hover state changes
  useEffect(() => {
    borderRef.current?.setHovered(isHovered)
  }, [isHovered])

  // Hover handlers
  const handlePointerEnter = useCallback(() => {
    setIsHovered(true)
  }, [])

  const handlePointerLeave = useCallback(() => {
    setIsHovered(false)
  }, [])

  return {
    isHovered,
    borderRef,
    handlePointerEnter,
    handlePointerLeave,
  }
}
