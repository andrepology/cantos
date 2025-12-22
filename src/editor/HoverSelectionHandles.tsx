import { useCallback, useMemo, useRef } from 'react'
import { useEditor, useSelectionEvents, useTransform, useValue } from 'tldraw'
import type { TLSelectionHandle } from 'tldraw'

function useHoverHandlePointerDown(handle: TLSelectionHandle, hoveredId: string | null) {
  const editor = useEditor()
  const events = useSelectionEvents(handle)

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (hoveredId && !editor.getSelectedShapeIds().includes(hoveredId)) {
        editor.setSelectedShapes([hoveredId])
      }
      events.onPointerDown(e)
    },
    [editor, events, hoveredId]
  )

  return {
    onPointerDown,
    onPointerMove: events.onPointerMove,
    onPointerUp: events.onPointerUp,
  }
}

export function HoverSelectionHandles() {
  const editor = useEditor()
  const svgRef = useRef<SVGGElement>(null)

  const hoveredId = useValue('hovered-shape', () => editor.getHoveredShapeId(), [editor])
  const selectedIds = useValue('selected-shapes', () => editor.getSelectedShapeIds(), [editor])

  const hoveredShape = hoveredId ? editor.getShape(hoveredId) : null

  const bounds = useValue(
    'hovered-shape-bounds',
    () => {
      if (!hoveredId) return null
      const shape = editor.getShape(hoveredId)
      if (!shape) return null
      return editor.getShapePageBounds(shape)
    },
    [editor, hoveredId]
  )

  const shouldShow = useMemo(() => {
    if (!hoveredShape || !bounds) return false
    if (editor.getIsReadonly()) return false
    if (editor.isShapeHidden(hoveredShape)) return false
    if (editor.isShapeOrAncestorLocked(hoveredShape)) return false
    if (hoveredShape.type === 'slide') return false
    if (selectedIds.length > 1) return false
    if (selectedIds.length === 1 && selectedIds[0] === hoveredShape.id) return false
    const util = editor.getShapeUtil(hoveredShape)
    if (!util.canResize(hoveredShape)) return false
    if (util.hideResizeHandles(hoveredShape)) return false
    return true
  }, [bounds, editor, hoveredShape, selectedIds])

  const zoom = editor.getZoomLevel()
  const targetSize = Math.max(22 / zoom, 16 / zoom)
  const edgePadding = Math.max(12 / zoom, 8 / zoom)
  const halfTarget = targetSize / 2

  const topLeftEvents = useHoverHandlePointerDown('top_left', hoveredId)
  const topRightEvents = useHoverHandlePointerDown('top_right', hoveredId)
  const bottomRightEvents = useHoverHandlePointerDown('bottom_right', hoveredId)
  const bottomLeftEvents = useHoverHandlePointerDown('bottom_left', hoveredId)
  const topEvents = useHoverHandlePointerDown('top', hoveredId)
  const rightEvents = useHoverHandlePointerDown('right', hoveredId)
  const bottomEvents = useHoverHandlePointerDown('bottom', hoveredId)
  const leftEvents = useHoverHandlePointerDown('left', hoveredId)

  const rotation = hoveredShape?.rotation ?? 0
  useTransform(svgRef, bounds?.x, bounds?.y, 1, rotation)

  if (!shouldShow || !bounds) return null

  const width = bounds.w
  const height = bounds.h

  return (
    <svg
      className="tl-overlays__item tl-hover-selection__fg"
      aria-hidden="true"
      style={{ position: 'absolute', pointerEvents: 'auto' }}
    >
      <g
        ref={svgRef}
        style={{ transformOrigin: `${width / 2}px ${height / 2}px` }}
      >
        {/* Corner targets (invisible, used for cursor + resize hit testing) */}
        <rect
          data-testid="selection.target.top-left"
          x={-halfTarget}
          y={-halfTarget}
          width={targetSize}
          height={targetSize}
          fill="transparent"
          stroke="none"
          opacity={0}
          style={{ pointerEvents: 'all' }}
          {...topLeftEvents}
        />
        <rect
          data-testid="selection.target.top-right"
          x={width - halfTarget}
          y={-halfTarget}
          width={targetSize}
          height={targetSize}
          fill="transparent"
          stroke="none"
          opacity={0}
          style={{ pointerEvents: 'all' }}
          {...topRightEvents}
        />
        <rect
          data-testid="selection.target.bottom-right"
          x={width - halfTarget}
          y={height - halfTarget}
          width={targetSize}
          height={targetSize}
          fill="transparent"
          stroke="none"
          opacity={0}
          style={{ pointerEvents: 'all' }}
          {...bottomRightEvents}
        />
        <rect
          data-testid="selection.target.bottom-left"
          x={-halfTarget}
          y={height - halfTarget}
          width={targetSize}
          height={targetSize}
          fill="transparent"
          stroke="none"
          opacity={0}
          style={{ pointerEvents: 'all' }}
          {...bottomLeftEvents}
        />

        {/* Edge targets (invisible, used for cursor + resize hit testing) */}
        <rect
          data-testid="selection.target.top"
          x={edgePadding}
          y={-halfTarget}
          width={Math.max(0, width - edgePadding * 2)}
          height={targetSize}
          fill="transparent"
          stroke="none"
          opacity={0}
          style={{ pointerEvents: 'all' }}
          {...topEvents}
        />
        <rect
          data-testid="selection.target.right"
          x={width - halfTarget}
          y={edgePadding}
          width={targetSize}
          height={Math.max(0, height - edgePadding * 2)}
          fill="transparent"
          stroke="none"
          opacity={0}
          style={{ pointerEvents: 'all' }}
          {...rightEvents}
        />
        <rect
          data-testid="selection.target.bottom"
          x={edgePadding}
          y={height - halfTarget}
          width={Math.max(0, width - edgePadding * 2)}
          height={targetSize}
          fill="transparent"
          stroke="none"
          opacity={0}
          style={{ pointerEvents: 'all' }}
          {...bottomEvents}
        />
        <rect
          data-testid="selection.target.left"
          x={-halfTarget}
          y={edgePadding}
          width={targetSize}
          height={Math.max(0, height - edgePadding * 2)}
          fill="transparent"
          stroke="none"
          opacity={0}
          style={{ pointerEvents: 'all' }}
          {...leftEvents}
        />
      </g>
    </svg>
  )
}
