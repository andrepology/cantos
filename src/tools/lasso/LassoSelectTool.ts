import {
	atom,
	Box,
	pointInPolygon,
	polygonsIntersect,
	StateNode,
	type TLKeyboardEventInfo,
	type TLPointerEventInfo,
	type TLShape,
	type VecModel,
} from 'tldraw'

// There's a guide at the bottom of this file!

export class LassoSelectTool extends StateNode {
	static override id = 'lasso-select'
	static override children() {
		return [IdleState, LassoingState]
	}
	static override initial = 'idle'

	override onKeyDown(info: TLKeyboardEventInfo) {
		if (info.key === 'Escape') {
			this.editor.setCurrentTool('select')
		}
	}
}

export class IdleState extends StateNode {
	static override id = 'idle'

	override onPointerDown(info: TLPointerEventInfo) {
		const { editor } = this

		editor.selectNone()
		this.parent.transition('lassoing', info)
	}
}

//[1]
export class LassoingState extends StateNode {
	static override id = 'lassoing'

	info = {} as TLPointerEventInfo

	markId = null as null | string

	//[a]
	points = atom<Array<VecModel & { timestamp: number }>>('lasso points', [])
	fadeDuration = 400 // ms for points to fade out
	trailLength = 50 // number of points to keep in trail
	lastPointTime = 0 // track when last point was added

	override onEnter(info: TLPointerEventInfo) {
		this.points.set([])
		this.markId = null
		this.info = info

		this.startLasso()
	}

	private startLasso() {
		this.markId = this.editor.markHistoryStoppingPoint('lasso start')
	}

	//[b]
	override onPointerMove(): void {
		this.addPointToLasso()
	}

	private addPointToLasso() {
		const { inputs } = this.editor

		const { x, y, z } = inputs.currentPagePoint.toFixed()
		const now = Date.now()
		const newPoint = { x, y, z, timestamp: now }

		const currentPoints = this.points.get()
		// Keep only the most recent points for consistent trail
		const recentPoints = currentPoints.slice(-this.trailLength)

		this.points.set([...recentPoints, newPoint])
		this.lastPointTime = now
	}

	//[c]
	private getShapesInLasso() {
		const { editor } = this

		const shapes = editor.getCurrentPageRenderingShapesSorted()
		const lassoPoints = this.getCurrentLassoPoints()
		const shapesInLasso = shapes.filter((shape) => {
			return this.doesLassoTouchShape(lassoPoints, shape)
		})

		return shapesInLasso
	}

	private getCurrentLassoPoints(): VecModel[] {
		return this.points.get().map(point => ({ x: point.x, y: point.y, z: point.z }))
	}


	private doesLassoTouchShape(lassoPoints: VecModel[], shape: TLShape): boolean {
		const { editor } = this

		// Get shape geometry and transformation to shape space
		const geometry = editor.getShapeGeometry(shape)
		const pageTransform = editor.getShapePageTransform(shape)
		if (!geometry || !pageTransform) return false

		// Get shape bounds for early exit optimization
		const shapeBounds = editor.getShapePageBounds(shape)
		if (!shapeBounds) return false

		// Check if lasso bounding box intersects with shape bounds first (optimization)
		const lassoBounds = this.getLassoBounds(lassoPoints)
		const lassoBox = new Box(lassoBounds.x, lassoBounds.y, lassoBounds.w, lassoBounds.h)
		if (!lassoBox.collides(shapeBounds)) return false

		// Check each consecutive pair of lasso points (line segments)
		for (let i = 0; i < lassoPoints.length - 1; i++) {
			const pointA = lassoPoints[i]
			const pointB = lassoPoints[i + 1]

			// Transform line segment from page space to shape space
			const localA = pageTransform.clone().invert().applyToPoint(pointA)
			const localB = pageTransform.clone().invert().applyToPoint(pointB)

			// Check if this line segment intersects with the shape's geometry
			if (geometry.hitTestLineSegment(localA, localB, 0)) {
				return true
			}
		}

		return false
	}

	private getLassoBounds(lassoPoints: VecModel[]) {
		if (lassoPoints.length === 0) return { x: 0, y: 0, w: 0, h: 0 }

		let minX = lassoPoints[0].x
		let minY = lassoPoints[0].y
		let maxX = lassoPoints[0].x
		let maxY = lassoPoints[0].y

		for (let i = 1; i < lassoPoints.length; i++) {
			const point = lassoPoints[i]
			minX = Math.min(minX, point.x)
			minY = Math.min(minY, point.y)
			maxX = Math.max(maxX, point.x)
			maxY = Math.max(maxY, point.y)
		}

		return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
	}

	override onPointerUp(): void {
		this.complete()
	}

	override onComplete() {
		this.complete()
	}

	//[d]
	complete() {
		const { editor } = this

		const shapesInLasso = this.getShapesInLasso()
		editor.setSelectedShapes(shapesInLasso)

		// Reset to idle state within the same tool instead of switching tools
		this.parent.transition('idle')
	}
}

/*
This is where we define the actual lasso select tool and its functionality.

For a general guide on how to built tools with child states, see the `MiniSelectTool` in the only-editor example.

[1]
The main meat of this tool is in the `LassoingState` class. This is the state that is active when the user has the tool selected and holds the mouse down.

    [a]
    The `points` attribute is an instance of the `atom` class. This makes the entire thing work by allowing us to reactively read the lasso points from the `Overlays` layer (which we then use to draw the lasso). As the user moves the mouse, `points` will be updated.

    [b]
    `onPointerMove()`, which is called when the user moves the mouse, calls `addPointToLasso()`, which adds the current mouse position in page space to `points`.

    [c]
    `getShapesInLasso()`, alongside `doesLassoFullyContainShape()` handles the logic of figuring out which shapes on the canvas are fully contained within the lasso.

    [d]
    `onPointerUp()`, which is called when the user releases the mouse, calls the state's `complete()` function. This gets all shapes inside the lasso and selects all of them using the editor's `setSelectedShapes()` function, then resets to the idle state while staying in the lasso tool.

In general, if we wanted to add more functionality to the lasso select, we could:
- live update the selection as the user moves the mouse, similar to how the default select and brush select tools work
- use modifier keys to add or subtract from the selection instead of just setting the selection
- properly handle what happens when we select a shape that's grouped with other shapes (do we select the shape within the group or move up a level and select the entire group? what about layers?)
- extend the default selection tool to allow for lasso selection when a hotkey is pressed, similar to the brush select tool
- add a little bit of leeway to the lasso selection logic to allow for shapes that are mostly, but not fully, enclosed in the lasso to be selected

*/
