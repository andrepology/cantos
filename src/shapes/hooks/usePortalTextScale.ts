import { useEffect } from 'react'
import { useMotionValue, type MotionValue } from 'motion/react'
import { useEditor, useValue } from 'tldraw'

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

/**
 * One zoom subscription per portal; drives a stable MotionValue so children can
 * stay memoized while still being zoom-aware.
 */
export function usePortalTextScale(opts?: { minZoom?: number; maxZoom?: number }): MotionValue<number> {
  const editor = useEditor()
  const zoomRaw = useValue('cameraZoom', () => editor.getCamera().z, [editor]) || 1
  const zoomClamped = clamp(zoomRaw, opts?.minZoom ?? 0.8, opts?.maxZoom ?? 1.4)

  const textScale = useMotionValue(1 / zoomClamped)
  useEffect(() => {
    textScale.set(1 / zoomClamped)
  }, [textScale, zoomClamped])

  return textScale
}

