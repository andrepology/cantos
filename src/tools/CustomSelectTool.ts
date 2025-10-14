import { SelectTool, createShapeId } from 'tldraw'
import type { TLClickEventInfo, TLEventInfo } from 'tldraw'
import { getGridSize } from '../arena/layout'

/**
 * Custom select tool that overrides the default double-click behavior on canvas.
 * Instead of creating text shapes, creates a ThreeDBoxShape in search mode.
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
      // Create a ThreeDBoxShape in search mode instead of text
      const shapeId = createShapeId()

      // Convert screen coordinates to page coordinates
      // info.point is in screen space, but shapes need page coordinates
      const pagePoint = this.editor.screenToPage(info.point)

      // Position the shape centered on the click point with default dimensions
      // Use grid-aligned dimensions for a long rectangular shape
      const gridSize = getGridSize() // Standard grid size from constants
      const w = gridSize * 16 // 200px width (25 * 8)
      const h = gridSize * 5 // 144px height (18 * 8) - making it longer
      const x = pagePoint.x - w / 2
      const y = pagePoint.y - h / 2

      this.editor.createShape({
        id: shapeId,
        type: '3d-box',
        x,
        y,
        props: {
          w,
          h,
          channel: '', // Empty string = search mode
          userId: undefined,
          userName: undefined,
          userAvatar: undefined,
        }
      })

      // Select the new shape for immediate interaction
      this.editor.setSelectedShapes([shapeId])

      return // Don't create text shape
    }

    // For double-clicks on shapes, we still want to allow default behavior
    // But since we intercepted the event, we need to delegate to the current state
    const currentState = this.getCurrent()
    if (currentState && currentState !== this && currentState.onDoubleClick) {
      currentState.onDoubleClick(info)
    }
  }
}
