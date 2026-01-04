import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { EASINGS, type Editor, type TLShapeId } from 'tldraw'
import {
  setFocusedShape,
  useShapeFocusState,
} from '../focusState'
import { isInteractiveTarget } from '../../arena/dom'

// Fixed constants from MetadataPanel for camera framing
const PANEL_WIDTH_SCREEN = 256
const GAP_SCREEN = 16
const HORIZONTAL_PADDING_SCREEN = 56
const VERTICAL_PADDING_SCREEN = 56

const getAdaptiveDuration = (
  current: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
  viewport: { width: number; height: number }
) => {
  // Logarithmic zoom difference (perceptual scale)
  const zoomDiff = Math.abs(Math.log2(target.z / current.z))
  
  // Screen-relative pan distance
  // We project the center points to see how far they are visually
  const currentCenter = { 
    x: current.x + viewport.width / 2 / current.z,
    y: current.y + viewport.height / 2 / current.z
  }
  const targetCenter = { 
    x: target.x + viewport.width / 2 / target.z,
    y: target.y + viewport.height / 2 / target.z
  }
  
  // Average zoom for the arc distance approximation
  const avgZoom = (current.z + target.z) / 2
  const dx = (targetCenter.x - currentCenter.x) * avgZoom
  const dy = (targetCenter.y - currentCenter.y) * avgZoom
  const pixelDist = Math.sqrt(dx * dx + dy * dy)
  
  // Normalize by viewport height (e.g. moving 1 screen height = 1.0)
  const screenDist = pixelDist / Math.max(viewport.height, 1)

  // Weighted sum: 250ms per zoom-doubling, 400ms per screen-height pan
  // Cap pan influence at 600ms to prevent excessive slowness on long pans
  const zoomDuration = zoomDiff * 250
  const panDuration = Math.min(screenDist * 400, 600)
  
  // Clamp total duration: Min 350ms (snappy), Max 900ms (never too slow)
  return Math.min(Math.max(350, zoomDuration + panDuration), 900)
}

export const useShapeFocus = (shapeId: string, editor: Editor) => {
  const focusState = useShapeFocusState()
  const isActive = focusState.activeShapeId === shapeId
  const isPressedRef = useRef(false)
  
  // Ref to track which shape we've already framed to prevent redundant camera animations
  const framedShapeIdRef = useRef<string | null>(null)

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

  // Camera Focus Logic: Framing Shape + Metadata Panel
  useEffect(() => {
    if (isActive) {
      // Ensure the shape is also selected when it gains focus
      if (!editor.getSelectedShapeIds().includes(shapeId as TLShapeId)) {
        editor.select(shapeId as TLShapeId)
      }

      // Only run when the active focused shape changes relative to what we last framed
      if (framedShapeIdRef.current === shapeId) return
      framedShapeIdRef.current = shapeId

      const shape = editor.getShape(shapeId as TLShapeId)
      if (!shape) return

      const bounds = editor.getShapePageBounds(shape)
      if (!bounds) return

      /**
       * STABLE CAMERA CALCULATION
       * We want to fit the shape AND the metadata panel (fixed screen size) in the viewport.
       * 
       * Screen available width = Viewport Width - (Padding * 2) - Metadata Panel - Gap
       * Target Zoom = Screen available width / Shape Page Width
       */
      const viewport = editor.getViewportScreenBounds()
      
      const totalHorizontalPadding = (HORIZONTAL_PADDING_SCREEN * 2) + PANEL_WIDTH_SCREEN + GAP_SCREEN
      const totalVerticalPadding = VERTICAL_PADDING_SCREEN * 2
      
      const availableWidth = viewport.width - totalHorizontalPadding
      const availableHeight = viewport.height - totalVerticalPadding
      
      const zoomX = availableWidth / bounds.width
      const zoomY = availableHeight / bounds.height
      const targetZoom = Math.min(zoomX, zoomY, 3.5) // Cap zoom at 4x

      // Center the shape in the remaining space (excluding the metadata panel area on the right)
      // The shape's screen center should be: (ViewportWidth - (Panel + Gap)) / 2
      const targetScreenCenterX = (viewport.width - (PANEL_WIDTH_SCREEN + GAP_SCREEN)) / 2
      const targetScreenCenterY = viewport.height / 2
      
      // Convert shape page center to screen space at target zoom to find camera offset
      const pageCenterX = bounds.midX
      const pageCenterY = bounds.midY
      
      // Camera X/Y is the page coordinate that appears at (0,0) on screen.
      // ScreenCoord = (PageCoord + CameraOffset) * Zoom
      // PageCoord = (ScreenCoord / Zoom) - CameraOffset
      // CameraOffset = (ScreenCoord / Zoom) - PageCoord
      
      const cameraX = (targetScreenCenterX / targetZoom) - pageCenterX
      const cameraY = (targetScreenCenterY / targetZoom) - pageCenterY

      const currentCamera = editor.getCamera()
      const duration = getAdaptiveDuration(
        currentCamera,
        { x: cameraX, y: cameraY, z: targetZoom },
        viewport
      )

      // Temporarily disabled camera focusing
      return

      editor.setCamera({ x: cameraX, y: cameraY, z: targetZoom }, {
        animation: { 
          duration, 
          easing: EASINGS.easeOutQuint 
        },
      })
    } else {
      // If focus was cleared entirely (activeShapeId === null)
      // AND we were the one who was framed, restore the camera.
      if (focusState.activeShapeId === null && framedShapeIdRef.current !== null && focusState.cameraSnapshot) {
        // Temporarily disabled camera restoring
        /*
        editor.setCamera(focusState.cameraSnapshot, {
          animation: { duration: 400 },
        })
        */
        // Clear snapshot globally
        setFocusedShape(null, null)
      }
      
      // Always reset local framed ref when we lose focus (either cleared or moved to another shape)
      // This ensures that if we are focused AGAIN later, the animation re-triggers.
      framedShapeIdRef.current = null
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
