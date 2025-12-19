import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Editor } from 'tldraw'
import {
  setRightClickTiltActive,
  setRightClickTiltStrength,
  useRightClickTiltState,
} from '../rightClickTilt'

const BASE_STRENGTH = 0.45
const MAX_STRENGTH = 0.85
const TIME_CONSTANT_MS = 500

export const useRightClickTilt = (shapeId: string, editor: Editor) => {
  const rightClickTilt = useRightClickTiltState()
  const isActive = rightClickTilt.activeShapeId === shapeId
  const isPressedRef = useRef(false)

  const handlePointerDown = useCallback((e: ReactPointerEvent) => {
    if (e.button === 0) {
      if (rightClickTilt.activeShapeId && rightClickTilt.activeShapeId !== shapeId) {
        setRightClickTiltActive(shapeId)
        setRightClickTiltStrength(BASE_STRENGTH)
      }
      return false
    }

    if (e.button !== 2) return false

    if (rightClickTilt.activeShapeId === shapeId) {
      isPressedRef.current = false
      setRightClickTiltStrength(0)
      setRightClickTiltActive(null)
      return true
    }

    setRightClickTiltActive(shapeId)
    setRightClickTiltStrength(BASE_STRENGTH)
    isPressedRef.current = true
    return true
  }, [rightClickTilt.activeShapeId, shapeId])

  useEffect(() => {
    if (!isActive) return

    const handlePointerUp = (event: PointerEvent) => {
      if (event.button === 2 || event.buttons === 0) {
        isPressedRef.current = false
        setRightClickTiltStrength(BASE_STRENGTH)
      }
    }
    const handleBlur = () => {
      isPressedRef.current = false
      setRightClickTiltStrength(BASE_STRENGTH)
    }

    window.addEventListener('pointerup', handlePointerUp, { capture: true })
    window.addEventListener('pointercancel', handlePointerUp, { capture: true })
    window.addEventListener('blur', handleBlur)
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 2) return
      if (editor.getHoveredShapeId() === null) {
        isPressedRef.current = false
        setRightClickTiltStrength(0)
        setRightClickTiltActive(null)
      }
    }
    window.addEventListener('pointerdown', handlePointerDown, { capture: true })
    return () => {
      window.removeEventListener('pointerup', handlePointerUp, { capture: true })
      window.removeEventListener('pointercancel', handlePointerUp, { capture: true })
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true })
    }
  }, [editor, isActive])

  useEffect(() => {
    if (!isActive || !isPressedRef.current) return

    const start = performance.now()
    let rafId = 0

    const tick = (now: number) => {
      if (!isPressedRef.current) return
      const elapsed = now - start
      const eased = 1 - Math.exp(-elapsed / TIME_CONSTANT_MS)
      const nextStrength = Math.min(
        MAX_STRENGTH,
        BASE_STRENGTH + (MAX_STRENGTH - BASE_STRENGTH) * eased
      )
      setRightClickTiltStrength(nextStrength)
      rafId = window.requestAnimationFrame(tick)
    }

    rafId = window.requestAnimationFrame(tick)
    return () => {
      window.cancelAnimationFrame(rafId)
    }
  }, [isActive])

  return {
    rightClickTilt,
    handlePointerDown,
  }
}
