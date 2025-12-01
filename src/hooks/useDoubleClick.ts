import { useRef } from 'react'

/**
 * Hook for detecting double-click events with synthetic timing.
 * Calls the provided callback only when two clicks occur within the threshold.
 *
 * @param callback - Function to call on double-click
 * @param threshold - Time window in milliseconds (default: 300)
 * @returns Function to use in event handlers (e.g., onPointerDown, onClick)
 */
export function useDoubleClick<T = any>(
  callback: (event: T) => void,
  threshold: number = 300
): (event: T) => void {
  const lastClickTimeRef = useRef<number>(0)

  return (event: T) => {
    const now = Date.now()
    const timeSinceLastClick = now - lastClickTimeRef.current

    // Check if this is a double-click within the threshold
    if (timeSinceLastClick <= threshold) {
      // Reset the timer and execute callback
      lastClickTimeRef.current = 0
      callback(event)
    } else {
      // Record this as the first click
      lastClickTimeRef.current = now
    }
  }
}
