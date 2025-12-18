import { useEffect, useRef } from 'react'
import { useMotionValue, type MotionValue } from 'motion/react'
import { useEditor } from 'tldraw'

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

/**
 * One zoom subscription per portal; drives a stable MotionValue so children can
 * stay memoized while still being zoom-aware.
 */
export function usePortalTextScale(opts?: { minZoom?: number; maxZoom?: number }): MotionValue<number> {
  const editor = useEditor()
  const textScale = useMotionValue(1)
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    let raf = -1
    let lastZoom = NaN

    const update = () => {
      raf = -1
      const zoomRaw = editor.getCamera().z || 1
      if (zoomRaw === lastZoom) return
      lastZoom = zoomRaw
      const minZoom = optsRef.current?.minZoom ?? 0.8
      const maxZoom = optsRef.current?.maxZoom ?? 1.4
      const zoomClamped = clamp(zoomRaw, minZoom, maxZoom)
      textScale.set(1 / zoomClamped)
    }

    // Initial set
    update()

    const cleanup = editor.store.listen(() => {
      if (raf !== -1) return
      raf = requestAnimationFrame(update)
    })

    return () => {
      cleanup()
      if (raf !== -1) cancelAnimationFrame(raf)
    }
  }, [editor, textScale])

  return textScale
}
