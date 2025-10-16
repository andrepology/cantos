import { StateNode, createShapeId } from 'tldraw'
import type { TLKeyboardEventInfo, TLShapeId } from 'tldraw'
import { getGridSize, snapToGrid } from '../arena/layout'

export class PortalTool extends StateNode {
  static override id = 'portal'
  static override initial = 'idle'
  static override children() {
    return [Idle, Pointing, Dragging]
  }

  createdShapeId: TLShapeId | null = null
  originX = 0
  originY = 0

  override onEnter() {
    this.editor.setCursor({ type: 'cross', rotation: 0 })
  }

  override onExit() {
    this.editor.setCursor({ type: 'default', rotation: 0 })
    this.createdShapeId = null
  }

  override onKeyDown(info: TLKeyboardEventInfo) {
    if (info.key === 'Escape') {
      this.editor.setCurrentTool('select')
    }
  }

  override onCancel() {
    this.editor.setCurrentTool('select')
  }
}

class Idle extends StateNode {
  static override id = 'idle'

  override onPointerDown() {
    const tool = this.parent as PortalTool
    const origin = this.editor.inputs.originPagePoint
    const gridSize = getGridSize()
    tool.originX = snapToGrid(origin.x, gridSize)
    tool.originY = snapToGrid(origin.y, gridSize)
    const id = createShapeId()
    tool.createdShapeId = id
    this.editor.createShape({
      id,
      type: 'portal',
      x: tool.originX,
      y: tool.originY,
      props: { w: 1, h: 1 },
    })
    this.parent.transition('pointing', {})
  }
}

class Pointing extends StateNode {
  static override id = 'pointing'

  override onPointerMove() {
    const tool = this.parent as PortalTool
    const id = tool.createdShapeId
    if (!id) return
    const current = this.editor.inputs.currentPagePoint
    const gridSize = getGridSize()
    const minX = Math.min(tool.originX, snapToGrid(current.x, gridSize))
    const minY = Math.min(tool.originY, snapToGrid(current.y, gridSize))
    const w = snapToGrid(Math.max(1, Math.abs(current.x - tool.originX)), gridSize)
    const h = snapToGrid(Math.max(1, Math.abs(current.y - tool.originY)), gridSize)
    this.editor.updateShape({ id, type: 'portal', x: minX, y: minY, props: { w, h } })
    this.parent.transition('dragging', {})
  }

  override onPointerUp() {
    // Click without drag: give a default size
    const tool = this.parent as PortalTool
    const id = tool.createdShapeId
    if (!id) return this.parent.transition('idle', {})
    const gridSize = getGridSize()
    this.editor.updateShape({ id, type: 'portal', props: { w: snapToGrid(200, gridSize), h: snapToGrid(140, gridSize) } })
    // Ensure the newly created shape is selected so in-shape autofocus can trigger
    this.editor.setSelectedShapes([id])
    // Switch back to select tool after creation
    this.editor.setCurrentTool('select')
    this.parent.transition('idle', {})
  }
}

class Dragging extends StateNode {
  static override id = 'dragging'

  override onPointerMove() {
    const tool = this.parent as PortalTool
    const id = tool.createdShapeId
    if (!id) return
    const current = this.editor.inputs.currentPagePoint
    const gridSize = getGridSize()
    const minX = Math.min(tool.originX, snapToGrid(current.x, gridSize))
    const minY = Math.min(tool.originY, snapToGrid(current.y, gridSize))
    const w = snapToGrid(Math.max(1, Math.abs(current.x - tool.originX)), gridSize)
    const h = snapToGrid(Math.max(1, Math.abs(current.y - tool.originY)), gridSize)
    this.editor.updateShape({ id, type: 'portal', x: minX, y: minY, props: { w, h } })
  }

  override onPointerUp() {
    const tool = this.parent as PortalTool
    const id = tool.createdShapeId
    tool.createdShapeId = null
    if (!id) return this.parent.transition('idle', {})
    const shape = this.editor.getShape(id)
    if (shape && (shape as any).props.w < 4 && (shape as any).props.h < 4) {
      this.editor.deleteShape(id)
    }
    else {
      // Select finalized shape after drag so in-shape autofocus can trigger
      this.editor.setSelectedShapes([id])
      // Switch back to select tool after creation
      this.editor.setCurrentTool('select')
    }
    this.parent.transition('idle', {})
  }
}


