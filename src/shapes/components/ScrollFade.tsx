import { memo, useMemo, useState, useCallback } from 'react'

interface ScrollFadeProps {
  children: React.ReactNode
  style?: React.CSSProperties
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void
  minTopFadeStrength?: number
  minBottomFadeStrength?: number
  dataCardText?: boolean
  stopWheelPropagation?: boolean
  fadePx?: number
}

/**
 * ScrollFade - A wrapper component that adds smooth fade effects at the top and bottom
 * of scrollable content to indicate scrollability.
 *
 * Features:
 * - Dynamic fade strength based on scroll position
 * - Handles initial scroll state detection
 * - Smooth transitions between fade states
 */
export const ScrollFade = memo(function ScrollFade({
  children,
  style,
  onScroll,
  minTopFadeStrength = 0,
  minBottomFadeStrength = 0,
  dataCardText = false,
  stopWheelPropagation = false,
  fadePx = 42,
}: ScrollFadeProps) {
  const [scrollState, setScrollState] = useState({
    canScrollUp: false,
    canScrollDown: false,
    scrollTop: 0,
    maxScroll: 0
  })

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    onScroll?.(e)
    const el = e.currentTarget
    const scrollTop = el.scrollTop
    const scrollHeight = el.scrollHeight
    const clientHeight = el.clientHeight
    const maxScroll = scrollHeight - clientHeight

    // Determine if there's room to scroll
    const canScrollUp = scrollTop > 0
    const canScrollDown = scrollTop < maxScroll - 1

    setScrollState({ canScrollUp, canScrollDown, scrollTop, maxScroll })
  }

  // Check initial scroll state on mount
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const scrollHeight = node.scrollHeight
      const clientHeight = node.clientHeight
      const maxScroll = scrollHeight - clientHeight
      const canScrollDown = scrollHeight > clientHeight

      setScrollState({
        canScrollUp: false,
        canScrollDown,
        scrollTop: 0,
        maxScroll
      })
    }
  }, [])

  const maskImage = useMemo(() => {
    // Fade in/out based on absolute pixel distance from edges
    // This ensures consistency regardless of list length
    const topFadeStrength = scrollState.canScrollUp
      ? Math.min(1, Math.max(minTopFadeStrength, scrollState.scrollTop / fadePx))
      : 0

    const bottomFadeStrength = scrollState.canScrollDown
      ? Math.min(1, Math.max(minBottomFadeStrength, (scrollState.maxScroll - scrollState.scrollTop) / fadePx))
      : 0

    // Interpolate between transparent (0) and opaque (1)
    const topStops = topFadeStrength > 0.01
      ? `transparent 0px, black ${fadePx * topFadeStrength}px`
      : `black 0px`

    const bottomStops = bottomFadeStrength > 0.01
      ? `black calc(100% - ${fadePx * bottomFadeStrength}px), transparent 100%`
      : `black 100%`

    return `linear-gradient(to bottom, ${topStops}, ${bottomStops})`
  }, [scrollState, minTopFadeStrength, minBottomFadeStrength, fadePx])

  // Hover Intent Logic
  const lastInteraction = useState(() => ({ time: 0 }))[0]
  const lastRejection = useState(() => ({ time: 0 }))[0]

  const handleInteraction = useCallback(() => {
    lastInteraction.time = Date.now()
  }, [])

  return (
    <div
      ref={containerRef}
      className="hide-scrollbar"
      data-card-text={dataCardText ? 'true' : undefined}
      style={{
        ...style,
        maskImage,
        WebkitMaskImage: maskImage,
      }}
      onMouseEnter={handleInteraction}
      onMouseMove={handleInteraction}
      onScroll={handleScroll}
      onWheelCapture={(e) => {
        // Early exits for cases where we shouldn't intercept
        if (!stopWheelPropagation) return
        if (e.ctrlKey) return
        
        // Allow horizontal scrolling to pass through (e.g. for deck panning)
        const deltaX = Math.abs(e.deltaX ?? 0)
        const deltaY = Math.abs(e.deltaY ?? 0)
        if (deltaX > deltaY) return
        
        // Validate scroll state exists
        if (!scrollState) return

        const now = Date.now()
        const lastInteractionTime = lastInteraction?.time ?? 0
        const lastRejectionTime = lastRejection?.time ?? 0
        
        // 1. Settle Time: User must hover for 800ms before we accept scroll
        const isUnsettled = (now - lastInteractionTime) < 300
        // 2. Continuous Rejection: If we rejected recently (user is scrolling deck), keep rejecting
        const isContinuousDeckScroll = (now - lastRejectionTime) < 300

        if (isUnsettled || isContinuousDeckScroll) {
          if (lastRejection) {
            lastRejection.time = now // Extend rejection window
          }
          return // Let it bubble to Deck
        }

        e.stopPropagation()
      }}
    >
      {children}
    </div>
  )
})
