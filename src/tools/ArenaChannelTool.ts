import { StateNode, createShapeId } from 'tldraw'
import type { TLKeyboardEventInfo, TLShapeId } from 'tldraw'

export class ArenaChannelTool extends StateNode {
  static override id = 'arena-channel'
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
    const tool = this.parent as ArenaChannelTool
    const origin = this.editor.inputs.originPagePoint
    tool.originX = origin.x
    tool.originY = origin.y
    const id = createShapeId()
    tool.createdShapeId = id
    this.editor.createShape({
      id,
      type: 'arena-channel',
      x: origin.x,
      y: origin.y,
      props: { w: 1, h: 1 },
    })
    this.parent.transition('pointing', {})
  }
}

class Pointing extends StateNode {
  static override id = 'pointing'

  override onPointerMove() {
    const tool = this.parent as ArenaChannelTool
    const id = tool.createdShapeId
    if (!id) return
    const current = this.editor.inputs.currentPagePoint
    const minX = Math.min(tool.originX, current.x)
    const minY = Math.min(tool.originY, current.y)
    const w = Math.max(1, Math.abs(current.x - tool.originX))
    const h = Math.max(1, Math.abs(current.y - tool.originY))
    this.editor.updateShape({ id, type: 'arena-channel', x: minX, y: minY, props: { w, h } })
    this.parent.transition('dragging', {})
  }

  override onPointerUp() {
    // Click without drag: give a default size
    const tool = this.parent as ArenaChannelTool
    const id = tool.createdShapeId
    if (!id) return this.parent.transition('idle', {})
    this.editor.updateShape({ id, type: 'arena-channel', props: { w: 200, h: 140 } })
    this.parent.transition('idle', {})
  }
}

class Dragging extends StateNode {
  static override id = 'dragging'

  override onPointerMove() {
    const tool = this.parent as ArenaChannelTool
    const id = tool.createdShapeId
    if (!id) return
    const current = this.editor.inputs.currentPagePoint
    const minX = Math.min(tool.originX, current.x)
    const minY = Math.min(tool.originY, current.y)
    const w = Math.max(1, Math.abs(current.x - tool.originX))
    const h = Math.max(1, Math.abs(current.y - tool.originY))
    this.editor.updateShape({ id, type: 'arena-channel', x: minX, y: minY, props: { w, h } })
  }

  override onPointerUp() {
    const tool = this.parent as ArenaChannelTool
    const id = tool.createdShapeId
    tool.createdShapeId = null
    if (!id) return this.parent.transition('idle', {})
    const shape = this.editor.getShape(id)
    if (shape && (shape as any).props.w < 4 && (shape as any).props.h < 4) {
      this.editor.deleteShape(id)
    }
    this.parent.transition('idle', {})
  }
}


