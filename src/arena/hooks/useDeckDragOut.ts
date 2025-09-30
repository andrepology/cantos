import { useCallback, useEffect, useRef, useState } from 'react'
import type { Card } from '../types'
import { createShapeId } from 'tldraw'

type Point = { x: number; y: number }

export type DeckDragHandlers = {
  onCardPointerDown: (card: Card, size: { w: number; h: number }, e: React.PointerEvent) => void
  onCardPointerMove: (card: Card, size: { w: number; h: number }, e: React.PointerEvent) => void
  onCardPointerUp: (card: Card, size: { w: number; h: number }, e: React.PointerEvent) => void
}

export type UseDeckDragOutOptions = {
  editor: any
  thresholdPx?: number
  screenToPagePoint: (clientX: number, clientY: number) => Point
  spawnFromCard: (
    card: Card,
    page: Point,
    ctx: { zoom: number; cardSize: { w: number; h: number }; pointerOffsetPage?: Point | null }
  ) => string | null
  updatePosition: (
    id: string,
    page: Point,
    ctx: { zoom: number; cardSize: { w: number; h: number }; pointerOffsetPage?: Point | null }
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
  }>({ active: false, pointerId: null, startScreen: null, spawnedId: null, lastCardSize: null, pointerOffsetPage: null })

  const [hasActiveDrag, setHasActiveDrag] = useState(false)

  const getZoom = useCallback(() => (typeof editor?.getZoomLevel === 'function' ? editor.getZoomLevel() || 1 : 1), [editor])

  const onCardPointerDown = useCallback<DeckDragHandlers['onCardPointerDown']>((_card, size, e) => {
    sessionRef.current.active = true
    sessionRef.current.pointerId = e.pointerId
    sessionRef.current.startScreen = { x: e.clientX, y: e.clientY }
    sessionRef.current.spawnedId = null
    sessionRef.current.lastCardSize = size
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
      s.spawnedId = spawnFromCard(card, page, { zoom: getZoom(), cardSize: s.lastCardSize || { w: 240, h: 240 }, pointerOffsetPage: s.pointerOffsetPage })
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
    endSession(e)
  }, [endSession])

  // Global listeners for continuous drag updates (bypasses react-window virtualization issues)
  useEffect(() => {
    if (!hasActiveDrag) return

    const s = sessionRef.current
    if (!s.spawnedId) return

    const handleMove = (e: PointerEvent) => {
      if (s.pointerId !== e.pointerId || !s.spawnedId) return
      const page = screenToPagePoint(e.clientX, e.clientY)
      updatePosition(s.spawnedId, page, { zoom: getZoom(), cardSize: s.lastCardSize || { w: 240, h: 240 }, pointerOffsetPage: s.pointerOffsetPage })
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

  return { onCardPointerDown, onCardPointerMove, onCardPointerUp }
}


