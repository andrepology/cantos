import { useState, useCallback } from 'react'

/**
 * Hook for managing hover state with imperative border updates.
 * Provides a single source of truth for hover state that coordinates
 * between UI effects and border visual feedback.
 */
export function useHoverBorder(opts?: { shouldIgnore?: () => boolean }) {
  const [isHovered, setIsHovered] = useState(false)
  const shouldIgnore = opts?.shouldIgnore

  // Hover handlers
  const handlePointerEnter = useCallback(() => {
    if (shouldIgnore?.()) return
    setIsHovered(true)
  }, [shouldIgnore])

  const handlePointerLeave = useCallback(() => {
    if (shouldIgnore?.()) return
    setIsHovered(false)
  }, [shouldIgnore])

  return {
    isHovered,
    handlePointerEnter,
    handlePointerLeave,
  }
}



