import { StateNode, type TLPointerEventInfo } from 'tldraw'

export class Idle extends StateNode {
	static override id = 'idle'

	override onCancel() {
		this.editor.setCurrentTool('select')
	}

	override onPointerDown(info: TLPointerEventInfo) {
		this.parent.transition('lasering', info)
	}
}


