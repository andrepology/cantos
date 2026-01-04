import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Editor, TLShapeId } from 'tldraw'
import {
  setFocusedShape,
  useShapeFocusState,
} from '../focusState'
import { isInteractiveTarget } from '../../arena/dom'

export const useShapeFocus = (shapeId: string, editor: Editor) => {
  const focusState = useShapeFocusState()
  const isActive = focusState.activeShapeId === shapeId
  const isPressedRef = useRef(false)
  
  const handlePointerDown = useCallback((e: ReactPointerEvent) => {
    // Left click on another shape while one is focused should switch focus
    if (e.button === 0) {
      if (focusState.activeShapeId && focusState.activeShapeId !== shapeId) {
        setFocusedShape(shapeId)
      }
      return false
    }

    // Only handle right click (button 2)
    if (e.button !== 2) return false

    // Toggle off if already focused
    if (focusState.activeShapeId === shapeId) {
      isPressedRef.current = false
      setFocusedShape(null, null)
      return true
    }

    // Capture camera snapshot and set active in one go
    setFocusedShape(shapeId, editor.getCamera())
    isPressedRef.current = true
    return true
  }, [focusState.activeShapeId, shapeId, editor])

  // Keep selection in sync when focus state changes
  useEffect(() => {
    if (isActive) {
      // Ensure the shape is also selected when it gains focus
      if (!editor.getSelectedShapeIds().includes(shapeId as TLShapeId)) {
        editor.select(shapeId as TLShapeId)
      }
    } else {
      if (focusState.activeShapeId === null && focusState.cameraSnapshot) {
        setFocusedShape(null, null)
      }
    }
  }, [isActive, focusState.activeShapeId, focusState.cameraSnapshot, editor, shapeId])

  useEffect(() => {
    if (!isActive) return

    const handlePointerUp = (event: PointerEvent) => {
      if (event.button === 2 || event.buttons === 0) {
        isPressedRef.current = false
      }
    }
    const handleBlur = () => {
      isPressedRef.current = false
    }

    window.addEventListener('pointerup', handlePointerUp, { capture: true })
    window.addEventListener('pointercancel', handlePointerUp, { capture: true })
    window.addEventListener('blur', handleBlur)
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 2) return

      // Don't defocus if we click an interactive element (like the metadata panel or buttons)
      if (isInteractiveTarget(event.target)) return

      // Use getShapeAtPoint instead of getHoveredShapeId to avoid stale hover state after panning
      const screenPoint = { x: event.clientX, y: event.clientY }
      const pagePoint = editor.screenToPage(screenPoint)
      const hitShape = editor.getShapeAtPoint(pagePoint)

      if (!hitShape) {
        isPressedRef.current = false
        setFocusedShape(null, null)
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

  return {
    focusState,
    handlePointerDown,
  }
}
