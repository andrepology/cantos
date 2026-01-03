import { SelectTool, createShapeId } from 'tldraw'
import type { TLClickEventInfo, TLEventInfo } from 'tldraw'
import { getGridSize } from '../arena/layout'

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

    // For double-clicks on shapes, do nothing
    // But since we intercepted the event, we need to delegate to the current state
    const currentState = this.getCurrent()
    if (currentState && currentState !== this && currentState.onDoubleClick) {
      // Do nothing
    }
  }
}
