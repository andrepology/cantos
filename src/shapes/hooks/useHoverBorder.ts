import { useState, useCallback } from 'react'

/**
 * Hook for managing hover state with imperative border updates.
 * Provides a single source of truth for hover state that coordinates
 * between UI effects and border visual feedback.
 */
export function useHoverBorder() {
  const [isHovered, setIsHovered] = useState(false)

  // Hover handlers
  const handlePointerEnter = useCallback(() => {
    setIsHovered(true)
  }, [])

  const handlePointerLeave = useCallback(() => {
    setIsHovered(false)
  }, [])

  return {
    isHovered,
    handlePointerEnter,
    handlePointerLeave,
  }
}




