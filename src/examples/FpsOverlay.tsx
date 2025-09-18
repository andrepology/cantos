import { useEffect, useMemo, useRef, useState } from 'react'

// Minimal FPS overlay. Renders a small fixed box top-left with current FPS.
// Uses requestAnimationFrame timestamps for measurement and a simple moving average.
export default function FpsOverlay(): JSX.Element | null {
  const [fps, setFps] = useState<number>(0)
  const rafId = useRef<number | null>(null)
  const lastTs = useRef<number | null>(null)
  const samples = useRef<number[]>([])

  const isEnabled = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has('fps')) return true
    // Vite exposes env vars under import.meta.env
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = (import.meta as any).env || import.meta.env
    return Boolean(env && env.VITE_DEBUG_FPS)
  }, [])

  useEffect(() => {
    if (!isEnabled) return

    const tick = (ts: number) => {
      if (lastTs.current != null) {
        const delta = ts - lastTs.current
        const currentFps = delta > 0 ? 1000 / delta : 0
        samples.current.push(currentFps)
        if (samples.current.length > 30) samples.current.shift()
        const avg = samples.current.reduce((a, b) => a + b, 0) / samples.current.length
        setFps(avg)
      }
      lastTs.current = ts
      rafId.current = requestAnimationFrame(tick)
    }

    rafId.current = requestAnimationFrame(tick)
    return () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current)
      rafId.current = null
      lastTs.current = null
      samples.current = []
    }
  }, [isEnabled])

  if (!isEnabled) return null

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: 8,
        padding: '4px 8px',
        background: 'rgba(0,0,0,0.6)',
        color: '#fff',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: 12,
        borderRadius: 4,
        pointerEvents: 'none',
        zIndex: 1000,
      }}
      aria-label="Frames per second"
    >
      {Math.round(fps)} fps
    </div>
  )
}


