import React, { useEffect, useMemo, useRef, useState, useCallback, memo } from 'react'
import type { CSSProperties } from 'react'

export type OverflowCarouselTextProps = {
  text: string
  maxWidthPx?: number
  gapPx?: number
  speedPxPerSec?: number
  fadePx?: number
  className?: string
  textStyle?: CSSProperties
}

let stylesInjected = false
function ensureStylesInjected() {
  if (stylesInjected) return
  const style = document.createElement('style')
  style.textContent = `
@keyframes oc_scroll {
  from { transform: translateX(0); }
  to { transform: translateX(calc(-1 * var(--carousel-distance, 0px))); }
}
@media (prefers-reduced-motion: reduce) {
  .oc_reduced_motion { animation: none !important; }
}`
  document.head.appendChild(style)
  stylesInjected = true
}

// Performance optimizations:
// - React.memo to prevent unnecessary re-renders
// - Combined measurements state to reduce state updates
// - Throttled ResizeObserver measurements (~60fps)
// - Memoized expensive calculations and style objects
export const OverflowCarouselText = memo(function OverflowCarouselText({
  text,
  maxWidthPx = 160,
  gapPx = 24,
  speedPxPerSec = 40,
  fadePx = 24,
  className,
  textStyle,
}: OverflowCarouselTextProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLSpanElement>(null)
  const [measurements, setMeasurements] = useState({ contentWidth: 0, containerWidth: 0 })
  const [active, setActive] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)


  useEffect(() => {
    // Combine related effects into one
    ensureStylesInjected()

    const mm = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handleReducedMotion = () => setReducedMotion(!!mm.matches)
    handleReducedMotion()
    mm.addEventListener?.('change', handleReducedMotion)

    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content) {
      mm.removeEventListener?.('change', handleReducedMotion)
      return
    }

    let frame = -1
    let timeout = -1

    const measure = () => {
      frame = -1
      const newMeasurements = {
        containerWidth: container.clientWidth,
        contentWidth: content.scrollWidth
      }
      setMeasurements(newMeasurements)
    }

    const scheduleMeasure = () => {
      if (frame !== -1) return
      // Throttle measurements to reduce excessive updates
      if (timeout !== -1) clearTimeout(timeout)
      timeout = window.setTimeout(() => {
        frame = requestAnimationFrame(measure)
      }, 16) // ~60fps throttling
    }

    const ro = new ResizeObserver(scheduleMeasure)
    ro.observe(container)
    ro.observe(content)

    // Initial measure
    scheduleMeasure()

    return () => {
      mm.removeEventListener?.('change', handleReducedMotion)
      if (frame !== -1) cancelAnimationFrame(frame)
      if (timeout !== -1) clearTimeout(timeout)
      ro.disconnect()
    }
  }, [])

  // Memoize expensive calculations
  const { overflowing, distance, durationSec, maskIdle, maskActive } = useMemo(() => {
    const overflowing = measurements.contentWidth > measurements.containerWidth + 1
    const distance = Math.max(0, measurements.contentWidth + gapPx)
    const durationSec = distance > 0 && speedPxPerSec > 0 ? distance / speedPxPerSec : 0

    const maskIdle = `linear-gradient(to right, black calc(100% - ${fadePx}px), transparent 100%)`
    const maskActive = `linear-gradient(to right, transparent 0px, black ${fadePx}px, black calc(100% - ${fadePx}px), transparent 100%)`

    return { overflowing, distance, durationSec, maskIdle, maskActive }
  }, [measurements, gapPx, speedPxPerSec, fadePx])

  // Memoize style objects to prevent recreation on every render
  const wrapperStyle = useMemo((): CSSProperties => ({
    position: 'relative',
    display: 'inline-block',
    overflow: 'hidden',
    verticalAlign: 'bottom',
    maxWidth: maxWidthPx,
    minWidth: 0,
    // Fades via mask-image only when overflowing; duplicate for webkit
    maskImage: overflowing ? (active ? (maskActive as any) : (maskIdle as any)) : undefined,
    WebkitMaskImage: overflowing ? (active ? (maskActive as any) : (maskIdle as any)) : undefined,
  }), [maxWidthPx, overflowing, active, maskActive, maskIdle])

  const trackStyle = useMemo((): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'baseline',
    willChange: active && overflowing ? 'transform' : undefined,
    transform: 'translateX(0)',
    // CSS vars for animation
    ['--carousel-distance' as any]: `${distance}px`,
    ['--carousel-duration' as any]: `${durationSec}s`,
    animation: active && overflowing && !reducedMotion ? `oc_scroll var(--carousel-duration) linear infinite` : undefined,
  }), [active, overflowing, reducedMotion, distance, durationSec])

  const contentStyle = useMemo((): CSSProperties => ({
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    ...textStyle,
  }), [textStyle])

  return (
    <div
      ref={containerRef}
      className={reducedMotion ? `oc_reduced_motion${className ? ' ' + className : ''}` : className}
      style={wrapperStyle}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      <div style={trackStyle}>
        <span ref={contentRef} style={contentStyle}>{text}</span>
        {active && overflowing ? (
          <>
            <span style={{ display: 'inline-block', width: gapPx }} />
            <span aria-hidden="true" style={contentStyle}>{text}</span>
          </>
        ) : null}
      </div>
    </div>
  )
})


