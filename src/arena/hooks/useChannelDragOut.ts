import { useCallback, useEffect, useRef } from 'react'
import { createShapeId, transact } from 'tldraw'
import { getGridSize, snapToGrid } from '../layout'

type Point = { x: number; y: number }

export type ChannelDragHandlers = {
  onChannelPointerDown: (slug: string, e: React.PointerEvent) => void
  onChannelPointerMove: (slug: string, e: React.PointerEvent) => void
  onChannelPointerUp: (slug: string, e: React.PointerEvent) => void
}

export type UseChannelDragOutOptions = {
  editor: any
  thresholdPx?: number
  screenToPagePoint: (clientX: number, clientY: number) => Point
  spawnChannelShape?: (
    slug: string,
    page: Point,
    dimensions?: { w: number; h: number }
  ) => string | null
  defaultDimensions?: { w: number; h: number }
  onDragStart?: () => void
}

export function useChannelDragOut(opts: UseChannelDragOutOptions): ChannelDragHandlers {
  const { editor, thresholdPx = 6, screenToPagePoint, spawnChannelShape, defaultDimensions, onDragStart } = opts

  const sessionRef = useRef<{
    active: boolean
    pointerId: number | null
    startScreen: Point | null
    spawnedId: string | null
    currentSlug: string | null
    initialDimensions: { w: number; h: number } | null
  }>({ active: false, pointerId: null, startScreen: null, spawnedId: null, currentSlug: null, initialDimensions: null })

  const defaultSpawnChannelShape = useCallback((slug: string, page: Point, dimensions?: { w: number; h: number }): string | null => {
    if (!editor) return null
    const gridSize = getGridSize()
    
    // Get initial dimensions
    let w = dimensions?.w ?? defaultDimensions?.w ?? 200
    let h = dimensions?.h ?? defaultDimensions?.h ?? 200
    
    // Constrain to max 232x232 while preserving aspect ratio
    const maxDim = 232
    if (w > maxDim || h > maxDim) {
      const aspectRatio = w / h
      if (w > h) {
        w = maxDim
        h = maxDim / aspectRatio
      } else {
        h = maxDim
        w = maxDim * aspectRatio
      }
    }
    
    // Snap to grid after constraining
    w = snapToGrid(w, gridSize)
    h = snapToGrid(h, gridSize)
    
    sessionRef.current.initialDimensions = { w, h }
    const id = createShapeId()
    transact(() => {
      editor.createShapes([{ id, type: '3d-box', x: snapToGrid(page.x - w / 2, gridSize), y: snapToGrid(page.y - h / 2, gridSize), props: { w, h, channel: slug } as any } as any])
      editor.setSelectedShapes([id])
    })
    return id
  }, [editor, defaultDimensions])

  const onChannelPointerDown = useCallback<ChannelDragHandlers['onChannelPointerDown']>((slug, e) => {
    sessionRef.current.active = true
    sessionRef.current.pointerId = e.pointerId
    sessionRef.current.startScreen = { x: e.clientX, y: e.clientY }
    sessionRef.current.spawnedId = null
    sessionRef.current.currentSlug = slug
    sessionRef.current.initialDimensions = null
    try { (e.currentTarget as any).setPointerCapture?.(e.pointerId) } catch {}
  }, [])

  const onChannelPointerMove = useCallback<ChannelDragHandlers['onChannelPointerMove']>((slug, e) => {
    const s = sessionRef.current
    if (!s.active) return
    if (s.pointerId !== e.pointerId) return
    if (s.currentSlug !== slug) return
    if (!s.startScreen) return

    const dx = e.clientX - s.startScreen.x
    const dy = e.clientY - s.startScreen.y
    const dist = Math.hypot(dx, dy)
    const page = screenToPagePoint(e.clientX, e.clientY)

    if (!s.spawnedId) {
      if (dist < thresholdPx) return
      const spawnFn = spawnChannelShape || defaultSpawnChannelShape
      s.spawnedId = spawnFn(slug, page)
      onDragStart?.()
      return
    }

    // Update position of spawned shape
    if (!s.initialDimensions) return
    const { w, h } = s.initialDimensions
    const gridSize = getGridSize()
    editor?.updateShapes([{ id: s.spawnedId as any, type: '3d-box', x: snapToGrid(page.x - w / 2, gridSize), y: snapToGrid(page.y - h / 2, gridSize) } as any])
  }, [screenToPagePoint, thresholdPx, spawnChannelShape, defaultSpawnChannelShape, editor])

  const onChannelPointerUp = useCallback<ChannelDragHandlers['onChannelPointerUp']>((slug, e) => {
    const s = sessionRef.current
    if (s.active && s.pointerId === e.pointerId && s.currentSlug === slug) {
      try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId) } catch {}
    }
    sessionRef.current.active = false
    sessionRef.current.pointerId = null
    sessionRef.current.startScreen = null
    sessionRef.current.spawnedId = null
    sessionRef.current.currentSlug = null
    sessionRef.current.initialDimensions = null
  }, [])

  const endSession = useCallback(() => {
    sessionRef.current.active = false
    sessionRef.current.pointerId = null
    sessionRef.current.startScreen = null
    sessionRef.current.spawnedId = null
    sessionRef.current.currentSlug = null
    sessionRef.current.initialDimensions = null
  }, [])

  useEffect(() => {
    const handleCancel = () => endSession()
    window.addEventListener('pointercancel', handleCancel, { passive: true })
    return () => window.removeEventListener('pointercancel', handleCancel as any)
  }, [endSession])

  return { onChannelPointerDown, onChannelPointerMove, onChannelPointerUp }
}
