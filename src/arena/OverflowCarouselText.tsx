import React, { useEffect, useMemo, useRef, useState } from 'react'
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

export function OverflowCarouselText({
  text,
  maxWidthPx = 160,
  gapPx = 24,
  speedPxPerSec = 60,
  fadePx = 24,
  className,
  textStyle,
}: OverflowCarouselTextProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLSpanElement>(null)
  const [contentWidth, setContentWidth] = useState(0)
  const [containerWidth, setContainerWidth] = useState(0)
  const [active, setActive] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    ensureStylesInjected()
  }, [])

  useEffect(() => {
    const mm = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handle = () => setReducedMotion(!!mm.matches)
    handle()
    mm.addEventListener?.('change', handle)
    return () => mm.removeEventListener?.('change', handle)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content) return

    const ro = new ResizeObserver(() => {
      setContainerWidth(container.clientWidth)
      setContentWidth(content.scrollWidth)
    })
    ro.observe(container)
    ro.observe(content)
    // Initial measure
    setContainerWidth(container.clientWidth)
    setContentWidth(content.scrollWidth)
    return () => ro.disconnect()
  }, [])

  const overflowing = contentWidth > containerWidth + 1
  const distance = Math.max(0, contentWidth + gapPx)
  const durationSec = distance > 0 && speedPxPerSec > 0 ? distance / speedPxPerSec : 0

  const maskIdle = useMemo(() => {
    // Right fade only
    return `linear-gradient(to right, black calc(100% - ${fadePx}px), transparent 100%)`
  }, [fadePx])

  const maskActive = useMemo(() => {
    // Both sides fade while animating
    return `linear-gradient(to right, transparent 0px, black ${fadePx}px, black calc(100% - ${fadePx}px), transparent 100%)`
  }, [fadePx])

  const wrapperStyle: CSSProperties = {
    position: 'relative',
    display: 'inline-block',
    overflow: 'hidden',
    verticalAlign: 'bottom',
    maxWidth: maxWidthPx,
    minWidth: 0,
    // Fades via mask-image only when overflowing; duplicate for webkit
    maskImage: overflowing ? (active ? (maskActive as any) : (maskIdle as any)) : undefined,
    WebkitMaskImage: overflowing ? (active ? (maskActive as any) : (maskIdle as any)) : undefined,
  }

  const trackStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'baseline',
    willChange: active && overflowing ? 'transform' : undefined,
    transform: 'translateX(0)',
    // CSS vars for animation
    ['--carousel-distance' as any]: `${distance}px`,
    ['--carousel-duration' as any]: `${durationSec}s`,
    animation: active && overflowing && !reducedMotion ? `oc_scroll var(--carousel-duration) linear infinite` : undefined,
  }

  const contentStyle: CSSProperties = {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    ...textStyle,
  }

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
}

export default OverflowCarouselText


