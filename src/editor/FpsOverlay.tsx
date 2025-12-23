import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'

interface FpsStats {
  currentFps: number
  avgFps: number
  fps1Low: number
  longFrameCount: number
  longFrameShare: number
  frameCount: number
}

const SAMPLE_WINDOW_MS = 5000
const LONG_FRAME_MS = 16.7

// Shared hook used by both the editor overlay and the tactile deck debug panel.
export function useFpsStats(): FpsStats {
  const [stats, setStats] = useState<FpsStats>({
    currentFps: 0,
    avgFps: 0,
    fps1Low: 0,
    longFrameCount: 0,
    longFrameShare: 0,
    frameCount: 0,
  })

  const rafId = useRef<number | null>(null)
  const lastTs = useRef<number | null>(null)
  const frameTimes = useRef<number[]>([])
  const frameCountTotal = useRef<number>(0)
  const longFrameCount = useRef<number>(0)

  useEffect(() => {
    const tick = (ts: number) => {
      if (lastTs.current != null) {
        const delta = ts - lastTs.current
        if (delta > 0) {
          frameTimes.current.push(delta)
          frameCountTotal.current += 1
          if (delta > LONG_FRAME_MS) {
            longFrameCount.current += 1
          }

          const cutoff = ts - SAMPLE_WINDOW_MS
          let accumulated = 0
          const filtered: number[] = []
          for (let i = frameTimes.current.length - 1; i >= 0; i--) {
            accumulated += frameTimes.current[i]
            if (accumulated > SAMPLE_WINDOW_MS) break
            filtered.unshift(frameTimes.current[i])
          }
          frameTimes.current = filtered

          const currentFps = 1000 / delta
          const avgFps =
            filtered.length === 0
              ? 0
              : 1000 / (filtered.reduce((a, b) => a + b, 0) / filtered.length)

          let fps1Low = 0
          if (filtered.length > 0) {
            const sorted = [...filtered].sort((a, b) => a - b)
            const index = Math.max(0, Math.floor(sorted.length * 0.99) - 1)
            const p99Delta = sorted[index]
            fps1Low = 1000 / p99Delta
          }

          const longShare =
            frameCountTotal.current === 0
              ? 0
              : (longFrameCount.current / frameCountTotal.current) * 100

          setStats({
            currentFps,
            avgFps,
            fps1Low,
            longFrameCount: longFrameCount.current,
            longFrameShare: longShare,
            frameCount: frameCountTotal.current,
          })
        }
      }
      lastTs.current = ts
      rafId.current = requestAnimationFrame(tick)
    }

    rafId.current = requestAnimationFrame(tick)
    return () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current)
      rafId.current = null
      lastTs.current = null
      frameTimes.current = []
      frameCountTotal.current = 0
      longFrameCount.current = 0
    }
  }, [])

  return stats
}

// FPS overlay that always renders when mounted, using the shared stats hook.
export default function FpsOverlay(): ReactElement | null {
  const stats = useFpsStats()

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        padding: '4px 8px',
        background: 'rgba(0,0,0,0.6)',
        color: '#fff',
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: 12,
        borderRadius: 4,
        pointerEvents: 'none',
        zIndex: 1000,
      }}
      aria-label="Frames per second"
    >
      {Math.round(stats.currentFps)} fps (avg {Math.round(stats.avgFps)} • 1%{' '}
      {Math.round(stats.fps1Low)} • long {stats.longFrameShare.toFixed(1)}%)
    </div>
  )
}


