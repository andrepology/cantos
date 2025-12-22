import { useEffect, useMemo, useRef, useState, useLayoutEffect, useCallback } from 'react'
import { animated, to, useSprings } from '@react-spring/web'
import { motion } from 'motion/react'
import { usePressFeedback } from '../hooks/usePressFeedback'
import { TEXT_TERTIARY } from './constants'

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
  const [isPlaying, setIsPlaying] = useState(false)
  const isPointerDownRef = useRef(false)
  const isHoveringRef = useRef(false)
  const onChangeRafRef = useRef<number | null>(null)
  const collapseRafRef = useRef<number | null>(null)
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
  const stopPlaying = useCallback(() => {
    setIsPlaying(false)
  }, [])

  const containerPadding = 6
  const pauseButtonSize = 28
  const controlGap = 4
  const trackPaddingX = 2
  const trackPaddingY = 6
  const trackWidthRatio = 0.58
  const trackMinPx = 56
  const trackMaxPx = 200
  const tickWidth = 2
  const slideshowIntervalMs = 8000


  // Fixed-percentage track width within the available space.
  const availableWidth = Math.max(
    0,
    width - containerPadding * 2 - pauseButtonSize - controlGap
  )
  const trackWidth = useMemo(() => {
    const target = availableWidth * trackWidthRatio
    const clamped = Math.min(trackMaxPx, Math.max(trackMinPx, target))
    return Math.max(0, Math.min(availableWidth, clamped))
  }, [availableWidth])
  const trackHeight = 36
  const baseHeight = 6
  const maxHeight = 22
  const contentStart = trackPaddingX
  const contentWidth = Math.max(0, trackWidth - trackPaddingX * 2)

  const effectiveCount = Math.max(0, count)
  const pausePlayFeedback = usePressFeedback({ scale: 0.92, hoverScale: 1.08, disabled: effectiveCount <= 1 })

  useEffect(() => {
    if (!isPlaying) return
    if (effectiveCount <= 1) return
    const id = window.setInterval(() => {
      if (effectiveCount <= 1) return
      const cur = indexRef.current
      const next = (cur + 1) % effectiveCount
      if (next !== cur) onChangeRef.current(next)
    }, slideshowIntervalMs)
    return () => window.clearInterval(id)
  }, [isPlaying, effectiveCount, slideshowIntervalMs])

  useEffect(() => {
    if (isPlaying && effectiveCount <= 1) {
      setIsPlaying(false)
    }
  }, [isPlaying, effectiveCount])

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
  const thumbRatio = effectiveCount > 1 ? index / (effectiveCount - 1) : 0.5
  const thumbX = contentStart + thumbRatio * contentWidth
  const thumbLeft = snapToPixel(thumbX - tickWidth / 2)

  const centerFromClientX = (clientX: number) => {
    const el = trackRef.current
    if (!el || effectiveCount === 0) return 0
    const rect = dragBoundsRef.current ?? el.getBoundingClientRect()
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width)
    const contentStart = trackPaddingX
    const contentEnd = Math.max(contentStart, rect.width - trackPaddingX)
    const contentRange = Math.max(contentEnd - contentStart, 0)

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
    stopPlaying()
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

  return (
    <div style={{ width: '100%', position: 'relative' }}>
      <div
        style={{
          width: '100%',
          position: 'relative',
          height: Math.max(trackHeight, pauseButtonSize),
          borderRadius: 9999,
          padding: `${containerPadding}px`,
        }}
      >
        <motion.div
          data-cursor="pointer"
          role="button"
          aria-label={isPlaying ? 'Pause' : 'Play'}
          aria-pressed={isPlaying}
          onPointerDown={(e) => {
            pausePlayFeedback.bind.onPointerDown(e)
            e.stopPropagation()
            if (effectiveCount <= 1) return
            setIsPlaying((prev) => !prev)
          }}
          onPointerUp={(e) => {
            pausePlayFeedback.bind.onPointerUp(e)
          }}
          onPointerCancel={(e) => {
            pausePlayFeedback.bind.onPointerUp(e)
          }}
          onMouseEnter={pausePlayFeedback.bind.onMouseEnter}
          onMouseLeave={pausePlayFeedback.bind.onMouseLeave}
          style={{
            position: 'absolute',
            left: `calc(50% - ${trackWidth / 2 + pauseButtonSize + controlGap}px)`,
            top: `calc(50% - ${pauseButtonSize / 2}px + 8px)`,
            width: pauseButtonSize,
            height: pauseButtonSize,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            cursor: effectiveCount > 1 ? 'pointer' : 'default',
            scale: pausePlayFeedback.pressScale,
            opacity: effectiveCount > 1 ? 1 : 0.5,
          }}
        >
          {isPlaying ? (
            <svg width="12" height="12" viewBox="0 0 10 10" aria-hidden="true">
              <rect x="1" y="1" width="3" height="8" rx="1.2" fill={TEXT_TERTIARY} />
              <rect x="6" y="1" width="3" height="8" rx="1.2" fill={TEXT_TERTIARY} />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 10 10" aria-hidden="true">
              <path
                d="M2.4 1.8 Q1.8 1.5 1.8 2.2 V7.8 Q1.8 8.5 2.4 8.2 L7.4 5.6 Q8.1 5.2 7.4 4.8 Z"
                fill={TEXT_TERTIARY}
              />
            </svg>
          )}
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
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: trackWidth,
            height: trackHeight,
            cursor: effectiveCount > 0 ? (isDragging ? 'grabbing' : 'grab') : 'default',
            padding: `${trackPaddingY}px ${trackPaddingX}px`,
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
                  left: contentStart,
                  right: trackPaddingX,
                  bottom: trackPaddingY,
                  height: baseHeight,
                  background: TEXT_TERTIARY,
                  borderRadius: 2,
                  opacity: 0.5,
                }}
              />
              {/* Thumb */}
              <div
                style={{
                  position: 'absolute',
                  left: thumbLeft,
                  bottom: trackPaddingY,
                  width: tickWidth,
                  height: baseHeight,
                  background: TEXT_TERTIARY,
                  borderRadius: 2,
                }}
              />
            </>
          ) : (
            // Animated ticks for low card counts
            Array.from({ length: Math.min(effectiveCount, maxAnimatedCount) }).map((_, i) => {
              const isSelected = i === index
              const bg = TEXT_TERTIARY
              const opacity = isSelected ? 1 : 0.6
              const ratio = effectiveCount > 1 ? i / (effectiveCount - 1) : 0.5
              const tickX = contentStart + ratio * contentWidth
              const left = snapToPixel(tickX - tickWidth / 2)
              return (
                <animated.div
                  key={i}
                  style={{
                    position: 'absolute',
                    left,
                    bottom: trackPaddingY,
                    width: tickWidth,
                    height: (springs[i] as any)?.height.to((h: number) => `${h}px`) ?? `${baseHeight}px`,
                    background: bg,
                    borderRadius: 2,
                    opacity,
                  }}
                />
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
