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
	createShapeId,
} from 'tldraw'
import { getGridSize, snapToGrid, TILING_CONSTANTS } from '../../arena/layout'
import { isCandidateFree } from '../../arena/tiling'

// There's a guide at the bottom of this file!

export class PortalBrushTool extends StateNode {
	static override id = 'portal-brush'
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
		// Keep all points for persistent trail
		this.points.set([...currentPoints, newPoint])
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

	private getLassoBoundsWithStroke(lassoPoints: VecModel[]) {
		const baseBounds = this.getLassoBounds(lassoPoints)

		// Account for stroke thickness: 40px at zoom level 1
		const zoom = this.editor.getZoomLevel() || 1
		const strokeWidthPx = 40 / zoom // stroke width in screen pixels

		// Convert screen pixels to page coordinates
		const strokeWidthPage = strokeWidthPx / zoom

		// Expand bounds by half the stroke width in each direction
		const halfStroke = strokeWidthPage / 2

		return {
			x: baseBounds.x - halfStroke,
			y: baseBounds.y - halfStroke,
			w: baseBounds.w + strokeWidthPage,
			h: baseBounds.h + strokeWidthPage,
		}
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

		// Calculate bounding rectangle from lasso points, accounting for stroke thickness
		const lassoBounds = this.getLassoBoundsWithStroke(this.points.get())
		const gridSize = getGridSize()

		// Enforce minimum dimensions and snap to grid
		const w = Math.max(TILING_CONSTANTS.minWidth, snapToGrid(lassoBounds.w, gridSize))
		const h = Math.max(TILING_CONSTANTS.minHeight, snapToGrid(lassoBounds.h, gridSize))

		// Find collision-free position
		const candidate = this.findCollisionFreePosition(lassoBounds.x, lassoBounds.y, w, h)

		// Create the shape
		const shapeId = createShapeId()
		editor.createShapes([{
			id: shapeId,
			type: 'tactile-portal',
			x: candidate.x,
			y: candidate.y,
			props: {
				w: candidate.w,
				h: candidate.h,
				source: { kind: 'channel', slug: '' },
			}
		}])

		editor.setSelectedShapes([shapeId])

		// Switch to select tool after creating shape
		this.editor.setCurrentTool('select')
	}

	private findCollisionFreePosition(x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
		const { editor } = this
		const gridSize = getGridSize()
		const gap = TILING_CONSTANTS.gap

		// Start with the desired position
		const seed = { x, y, w, h, source: 'obstacle-adaptive' as const }

		// If already free, return it
		if (isCandidateFree({ editor, candidate: seed, epsilon: gap })) {
			return seed
		}

		// Search in expanding rings around the original position
		const maxRings = 20
		for (let ring = 1; ring <= maxRings; ring++) {
			const step = ring * gridSize

			// Try all 8 directions at this distance
			const offsets = [
				{ x: step, y: 0 }, { x: -step, y: 0 }, { x: 0, y: step }, { x: 0, y: -step },
				{ x: step, y: step }, { x: step, y: -step }, { x: -step, y: step }, { x: -step, y: -step }
			]

			for (const offset of offsets) {
				const candidate = {
					x: snapToGrid(seed.x + offset.x, gridSize),
					y: snapToGrid(seed.y + offset.y, gridSize),
					w: seed.w,
					h: seed.h,
					source: 'obstacle-adaptive' as const
				}

				if (isCandidateFree({ editor, candidate, epsilon: gap })) {
					return candidate
				}
			}
		}

		// If no collision-free position found, return original (will overlap)
		// No collision-free position found, using original position - no logging
		return seed
	}
}

/*
This is where we define the actual lasso select tool and its functionality.

For a general guide on how to built tools with child states, see the `MiniSelectTool` in the only-editor example.

[1]
The main meat of this tool is in the `LassoingState` class. This is the state that is active when the user has the tool selected and holds the mouse down.

    [a]
    The `points` attribute is an instance of the `atom` class. This makes the entire thing work by allowing us to reactively read the lasso points from the `Overlays` layer (which we then use to draw the lasso). As the user moves the mouse, `points` will be updated and all points are kept for a persistent trail.

    [b]
    `onPointerMove()`, which is called when the user moves the mouse, calls `addPointToLasso()`, which adds the current mouse position in page space to `points`.

    [c]
    `getShapesInLasso()`, alongside `doesLassoTouchShape()` handles the logic of figuring out which shapes on the canvas intersect with the lasso path.

    [d]
    `onPointerUp()`, which is called when the user releases the mouse, calls the state's `complete()` function. This calculates the bounding rectangle of the lasso, finds a collision-free position using tiling logic, and creates a new TactilePortalShape at that position, then switches to the select tool.

In general, if we wanted to add more functionality to the lasso create tool, we could:
- add modifier keys to switch between create mode (current) and select mode
- allow live preview of the bounding box during lasso drawing
- add different shape types that can be created via lasso (not just portal)
- support creating multiple shapes from complex lasso paths (splitting on gaps)
- add visual feedback for collision detection during position search
- add undo support for the created shapes

*/
