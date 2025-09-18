import { StateNode } from 'tldraw'
import type { TLKeyboardEventInfo } from 'tldraw'

const OFFSET = 12

export class VoiceMemoTool extends StateNode {
  static override id = 'voice-memo'

  override onEnter() {
    this.editor.setCursor({ type: 'cross', rotation: 0 })
  }

  override onExit() {
    this.editor.setCursor({ type: 'default', rotation: 0 })
  }

  override onKeyDown(info: TLKeyboardEventInfo) {
    if (info.key === 'Escape') {
      this.editor.setCurrentTool('select')
    }
  }

  override onCancel() {
    this.editor.setCurrentTool('select')
  }

  override onPointerDown() {
    const { currentPagePoint } = this.editor.inputs
    this.editor.createShape({
      type: 'voice-memo',
      x: currentPagePoint.x - OFFSET,
      y: currentPagePoint.y - OFFSET,
      props: { status: 'uploading', audioId: null, w: 320, h: 96 },
    })
    // Minimal MVP: shape is created in uploading state. Upload/record wiring will attach next.
  }
}


