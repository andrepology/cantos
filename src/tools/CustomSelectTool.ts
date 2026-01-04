import { EASINGS, SelectTool, createShapeId } from 'tldraw'
import type { TLClickEventInfo, TLEventInfo, TLShapeId } from 'tldraw'
import { getGridSize } from '../arena/layout'
import {
  METADATA_PANEL_GAP_SCREEN,
  METADATA_PANEL_WIDTH_SCREEN,
} from '../editor/MetadataPanelOverlay'

const HORIZONTAL_PADDING_SCREEN = 56
const VERTICAL_PADDING_SCREEN = 56

/**
 * Custom select tool that overrides the default double-click behavior on canvas.
 * Instead of creating text shapes, creates a TactilePortal shape in address mode.
 */
export class CustomSelectTool extends SelectTool {
  static override id = 'select'
  static override initial = 'idle'
  static override isLockable = false

  // Override handleEvent to completely intercept double-click events
  override handleEvent(info: TLEventInfo) {
    // Intercept double-click events completely
    if ('type' in info && info.type === 'click' && 'name' in info && info.name === 'double_click') {
      this.handleDoubleClick(info as TLClickEventInfo)
      return // Don't call super.handleEvent to prevent child states from handling it
    }

    // For all other events, use default behavior
    super.handleEvent(info as any)
  }

  private handleDoubleClick(info: TLClickEventInfo) {
    // Only handle the final phase of the double-click to avoid multiple creations
    if (info.phase !== 'up') return

    const shapeFromInfo = info.target === 'shape' ? info.shape : null
    const fallbackHitShape = !shapeFromInfo
      ? this.editor.getShapeAtPoint(this.editor.inputs.currentPagePoint, {
          margin: this.editor.options.hitTestMargin / this.editor.getZoomLevel(),
          hitInside: true,
          hitLabels: true,
          hitLocked: true,
          hitFrameInside: true,
          renderingOnly: true,
        })
      : null
    const hitShape = shapeFromInfo ?? fallbackHitShape

    if (hitShape && hitShape.type !== 'slide') {
      this.focusCameraOnShape(hitShape.id)
      return
    }

    // Check if the click is on the canvas (not on a shape)
    if (info.target === 'canvas') {
      // Convert screen coordinates to page coordinates first
      const pagePoint = this.editor.screenToPage(info.point)

      // Additional check: Verify no non-slide shapes exist at this point
      // SlideShapes are considered "transparent" for creation purposes
      const shapesAtPoint = this.editor.getShapesAtPoint(pagePoint)
      const nonSlideShapes = shapesAtPoint.filter(shape => shape.type !== 'slide')
      if (nonSlideShapes.length > 0) {
        // There's a non-slide shape here, don't create another one
        return
      }

      // Create a TactilePortalShape in search mode instead of text
      const shapeId = createShapeId()

      // Position the shape centered on the click point with default dimensions
      // Use grid-aligned dimensions for a long rectangular shape
      const gridSize = getGridSize() // Standard grid size from constants
      const w = 120 // Standard tactile portal width
      const h = 64 // Standard tactile portal height
      const x = pagePoint.x - w / 2
      const y = pagePoint.y - h / 2

      this.editor.createShape({
        id: shapeId,
        type: 'tactile-portal',
        x,
        y,
        props: {
          w,
          h,
          source: { kind: 'channel', slug: '' }, // Empty slug = search/address mode
        }
      })

      // Select the new shape for immediate interaction
      this.editor.setSelectedShapes([shapeId])

      return // Don't create text shape
    }

  }

  private focusCameraOnShape(shapeId: TLShapeId) {
    const shape = this.editor.getShape(shapeId)
    if (!shape) return

    const bounds = this.editor.getShapePageBounds(shape)
    if (!bounds) return

    const viewport = this.editor.getViewportScreenBounds()
    const totalHorizontalPadding =
      (HORIZONTAL_PADDING_SCREEN * 2) +
      METADATA_PANEL_WIDTH_SCREEN +
      METADATA_PANEL_GAP_SCREEN
    const totalVerticalPadding = VERTICAL_PADDING_SCREEN * 2

    const availableWidth = viewport.width - totalHorizontalPadding
    const availableHeight = viewport.height - totalVerticalPadding

    const zoomX = availableWidth / bounds.width
    const zoomY = availableHeight / bounds.height
    const targetZoom = Math.min(zoomX, zoomY, 3.5)

    const targetScreenCenterX =
      (viewport.width - (METADATA_PANEL_WIDTH_SCREEN + METADATA_PANEL_GAP_SCREEN)) / 2
    const targetScreenCenterY = viewport.height / 2

    const pageCenterX = bounds.midX
    const pageCenterY = bounds.midY

    const cameraX = (targetScreenCenterX / targetZoom) - pageCenterX
    const cameraY = (targetScreenCenterY / targetZoom) - pageCenterY

    const currentCamera = this.editor.getCamera()
    const duration = this.getAdaptiveDuration(
      currentCamera,
      { x: cameraX, y: cameraY, z: targetZoom },
      viewport
    )

    this.editor.setCamera({ x: cameraX, y: cameraY, z: targetZoom }, {
      animation: {
        duration,
        easing: EASINGS.easeOutQuint,
      },
    })
  }

  private getAdaptiveDuration(
    current: { x: number; y: number; z: number },
    target: { x: number; y: number; z: number },
    viewport: { width: number; height: number }
  ) {
    const zoomDiff = Math.abs(Math.log2(target.z / current.z))

    const currentCenter = {
      x: current.x + viewport.width / 2 / current.z,
      y: current.y + viewport.height / 2 / current.z,
    }
    const targetCenter = {
      x: target.x + viewport.width / 2 / target.z,
      y: target.y + viewport.height / 2 / target.z,
    }

    const avgZoom = (current.z + target.z) / 2
    const dx = (targetCenter.x - currentCenter.x) * avgZoom
    const dy = (targetCenter.y - currentCenter.y) * avgZoom
    const pixelDist = Math.sqrt(dx * dx + dy * dy)

    const screenDist = pixelDist / Math.max(viewport.height, 1)

    const zoomDuration = zoomDiff * 250
    const panDuration = Math.min(screenDist * 400, 600)

    console.log('duration', Math.min(Math.max(250, zoomDuration + panDuration), 800))

    return Math.min(Math.max(250, zoomDuration + panDuration), 800)
  }
}
