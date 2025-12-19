import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, type TLShapeId } from 'tldraw'
import { useSpawnEngine, type PortalSpawnPayload } from './useSpawnEngine'

type Point = { x: number; y: number }
type Rect = { x: number; y: number; width: number; height: number }

export type PortalSpawnGhostState<TItem> = {
  item: TItem
  pointer: Point
  startPointer: Point
  anchorRect: Rect | null
  pointerOffset: Point
}

interface UsePortalSpawnDragOptions<TItem> {
  thresholdPx?: number
  screenToPagePoint: (clientX: number, clientY: number) => Point
  getSpawnPayload: (item: TItem) => PortalSpawnPayload | null
  defaultDimensions?: { w: number; h: number }
  getDimensions?: (item: TItem) => { w: number; h: number } | null
  selectSpawnedShape?: boolean
  onClick?: (payload: PortalSpawnPayload, item: TItem) => void
  onSpawned?: (item: TItem) => void
  onSessionEnd?: () => void
}

const DEFAULT_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 }

export function usePortalSpawnDrag<TItem>(options: UsePortalSpawnDragOptions<TItem>) {
  const {
    thresholdPx = 12,
    screenToPagePoint,
    getSpawnPayload,
    defaultDimensions,
    getDimensions,
    selectSpawnedShape = true,
    onClick,
    onSpawned,
    onSessionEnd,
  } = options

  const editor = useEditor()
  const { spawnTactilePortalShape } = useSpawnEngine()
  const [ghostState, setGhostState] = useState<PortalSpawnGhostState<TItem> | null>(null)

  const sessionRef = useRef<{
    active: boolean
    pointerId: number | null
    startScreen: Point | null
    pointerOffset: Point | null
    pointerOffsetPage: Point | null
    item: TItem | null
    payload: PortalSpawnPayload | null
    spawnedId: string | null
    portalSize: { w: number; h: number } | null
    zoomAtStart: number
    anchorRect: Rect | null
    wasDrag: boolean
    hasPassedThreshold: boolean
  }>({
    active: false,
    pointerId: null,
    startScreen: null,
    pointerOffset: null,
    pointerOffsetPage: null,
    item: null,
    payload: null,
    spawnedId: null,
    portalSize: null,
    zoomAtStart: 1,
    anchorRect: null,
    wasDrag: false,
    hasPassedThreshold: false,
  })

  const resetSession = useCallback(() => {
    sessionRef.current = {
      active: false,
      pointerId: null,
      startScreen: null,
      pointerOffset: null,
      pointerOffsetPage: null,
      item: null,
      payload: null,
      spawnedId: null,
      portalSize: null,
      zoomAtStart: 1,
      anchorRect: null,
    wasDrag: false,
    hasPassedThreshold: false,
    }
  }, [])

  const deleteSpawnedShape = useCallback(() => {
    const id = sessionRef.current.spawnedId
    if (!id) return
    try {
      editor.deleteShapes([id as TLShapeId])
    } catch {}
    sessionRef.current.spawnedId = null
    sessionRef.current.portalSize = null
  }, [editor])

  const finalizeSpawnedShape = useCallback(() => {
    const id = sessionRef.current.spawnedId
    if (!id) return
    try {
      const shape = editor.getShape(id as TLShapeId)
      const spawnedType = shape?.type ?? 'tactile-portal'
      editor.updateShape({
        id: id as TLShapeId,
        type: spawnedType,
        props: { spawnDragging: false } as any,
      })
      requestAnimationFrame(() => {
        try {
          const refreshed = editor.getShape(id as TLShapeId)
          if (refreshed) {
            editor.updateShape({ id: id as TLShapeId, type: spawnedType, x: refreshed.x, y: refreshed.y })
          }
        } catch {}
      })
    } catch {}
    sessionRef.current.spawnedId = null
    sessionRef.current.portalSize = null
  }, [editor])

  const updateGhostPointer = useCallback((pointer: Point) => {
    setGhostState(prev => {
      if (!prev) return prev
      return {
        ...prev,
        pointer,
      }
    })
  }, [])

  const handlePointerDown = useCallback((item: TItem, e: React.PointerEvent) => {
    const payload = getSpawnPayload(item)
    if (!payload) return
    const rect = (e.currentTarget as HTMLElement)?.getBoundingClientRect?.()
    const anchorRect = rect
      ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
      : DEFAULT_RECT
    const pointerOffset = {
      x: e.clientX - anchorRect.x,
      y: e.clientY - anchorRect.y,
    }
    const zoom = typeof editor.getZoomLevel === 'function' ? editor.getZoomLevel() || 1 : 1
    sessionRef.current = {
      active: true,
      pointerId: e.pointerId,
      startScreen: { x: e.clientX, y: e.clientY },
      pointerOffset,
      pointerOffsetPage: {
        x: pointerOffset.x / zoom,
        y: pointerOffset.y / zoom,
      },
      item,
      payload,
      spawnedId: null,
      portalSize: null,
      zoomAtStart: zoom,
      anchorRect,
      wasDrag: false,
      hasPassedThreshold: false,
    }
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    } catch {}
  }, [editor, getSpawnPayload])

  const handlePointerMove = useCallback((item: TItem, e: React.PointerEvent) => {
    const session = sessionRef.current
    if (!session.active || session.pointerId !== e.pointerId) return
    if (session.item !== item) return
    if (!session.startScreen || !session.payload) return

    if (e.buttons === 0) {
      deleteSpawnedShape()
      setGhostState(null)
      resetSession()
      return
    }

    const pointer = { x: e.clientX, y: e.clientY }
    const dx = pointer.x - session.startScreen.x
    const dy = pointer.y - session.startScreen.y
    const dist = Math.hypot(dx, dy)

    // Wait until threshold is crossed before showing ghost or spawning
    if (!session.hasPassedThreshold) {
      if (dist < thresholdPx) return
      session.hasPassedThreshold = true
      session.wasDrag = true
      setGhostState({
        item: session.item as TItem,
        pointer,
        startPointer: session.startScreen ?? pointer,
        anchorRect: session.anchorRect,
        pointerOffset: session.pointerOffset ?? { x: 0, y: 0 },
      })
      return
    }

    updateGhostPointer(pointer)

    if (!session.spawnedId) {
      const dims = getDimensions?.(item) ?? defaultDimensions
      const pagePoint = screenToPagePoint(e.clientX, e.clientY)
      const result = spawnTactilePortalShape(session.payload, pagePoint, {
        dimensions: dims ?? undefined,
        pointerOffsetPage: session.pointerOffsetPage,
        select: selectSpawnedShape,
      })
      if (!result) return
      session.spawnedId = result.id
      session.portalSize = result
      session.wasDrag = true
      onSpawned?.(item)
      try {
        requestAnimationFrame(() => setGhostState(null))
      } catch {
        setGhostState(null)
      }
      return
    }

    if (dist < thresholdPx) {
      deleteSpawnedShape()
      if (session.item) {
        setGhostState({
          item: session.item,
          pointer,
          startPointer: session.startScreen ?? pointer,
          anchorRect: session.anchorRect,
          pointerOffset: session.pointerOffset ?? { x: 0, y: 0 },
        })
      }
      return
    }

    const pagePoint = screenToPagePoint(e.clientX, e.clientY)
    const { w, h } = session.portalSize ?? { w: defaultDimensions?.w ?? 320, h: defaultDimensions?.h ?? 320 }
    editor.updateShapes([
      {
        id: session.spawnedId as TLShapeId,
        type: 'tactile-portal',
        x: pagePoint.x - (session.pointerOffsetPage?.x ?? w / 2),
        y: pagePoint.y - (session.pointerOffsetPage?.y ?? h / 2),
      } as any,
    ])
  }, [defaultDimensions, deleteSpawnedShape, editor, getDimensions, screenToPagePoint, spawnTactilePortalShape, thresholdPx, updateGhostPointer])

  const handlePointerUp = useCallback((item: TItem, e: React.PointerEvent) => {
    const session = sessionRef.current
    if (!session.active || session.pointerId !== e.pointerId) return
    if (session.item !== item) return
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch {}

    const spawned = !!session.spawnedId || session.wasDrag
    if (spawned) {
      finalizeSpawnedShape()
    } else if (session.payload && session.item) {
      onClick?.(session.payload, session.item)
    }
    setGhostState(null)
    resetSession()
    onSessionEnd?.()
  }, [finalizeSpawnedShape, onClick, onSessionEnd, resetSession])

  const cancel = useCallback(() => {
    deleteSpawnedShape()
    setGhostState(null)
    resetSession()
    onSessionEnd?.()
  }, [deleteSpawnedShape, onSessionEnd, resetSession])

  useEffect(() => {
    const handlePointerCancel = () => cancel()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel()
    }
    window.addEventListener('pointercancel', handlePointerCancel, { passive: true })
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => {
      window.removeEventListener('pointercancel', handlePointerCancel as any)
      window.removeEventListener('keydown', handleKeyDown as any)
    }
  }, [cancel])

  return {
    ghostState,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    cancel,
  }
}
