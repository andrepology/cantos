import { useCallback, useEffect, useRef, useState } from 'react'
import type { Card } from '../types'
import { createShapeId } from 'tldraw'

type Point = { x: number; y: number }

export type DeckDragHandlers = {
  onCardPointerDown: (card: Card, size: { w: number; h: number }, e: React.PointerEvent) => void
  onCardPointerMove: (card: Card, size: { w: number; h: number }, e: React.PointerEvent) => void
  onCardPointerUp: (card: Card, size: { w: number; h: number }, e: React.PointerEvent) => void
  isDragging: boolean
}

export type UseDeckDragOutOptions = {
  editor: any
  thresholdPx?: number
  screenToPagePoint: (clientX: number, clientY: number) => Point
  spawnFromCard: (
    card: Card,
    page: Point,
    ctx: { zoom: number; cardSize: { w: number; h: number }; pointerOffsetPage?: Point | null; measuredAspect?: number }
  ) => string | null
  updatePosition: (
    id: string,
    page: Point,
    ctx: { zoom: number; cardSize: { w: number; h: number }; pointerOffsetPage?: Point | null; measuredAspect?: number }
  ) => void
  onStartDragFromSelectedCard?: (card: Card) => void
}

export function useDeckDragOut(opts: UseDeckDragOutOptions): DeckDragHandlers {
  const { editor, thresholdPx = 6, screenToPagePoint, spawnFromCard, updatePosition, onStartDragFromSelectedCard } = opts

  const sessionRef = useRef<{
    active: boolean
    pointerId: number | null
    startScreen: Point | null
    spawnedId: string | null
    lastCardSize: { w: number; h: number } | null
    pointerOffsetPage: Point | null
    measuredAspect: number | null
  }>({ active: false, pointerId: null, startScreen: null, spawnedId: null, lastCardSize: null, pointerOffsetPage: null, measuredAspect: null })

  const [hasActiveDrag, setHasActiveDrag] = useState(false)

  const getZoom = useCallback(() => (typeof editor?.getZoomLevel === 'function' ? editor.getZoomLevel() || 1 : 1), [editor])

  const onCardPointerDown = useCallback<DeckDragHandlers['onCardPointerDown']>((_card, size, e) => {
    sessionRef.current.active = true
    sessionRef.current.pointerId = e.pointerId
    sessionRef.current.startScreen = { x: e.clientX, y: e.clientY }
    sessionRef.current.spawnedId = null
    sessionRef.current.lastCardSize = size
    // Attempt to read an already-loaded img's intrinsic aspect from the rendered cell
    try {
      const el = e.currentTarget as HTMLElement
      const img = el.querySelector('img') as HTMLImageElement | null
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        sessionRef.current.measuredAspect = img.naturalWidth / img.naturalHeight
      } else {
        sessionRef.current.measuredAspect = null
      }
    } catch {
      sessionRef.current.measuredAspect = null
    }
    try {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const oxCss = e.clientX - rect.left
      const oyCss = e.clientY - rect.top
      sessionRef.current.pointerOffsetPage = { x: oxCss / getZoom(), y: oyCss / getZoom() }
    } catch {
      sessionRef.current.pointerOffsetPage = null
    }
    try { (e.currentTarget as any).setPointerCapture?.(e.pointerId) } catch {}
  }, [getZoom])

  const onCardPointerMove = useCallback<DeckDragHandlers['onCardPointerMove']>((card, _size, e) => {
    const s = sessionRef.current
    if (!s.active) return
    if (s.pointerId !== e.pointerId) return
    if (!s.startScreen) return

    const dx = e.clientX - s.startScreen.x
    const dy = e.clientY - s.startScreen.y
    const dist = Math.hypot(dx, dy)

    if (!s.spawnedId) {
      if (dist < thresholdPx) return
      const page = screenToPagePoint(e.clientX, e.clientY)
      if (onStartDragFromSelectedCard) onStartDragFromSelectedCard(card)
      s.spawnedId = spawnFromCard(card, page, { zoom: getZoom(), cardSize: s.lastCardSize || { w: 240, h: 240 }, pointerOffsetPage: s.pointerOffsetPage, measuredAspect: s.measuredAspect ?? undefined })
      setHasActiveDrag(true) // Trigger global listeners
      return
    }

    // For active drags, use global listeners instead of element events
    // This avoids react-window virtualization issues
  }, [getZoom, onStartDragFromSelectedCard, screenToPagePoint, spawnFromCard, updatePosition, thresholdPx])

  const endSession = useCallback((e?: React.PointerEvent) => {
    if (e && sessionRef.current.pointerId === e.pointerId) {
      try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId) } catch {}
    }
    sessionRef.current.active = false
    sessionRef.current.pointerId = null
    sessionRef.current.startScreen = null
    sessionRef.current.spawnedId = null
    setHasActiveDrag(false) // Reset global listeners
  }, [])

  const onCardPointerUp = useCallback<DeckDragHandlers['onCardPointerUp']>((_card, _size, e) => {
    // Clear spawnDragging on any selected spawned shape before ending session
    try {
      const anyEditor = editor as any
      const ids = anyEditor?.getSelectedShapeIds?.() || []
      for (const id of ids) {
        const s = anyEditor?.getShape?.(id)
        if (!s) continue
        if ((s.props as any)?.spawnDragging) {
          editor.updateShape({ id, type: s.type, props: { spawnDragging: false } as any })
          // Force TLDraw to re-render crisply by triggering a no-op geometry update
          requestAnimationFrame(() => {
            try {
              const shape = anyEditor?.getShape?.(id)
              if (shape) {
                editor.updateShape({ id, type: s.type, x: shape.x, y: shape.y })
              }
            } catch {}
          })
        }
      }
    } catch {}
    endSession(e)
  }, [endSession, editor])

  // Global listeners for continuous drag updates (bypasses react-window virtualization issues)
  useEffect(() => {
    if (!hasActiveDrag) return

    const s = sessionRef.current
    if (!s.spawnedId) return

    const handleMove = (e: PointerEvent) => {
      if (s.pointerId !== e.pointerId || !s.spawnedId) return
      const page = screenToPagePoint(e.clientX, e.clientY)
      updatePosition(s.spawnedId, page, { zoom: getZoom(), cardSize: s.lastCardSize || { w: 240, h: 240 }, pointerOffsetPage: s.pointerOffsetPage, measuredAspect: s.measuredAspect ?? undefined })
    }

    const handleUp = (e: PointerEvent) => {
      if (s.pointerId === e.pointerId) {
        endSession()
      }
    }

    const handleCancel = (e: PointerEvent) => {
      if (s.pointerId === e.pointerId) {
        endSession()
      }
    }

    // Use capture phase to ensure listeners work even with stopEventPropagation
    window.addEventListener('pointermove', handleMove, { capture: true, passive: true })
    window.addEventListener('pointerup', handleUp, { capture: true, passive: true })
    window.addEventListener('pointercancel', handleCancel, { capture: true, passive: true })

    return () => {
      window.removeEventListener('pointermove', handleMove, { capture: true } as any)
      window.removeEventListener('pointerup', handleUp, { capture: true } as any)
      window.removeEventListener('pointercancel', handleCancel, { capture: true } as any)
    }
  }, [hasActiveDrag, getZoom, screenToPagePoint, updatePosition, endSession])

  useEffect(() => {
    const handleCancel = () => endSession()
    window.addEventListener('pointercancel', handleCancel, { passive: true })
    return () => window.removeEventListener('pointercancel', handleCancel as any)
  }, [endSession])

  return { onCardPointerDown, onCardPointerMove, onCardPointerUp, isDragging: hasActiveDrag }
}


