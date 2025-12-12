import { useEffect, useMemo, useRef, useState, useLayoutEffect, useCallback } from 'react'
import { animated, to, useSprings } from '@react-spring/web'
import { motion } from 'motion/react'
import { usePressFeedback } from '../hooks/usePressFeedback'

export type SpringTarget = {
  x: number
  y: number
  scale?: number
  rot?: number
  opacity?: number
  zIndex?: number
}

export type SpringConfig = {
  tension?: number
  friction?: number
}


export const AnimatedDiv = animated.div
export const interpolateTransform = (
  x: any,
  y: any,
  rot: any,
  scale: any
) => to([x, y, rot, scale], (tx, ty, r, s) => `translate(-50%, -50%) translate3d(${tx}px, ${ty}px, 0) rotate(${r}deg) scale(${s})`)

export function Scrubber({ count, index, onChange, width, onScrubStart, onScrubEnd, forceSimple }: {
  count: number;
  index: number;
  onChange: (i: number) => void;
  width: number;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  forceSimple?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isNavScrubbing, setIsNavScrubbing] = useState(false)
  const isPointerDownRef = useRef(false)
  const isHoveringRef = useRef(false)
  const onChangeRafRef = useRef<number | null>(null)
  const collapseRafRef = useRef<number | null>(null)
  // Hold-to-scrub controller (handles only)
  const holdRafRef = useRef<number | null>(null)
  const holdStartTsRef = useRef<number | null>(null)
  const holdLastTsRef = useRef<number | null>(null)
  const holdAccumMsRef = useRef(0)
  const holdDirRef = useRef<1 | -1 | 0>(0)
  const stopHoldListenersRef = useRef<(() => void) | null>(null)
  // Visual distribution center (continuous, follows cursor smoothly)
  const centerRef = useRef<number | null>(null)
  // Cached bounds for stable math during drag
  const dragBoundsRef = useRef<{ left: number; width: number } | null>(null)
  // Live index for rAF loop
  const indexRef = useRef(index)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    indexRef.current = index
    onChangeRef.current = onChange
  }, [index, onChange])
  // Simple press feedback for navigation buttons
  const leftButtonFeedback = usePressFeedback({ scale: 0.9, hoverScale: 1.12 })
  const rightButtonFeedback = usePressFeedback({ scale: 0.9, hoverScale: 1.12 })

  // Scale track width with count while respecting available space
  // Account for wrapper padding (12px total), button widths (24px each), and gap (4px)
  const availableWidth = width - 12 - 48 - 4 // 12px padding + 48px buttons + 4px gap
  const trackWidth = useMemo(() => {
    const maxTrack = Math.max(160, availableWidth)
    const minBarPitch = 3 // px per bar (compressed when necessary)
    const ideal = count > 1 ? count * minBarPitch : 60
    // For low counts, spread out to occupy more space while staying balanced
    const minWidthForBalance = Math.min(availableWidth * 0.8, 200)
    return Math.max(minWidthForBalance, Math.min(ideal, maxTrack))
  }, [count, availableWidth])
  const trackHeight = 36
  const baseHeight = 6
  const maxHeight = 22
  // Available width for tick positioning after subtracting horizontal padding (8px left + 8px right)
  const contentWidth = trackWidth - 16

  const effectiveCount = Math.max(0, count)

  // Snap to device pixels for crisp rendering
  const snapToPixel = (value: number) => Math.round(value)

  const sigma = useMemo(() => {
    // Scale with count; clamp to avoid too-sharp or too-flat distributions
    return Math.max(0.8, Math.min(8, effectiveCount * 0.08 || 1))
  }, [effectiveCount])

  const springConfig = useMemo(() => ({ tension: 380, friction: 32 }), [])
  // Always allocate springs for up to 30 items to avoid hook count mismatches
  // We'll only use them when useAnimated is true
  const maxAnimatedCount = 30
  const [springs, api] = useSprings(
    maxAnimatedCount,
    () => ({
      height: baseHeight,
      config: springConfig,
      immediate: true,
    }),
    []
  )

  // Only use animated mode when not forced to simple and count is reasonable
  const useAnimated = !forceSimple && effectiveCount <= 30

  const centerFromClientX = (clientX: number) => {
    const el = trackRef.current
    if (!el || effectiveCount === 0) return 0
    const rect = dragBoundsRef.current ?? el.getBoundingClientRect()
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width)
    // Map the click position to the content area (accounting for 8px left/right padding)
    // Content area starts at 8px and ends at rect.width - 8px
    const contentStart = 8
    const contentEnd = rect.width - 8
    const contentRange = contentEnd - contentStart

    // Clamp x to the content area bounds
    const clampedX = Math.min(Math.max(x, contentStart), contentEnd)
    const ratio = contentRange > 0 ? (clampedX - contentStart) / contentRange : 0

    const center = ratio * Math.max(effectiveCount - 1, 0)
    return Math.min(Math.max(center, 0), Math.max(effectiveCount - 1, 0))
  }

  const gaussianCache = useMemo(() => {
    const cache = new Map<string, number[]>()
    return {
      get: (center: number, count: number) => {
        const key = `${center.toFixed(2)}-${count}`
        if (!cache.has(key)) {
          const values = new Array(count)
          for (let i = 0; i < count; i++) {
            const d = (i - center) / sigma
            const g = Math.exp(-0.5 * d * d)
            values[i] = baseHeight + (maxHeight - baseHeight) * g
          }
          cache.set(key, values)
          // Limit cache size to prevent memory leaks
          if (cache.size > 50) {
            const firstKey = cache.keys().next().value
            if (firstKey) cache.delete(firstKey)
          }
        }
        return cache.get(key)!
      }
    }
  }, [sigma, baseHeight, maxHeight])

  const gaussianRef = useRef<(i: number, center: number) => number>((i: number, center: number) => baseHeight)
  gaussianRef.current = (i: number, center: number) => {
    const values = gaussianCache.get(center, effectiveCount)
    return values[i] ?? baseHeight
  }

  const gaussian = useCallback((i: number, center: number) => gaussianRef.current(i, center), [])

  const updateHeights = useCallback((center: number | null) => {
    // Skip spring animations for simple slider
    if (!useAnimated) return
    api.start((i) => ({
      height: center == null ? baseHeight : gaussian(i, center),
      immediate: false,
    }))
  }, [useAnimated, api, baseHeight, gaussian])

  // Synchronous setter to avoid a transient collapse on the first interaction frame
  const setHeightsImmediate = useCallback((center: number | null) => {
    // Skip spring animations for simple slider
    if (!useAnimated) return
    api.set((i) => ({
      height: center == null ? baseHeight : gaussian(i, center),
    }))
  }, [useAnimated, api, baseHeight, gaussian])

  // Prevent visual collapse when parent re-renders on index change during drag.
  // We re-assert the current distribution before paint when dragging or the pointer is down.
  useLayoutEffect(() => {
    // Skip spring animations for simple slider
    if (!useAnimated) return
    if (!isDragging && !isPointerDownRef.current) return
    const c = centerRef.current
    if (c == null) return
    // Ensure we assert the gaussian heights before paint without animation
    api.set((i) => ({ height: gaussian(i, c) }))
  }, [useAnimated, api, isDragging, index, gaussian])

  useEffect(() => {
    // When count changes, reset heights only if not interacting
    // Skip spring animations for simple slider
    if (!useAnimated) return
    if (!isPointerDownRef.current && !isDragging && !isHoveringRef.current) {
      updateHeights(null)
    }
  }, [useAnimated, isDragging, updateHeights])

  // Cleanup any scheduled rAFs on unmount
  useEffect(() => {
    return () => {
      if (onChangeRafRef.current != null) cancelAnimationFrame(onChangeRafRef.current)
      if (collapseRafRef.current != null) cancelAnimationFrame(collapseRafRef.current)
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (effectiveCount === 0) return
    isPointerDownRef.current = true
    setIsDragging(true)
    onScrubStart?.()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    // Cache bounds for stable math during drag
    const rect = e.currentTarget.getBoundingClientRect()
    dragBoundsRef.current = { left: rect.left, width: rect.width }
    const center = centerFromClientX(e.clientX)
    centerRef.current = center
    // Establish immediately on press to avoid any first-frame collapse
    setHeightsImmediate(center)
    const idx = Math.round(center)
    if (idx !== index) {
      if (onChangeRafRef.current != null) cancelAnimationFrame(onChangeRafRef.current)
      onChangeRafRef.current = requestAnimationFrame(() => onChange(idx))
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (effectiveCount === 0) return
    const center = centerFromClientX(e.clientX)
    centerRef.current = center
    if (isDragging) {
      // During drag, follow instantly for stability
      setHeightsImmediate(center)
    } else {
      // On hover, animate towards the cursor
      updateHeights(center)
    }
    if (isDragging) {
      const idx = Math.round(center)
      if (idx !== index) onChange(idx)
    }
  }

  const onPointerEnter = (e: React.PointerEvent<HTMLDivElement>) => {
    isHoveringRef.current = true
    if (effectiveCount === 0) return
    const center = centerFromClientX(e.clientX)
    centerRef.current = center
    // Animate in to meet the cursor
    updateHeights(center)
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isPointerDownRef.current = false
    setIsDragging(false)
    onScrubEnd?.()
    centerRef.current = null
    if (collapseRafRef.current != null) cancelAnimationFrame(collapseRafRef.current)
    collapseRafRef.current = requestAnimationFrame(() => {
      // Animate collapse back to base
      updateHeights(null)
    })
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch {}
    dragBoundsRef.current = null
  }

  const onPointerLeave = () => {
    isHoveringRef.current = false
    // Do not reset while dragging; we own pointer capture
    if (isDragging || isPointerDownRef.current) return
    centerRef.current = null
    updateHeights(null)
  }

  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    onPointerUp(e) // Treat cancel like pointer up
  }

  // Global listeners to prevent reset if pointer capture fails or pointer leaves DOM
  useEffect(() => {
    if (!isDragging) return
    const handleMove = (e: PointerEvent) => {
      if (effectiveCount === 0) return
      const center = centerFromClientX(e.clientX)
      centerRef.current = center
      updateHeights(center)
      const idx = Math.round(center)
      if (idx !== indexRef.current) onChangeRef.current(idx)
    }
    const handleUp = () => {
      isPointerDownRef.current = false
      centerRef.current = null
      if (collapseRafRef.current != null) cancelAnimationFrame(collapseRafRef.current)
      collapseRafRef.current = requestAnimationFrame(() => {
        updateHeights(null)
      })
      setIsDragging(false)
      dragBoundsRef.current = null
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [isDragging, effectiveCount, updateHeights])

  const stopHold = useCallback(() => {
    setIsNavScrubbing(false)
    if (holdRafRef.current != null) cancelAnimationFrame(holdRafRef.current)
    holdRafRef.current = null
    holdStartTsRef.current = null
    holdLastTsRef.current = null
    holdAccumMsRef.current = 0
    holdDirRef.current = 0
    if (stopHoldListenersRef.current) {
      stopHoldListenersRef.current()
      stopHoldListenersRef.current = null
    }
  }, [])

  const startHold = useCallback(
    (dir: 1 | -1) => {
      if (effectiveCount <= 1) return
      setIsNavScrubbing(true)
      holdDirRef.current = dir
      const start = performance.now()
      holdStartTsRef.current = start
      holdLastTsRef.current = start
      holdAccumMsRef.current = 0

      const tick = (ts: number) => {
        if (holdDirRef.current === 0) return
        const last = holdLastTsRef.current ?? ts
        const dt = ts - last
        holdLastTsRef.current = ts
        holdAccumMsRef.current += dt

        const elapsedMs = (ts - (holdStartTsRef.current ?? ts))
        // Only start accelerated scrubbing after 600ms brief hold period
        if (elapsedMs < 600) {
          holdRafRef.current = requestAnimationFrame(tick)
          return
        }

        const elapsedSec = elapsedMs / 1000
        const baseHz = 6
        const maxHz = Math.min(60, Math.max(8, 6 + 0.35 * effectiveCount))
        const k = 0.1
        const rate = baseHz + (maxHz - baseHz) * (1 - Math.exp(-k * elapsedSec))
        const interval = 1000 / rate

        while (holdAccumMsRef.current >= interval) {
          holdAccumMsRef.current -= interval
          const cur = indexRef.current
          const next = dir > 0 ? Math.min(cur + 1, Math.max(effectiveCount - 1, 0)) : Math.max(cur - 1, 0)
          if (next !== cur) onChangeRef.current(next)
        }
        holdRafRef.current = requestAnimationFrame(tick)
      }

      holdRafRef.current = requestAnimationFrame(tick)

      const up = () => stopHold()
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
      stopHoldListenersRef.current = () => {
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
      }
    },
    [effectiveCount, onChange, stopHold]
  )

  useEffect(() => {
    return () => stopHold()
  }, [stopHold])


  return (
    <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '6px 6px', borderRadius: 9999 }}>
      {/* Left nav button */}
      <motion.div
        data-cursor="pointer"
        role="button"
        aria-label="Previous"
        onPointerDown={(e) => {
          leftButtonFeedback.bind.onPointerDown(e)
          e.stopPropagation()
          if (effectiveCount === 0) return
          ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
          const next = Math.max(0, Math.min(index - 1, Math.max(effectiveCount - 1, 0)))
          if (next !== index) onChange(next)
          startHold(-1)
        }}
        onPointerUp={(e) => {
          leftButtonFeedback.bind.onPointerUp(e)
          stopHold()
        }}
        onPointerCancel={(e) => {
          leftButtonFeedback.bind.onPointerUp(e) // Use onPointerUp for cancel too
          stopHold()
        }}
        onMouseEnter={leftButtonFeedback.bind.onMouseEnter}
        onMouseLeave={leftButtonFeedback.bind.onMouseLeave}
        style={{
          width: 24,
          height: trackHeight,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingBottom: 6,
          cursor: effectiveCount > 0 ? 'pointer' : 'default',
          scale: leftButtonFeedback.pressScale
        }}
      >
        <div style={{ width: 6, height: baseHeight, background: 'rgba(0,0,0,0.18)', borderRadius: 2 }} />
      </motion.div>

      <div
        ref={trackRef}
        data-interactive="scrubber"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        style={{
          position: 'relative',
          width: trackWidth,
          height: trackHeight,
          cursor: effectiveCount > 0 ? (isDragging ? 'grabbing' : 'grab') : 'default',
          padding: '6px 8px',
          overflow: 'hidden',
        }}
        aria-label="Scrubber"
        role="slider"
        aria-valuemin={0}
        aria-valuemax={Math.max(effectiveCount - 1, 0)}
        aria-valuenow={index}
      >
        {!useAnimated ? (
          // Simple slider for high card counts
          <>
            {/* Track */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 6,
                height: baseHeight,
                background: 'rgba(0,0,0,0.12)',
                borderRadius: 2,
              }}
            />
            {/* Thumb */}
            <div
              style={{
                position: 'absolute',
                left: snapToPixel(effectiveCount > 1 ? (index / (effectiveCount - 1)) * (trackWidth - 2) : trackWidth / 2 - 1),
                bottom: 6,
                width: 2,
                height: baseHeight,
                background: 'rgba(0,0,0,0.85)',
                borderRadius: 2,
              }}
            />
          </>
        ) : (
          // Animated ticks for low card counts
          Array.from({ length: Math.min(effectiveCount, maxAnimatedCount) }).map((_, i) => {
            const isSelected = i === index
            const bg = isSelected ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.18)'
            const left = snapToPixel(effectiveCount > 1 ? 8 + (i / (effectiveCount - 1)) * contentWidth - 1 : 8 + contentWidth / 2 - 1)
            return (
              <animated.div
                key={i}
                style={{
                  position: 'absolute',
                  left,
                  bottom: 6,
                  width: 2,
                  height: (springs[i] as any)?.height.to((h: number) => `${h}px`) ?? `${baseHeight}px`,
                  background: bg,
                  borderRadius: 2,
                }}
              />
            )
          })
        )}
      </div>

      {/* Right nav button */}
      <motion.div
        data-cursor="pointer"
        role="button"
        aria-label="Next"
        onPointerDown={(e) => {
          rightButtonFeedback.bind.onPointerDown(e)
          e.stopPropagation()
          if (effectiveCount === 0) return
          ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
          const next = Math.max(0, Math.min(index + 1, Math.max(effectiveCount - 1, 0)))
          if (next !== index) onChange(next)
          startHold(1)
        }}
        onPointerUp={(e) => {
          rightButtonFeedback.bind.onPointerUp(e)
          stopHold()
        }}
        onPointerCancel={(e) => {
          rightButtonFeedback.bind.onPointerUp(e) // Use onPointerUp for cancel too
          stopHold()
        }}
        onMouseEnter={rightButtonFeedback.bind.onMouseEnter}
        onMouseLeave={rightButtonFeedback.bind.onMouseLeave}
        style={{
          width: 24,
          height: trackHeight,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingBottom: 6,
          cursor: effectiveCount > 0 ? 'pointer' : 'default',
          scale: rightButtonFeedback.pressScale
        }}
      >
        <div style={{ width: 6, height: baseHeight, background: 'rgba(0,0,0,0.18)', borderRadius: 2 }} />
      </motion.div>
    </div>
  )
}


