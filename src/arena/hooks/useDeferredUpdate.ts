import { useRef, useCallback, useEffect, startTransition } from 'react'

/**
 * Hook for deferring expensive state updates using requestAnimationFrame.
 * Useful for preventing wheel/scroll event handlers from blocking the main thread.
 * Uses RAF to batch updates and startTransition to mark them as non-urgent,
 * allowing high-priority events to complete first without blocking.
 *
 * @param updateFn - The function to call with the deferred value
 * @returns A function to schedule deferred updates
 */
export function useDeferredUpdate<T>(updateFn: (value: T) => void) {
  const pendingValueRef = useRef<T | null>(null)
  const rafRef = useRef<number | null>(null)

  const scheduleUpdate = useCallback((value: T) => {
    pendingValueRef.current = value
    if (rafRef.current == null) {
      // Use requestAnimationFrame to batch updates at the next repaint
      // This aligns updates with the browser's rendering cycle
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        if (pendingValueRef.current !== null) {
          const nextValue = pendingValueRef.current
          pendingValueRef.current = null
          // Wrap in startTransition to mark as non-urgent
          // React will prioritize user input events over this update
          startTransition(() => {
            updateFn(nextValue)
          })
        }
      })
    }
  }, [updateFn])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
        pendingValueRef.current = null
      }
    }
  }, [])

  return scheduleUpdate
}
