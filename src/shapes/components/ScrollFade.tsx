import { memo, useMemo, useState, useCallback, useRef, useEffect } from 'react'

interface ScrollFadeProps {
  children: React.ReactNode
  style?: React.CSSProperties
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void
  minTopFadeStrength?: number
  minBottomFadeStrength?: number
  alwaysShowTopFade?: boolean
  fadeSizePx?: number
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
  alwaysShowTopFade = false,
  fadeSizePx,
}: ScrollFadeProps) {
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const [scrollState, setScrollState] = useState({
    canScrollUp: false,
    canScrollDown: false,
    scrollTop: 0,
    maxScroll: 0
  })

  const updateScrollState = useCallback((el: HTMLDivElement) => {
    const scrollTop = el.scrollTop
    const scrollHeight = el.scrollHeight
    const clientHeight = el.clientHeight
    const maxScroll = scrollHeight - clientHeight

    // Determine if there's room to scroll
    const canScrollUp = scrollTop > 0
    const canScrollDown = scrollTop < maxScroll - 1

    setScrollState({ canScrollUp, canScrollDown, scrollTop, maxScroll })
  }, [])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    onScroll?.(e)
    updateScrollState(e.currentTarget)
  }

  // Check initial scroll state on mount
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      nodeRef.current = node
      updateScrollState(node)
    }
  }, [updateScrollState])

  useEffect(() => {
    const node = nodeRef.current
    if (!node || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      updateScrollState(node)
    })
    observer.observe(node)
    observer.observe(node.firstElementChild ?? node)

    return () => observer.disconnect()
  }, [updateScrollState])

  const maskImage = useMemo(() => {
    const fadePx = fadeSizePx ?? 42
    const isScrollable = scrollState.maxScroll > 1 || scrollState.canScrollDown
    const showTopFade = (alwaysShowTopFade && isScrollable) || scrollState.canScrollUp

    // Fade in/out based on absolute pixel distance from edges
    // This ensures consistency regardless of list length
    const topFadeStrength = showTopFade
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
  }, [scrollState, minTopFadeStrength, minBottomFadeStrength, alwaysShowTopFade])

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
