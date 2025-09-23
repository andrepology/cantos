import { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react'
import { animated, to, useSprings } from '@react-spring/web'

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

export function useLayoutSprings<K extends string | number>(
  keys: readonly K[],
  getTarget: (index: number, key: K) => SpringTarget,
  config: SpringConfig = { tension: 500, friction: 40 }
) {
  const initial = useMemo(() => keys.map((k, i) => ({ ...getTarget(i, k) })), [keys])

  const [springs, api] = useSprings(initial.length, (i) => ({
    x: initial[i]?.x ?? 0,
    y: initial[i]?.y ?? 0,
    rot: initial[i]?.rot ?? 0,
    scale: initial[i]?.scale ?? 1,
    opacity: initial[i]?.opacity ?? 1,
    config,
    immediate: true,
  }))

  useEffect(() => {
    api.start((i) => {
      const t = getTarget(i, keys[i])
      return t
        ? {
            x: t.x,
            y: t.y,
            rot: t.rot ?? 0,
            scale: t.scale ?? 1,
            opacity: t.opacity ?? 1,
            immediate: false,
            config,
          }
        : { x: 0, y: 0, rot: 0, scale: 1, opacity: 1 }
    })
  }, [keys, getTarget, config, api])

  return springs
}

export const AnimatedDiv = animated.div
export const interpolateTransform = (
  x: any,
  y: any,
  rot: any,
  scale: any
) => to([x, y, rot, scale], (tx, ty, r, s) => `translate(-50%, -50%) translate3d(${tx}px, ${ty}px, 0) rotate(${r}deg) scale(${s})`)

export function Scrubber({ count, index, onChange, width }: { count: number; index: number; onChange: (i: number) => void; width: number }) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const isPointerDownRef = useRef(false)
  // Visual distribution center (continuous, follows cursor smoothly)
  const centerRef = useRef<number | null>(null)
  // Cached bounds for stable math during drag
  const dragBoundsRef = useRef<{ left: number; width: number } | null>(null)

  // Scale track width with count while respecting available space
  const trackWidth = useMemo(() => {
    const minTrack = 120
    const maxTrack = Math.max(180, Math.min(width * 0.9, width - 120))
    const minBarPitch = 3 // px per bar (compressed when necessary)
    const ideal = count > 1 ? count * minBarPitch : minTrack
    return Math.max(minTrack, Math.min(ideal, maxTrack))
  }, [count, width])
  const trackHeight = 36
  const baseHeight = 6
  const maxHeight = 22

  const effectiveCount = Math.max(0, count)

  const sigma = useMemo(() => {
    // Scale with count; clamp to avoid too-sharp or too-flat distributions
    return Math.max(0.8, Math.min(8, effectiveCount * 0.08 || 1))
  }, [effectiveCount])

  const springConfig = useMemo(() => ({ tension: 380, friction: 32 }), [])
  const [springs, api] = useSprings(
    effectiveCount,
    () => ({
      height: baseHeight,
      config: springConfig,
      immediate: true,
    }),
    [effectiveCount]
  )

  const centerFromClientX = (clientX: number) => {
    const el = trackRef.current
    if (!el || effectiveCount === 0) return 0
    const rect = dragBoundsRef.current ?? el.getBoundingClientRect()
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width)
    const ratio = rect.width > 0 ? x / rect.width : 0
    const center = ratio * Math.max(effectiveCount - 1, 0)
    return Math.min(Math.max(center, 0), Math.max(effectiveCount - 1, 0))
  }

  const gaussian = (i: number, center: number) => {
    const d = (i - center) / sigma
    const g = Math.exp(-0.5 * d * d)
    return baseHeight + (maxHeight - baseHeight) * g
  }

  const updateHeights = (center: number | null) => {
    api.start((i) => ({
      height: center == null ? baseHeight : gaussian(i, center),
      immediate: false,
    }))
  }

  // Prevent visual collapse when parent re-renders on index change during drag.
  // We re-assert the current distribution before paint when dragging or the pointer is down.
  useLayoutEffect(() => {
    if (!isDragging && !isPointerDownRef.current) return
    const c = centerRef.current
    if (c == null) return
    api.start((i) => ({ height: gaussian(i, c), immediate: true }))
  }, [api, isDragging, index])

  useEffect(() => {
    // When count changes, reset heights only if not interacting
    if (!isPointerDownRef.current && !isDragging) {
      updateHeights(null)
    }
  }, [effectiveCount, isDragging])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (effectiveCount === 0) return
    isPointerDownRef.current = true
    setIsDragging(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    // Cache bounds for stable math during drag
    const rect = e.currentTarget.getBoundingClientRect()
    dragBoundsRef.current = { left: rect.left, width: rect.width }
    const center = centerFromClientX(e.clientX)
    centerRef.current = center
    updateHeights(center)
    const idx = Math.round(center)
    if (idx !== index) onChange(idx)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (effectiveCount === 0) return
    const center = centerFromClientX(e.clientX)
    centerRef.current = center
    updateHeights(center)
    if (isDragging) {
      const idx = Math.round(center)
      if (idx !== index) onChange(idx)
    }
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isPointerDownRef.current = false
    setIsDragging(false)
    centerRef.current = null
    updateHeights(null)
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch {}
    dragBoundsRef.current = null
  }

  const onPointerLeave = () => {
    // Do not reset while dragging; we own pointer capture
    if (isDragging || isPointerDownRef.current) return
    centerRef.current = null
    updateHeights(null)
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
      if (idx !== index) onChange(idx)
    }
    const handleUp = () => {
      isPointerDownRef.current = false
      centerRef.current = null
      updateHeights(null)
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
  }, [isDragging, effectiveCount, index, onChange])

  return (
    <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '6px 10px', borderRadius: 9999, background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(4px)' }}>
      {/* Left nav button */}
      <div
        role="button"
        aria-label="Previous"
        onPointerDown={(e) => {
          e.stopPropagation()
          if (effectiveCount === 0) return
          const next = Math.max(0, Math.min(index - 1, Math.max(effectiveCount - 1, 0)))
          if (next !== index) onChange(next)
        }}
        style={{ width: 28, height: trackHeight, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 6, cursor: effectiveCount > 0 ? 'pointer' : 'default' }}
      >
        <div style={{ width: 6, height: baseHeight, background: 'rgba(0,0,0,0.28)', borderRadius: 2 }} />
      </div>

      <div
        ref={trackRef}
        data-interactive="scrubber"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
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
        {Array.from({ length: effectiveCount }).map((_, i) => {
          const isSelected = i === index
          const bg = isSelected ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.28)'
          const left = effectiveCount > 1 ? (i / (effectiveCount - 1)) * (trackWidth - 2) : (trackWidth - 2) / 2
          return (
            <animated.div
              key={i}
              style={{
                position: 'absolute',
                left,
                bottom: 6,
                width: 2,
                height: (springs[i] as any).height.to((h: number) => `${h}px`),
                background: bg,
                borderRadius: 2,
              }}
            />
          )
        })}
      </div>

      {/* Right nav button */}
      <div
        role="button"
        aria-label="Next"
        onPointerDown={(e) => {
          e.stopPropagation()
          if (effectiveCount === 0) return
          const next = Math.max(0, Math.min(index + 1, Math.max(effectiveCount - 1, 0)))
          if (next !== index) onChange(next)
        }}
        style={{ width: 28, height: trackHeight, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 6, cursor: effectiveCount > 0 ? 'pointer' : 'default' }}
      >
        <div style={{ width: 6, height: baseHeight, background: 'rgba(0,0,0,0.28)', borderRadius: 2 }} />
      </div>
    </div>
  )
}


