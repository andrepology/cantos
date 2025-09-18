import { useEffect, useMemo } from 'react'
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
  return (
    <div style={{ position: 'absolute', left: '50%', bottom: 8, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 9999, background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(4px)', border: '1px solid rgba(0,0,0,.08)' }}>
      <input
        type="range"
        min={0}
        max={Math.max(count - 1, 0)}
        value={index}
        onChange={(e) => onChange(Number((e.target as HTMLInputElement).value))}
        style={{ width: Math.min(220, Math.max(120, width * 0.4)) }}
      />
    </div>
  )
}


