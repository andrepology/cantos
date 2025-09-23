import { useEffect, useMemo, useRef, useState } from 'react'
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
  // Visual distribution center (continuous, follows cursor smoothly)
  const centerRef = useRef<number | null>(null)
  // Cached bounds for stable math during drag
  const dragBoundsRef = useRef<{ left: number; width: number } | null>(null)

  const trackWidth = Math.min(220, Math.max(120, width * 0.4))
  const trackHeight = 36
  const baseHeight = 6
  const maxHeight = 22

  const effectiveCount = Math.max(0, count)

  const sigma = useMemo(() => {
    // Scale with count; clamp to avoid too-sharp or too-flat distributions
    return Math.max(0.8, Math.min(8, effectiveCount * 0.08 || 1))
  }, [effectiveCount])

  const [springs, api] = useSprings(effectiveCount, (i) => ({
    height: baseHeight,
    config: { tension: 380, friction: 32 },
    immediate: true,
  }))

  const indexFromClientX = (clientX: number) => {
    const el = trackRef.current
    if (!el || effectiveCount === 0) return 0
    const rect = dragBoundsRef.current ?? el.getBoundingClientRect()
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width)
    const ratio = rect.width > 0 ? x / rect.width : 0
    const idx = Math.round(ratio * Math.max(effectiveCount - 1, 0))
    return Math.min(Math.max(idx, 0), Math.max(effectiveCount - 1, 0))
  }

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

  useEffect(() => {
    // When count changes, reset heights
    updateHeights(null)
  }, [effectiveCount])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (effectiveCount === 0) return
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
    if (isDragging) return
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
    <div style={{ position: 'absolute', left: '50%', bottom: -2, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', padding: '6px 10px', borderRadius: 9999, background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(4px)' }}>
      <div
        ref={trackRef}
        data-interactive="scrubber"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
        style={{
          width: trackWidth,
          height: trackHeight,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          cursor: effectiveCount > 0 ? (isDragging ? 'grabbing' : 'grab') : 'default',
          padding: '6px 8px',
        }}
        aria-label="Scrubber"
        role="slider"
        aria-valuemin={0}
        aria-valuemax={Math.max(effectiveCount - 1, 0)}
        aria-valuenow={index}
      >
        {Array.from({ length: effectiveCount }).map((_, i) => {
          const isSelected = i === index
          const bg = isSelected ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.28)'
          return (
            <animated.div
              key={i}
              style={{
                width: 2,
                height: (springs[i] as any).height.to((h: number) => `${h}px`),
                background: bg,
                borderRadius: 2,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}


