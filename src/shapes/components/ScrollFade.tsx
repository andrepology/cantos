import { memo, useMemo, useState, useCallback } from 'react'

interface ScrollFadeProps {
  children: React.ReactNode
  style?: React.CSSProperties
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
  style
}: ScrollFadeProps) {
  const [scrollState, setScrollState] = useState({
    canScrollUp: false,
    canScrollDown: false,
    scrollRatio: 0
  })

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const scrollTop = el.scrollTop
    const scrollHeight = el.scrollHeight
    const clientHeight = el.clientHeight
    const maxScroll = scrollHeight - clientHeight

    // Determine if there's room to scroll
    const canScrollUp = scrollTop > 1 // Small threshold to avoid floating point issues
    const canScrollDown = scrollTop < maxScroll - 1

    const scrollRatio = maxScroll > 0 ? scrollTop / maxScroll : 0

    setScrollState({ canScrollUp, canScrollDown, scrollRatio })
  }

  // Check initial scroll state on mount
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const scrollHeight = node.scrollHeight
      const clientHeight = node.clientHeight
      const canScrollDown = scrollHeight > clientHeight

      setScrollState({
        canScrollUp: false,
        canScrollDown,
        scrollRatio: 0
      })
    }
  }, [])

  const maskImage = useMemo(() => {
    const fadePx = 42

    // Smoothly fade in/out based on proximity to edges
    // Use easing for gentler transitions
    const topFadeStrength = scrollState.canScrollUp
      ? Math.min(1, scrollState.scrollRatio * 3) // Fade in quickly in first 33% of scroll
      : 0

    const bottomFadeStrength = scrollState.canScrollDown
      ? Math.min(1, (1 - scrollState.scrollRatio) * 3) // Fade in quickly in last 33% of scroll
      : 0

    // Interpolate between transparent (0) and opaque (1)
    const topStops = topFadeStrength > 0.01
      ? `transparent 0px, black ${fadePx * topFadeStrength}px`
      : `black 0px`

    const bottomStops = bottomFadeStrength > 0.01
      ? `black calc(100% - ${fadePx * bottomFadeStrength}px), transparent 100%`
      : `black 100%`

    return `linear-gradient(to bottom, ${topStops}, ${bottomStops})`
  }, [scrollState])

  return (
    <div
      ref={containerRef}
      className="hide-scrollbar"
      style={{
        ...style,
        maskImage,
        WebkitMaskImage: maskImage,
      }}
      onScroll={handleScroll}
    >
      {children}
    </div>
  )
})