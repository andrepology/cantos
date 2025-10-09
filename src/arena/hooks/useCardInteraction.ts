import { useCallback, useRef, useState } from 'react'
import type { Card } from '../types'

export interface UseCardInteractionOptions {
  onCardPointerDown?: (card: Card, size: { w: number; h: number }, e: React.PointerEvent) => void
  onCardPointerMove?: (card: Card, size: { w: number; h: number }, e: React.PointerEvent) => void
  onCardPointerUp?: (card: Card, size: { w: number; h: number }, e: React.PointerEvent) => void
  onSelectCard?: (card: Card, rectCss: { left: number; top: number; right: number; bottom: number }) => void
  onSelectedCardRectChange?: (rectCss: { left: number; top: number; right: number; bottom: number }) => void
  selectedCardId?: number
}

export interface UseCardInteractionResult {
  hoveredId: number | null
  setHoveredId: React.Dispatch<React.SetStateAction<number | null>>
  rightClickedCard: Card | null
  setRightClickedCard: React.Dispatch<React.SetStateAction<Card | null>>
  panelPosition: { x: number; y: number } | null
  setPanelPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>
  measureCardRectRelativeToContainer: (el: HTMLElement) => { left: number; top: number; right: number; bottom: number }
  scheduleSelectedRectUpdate: () => void
  suppressClickIfDragged: (e: React.MouseEvent | React.PointerEvent) => boolean
  handleCardContextMenu: (e: React.MouseEvent<HTMLDivElement>, card: Card) => void
  handleCardClick: (e: React.PointerEvent | React.MouseEvent, card: Card, el: HTMLElement) => void
  handleCardPointerDown: (e: React.PointerEvent, card: Card) => void
  handleCardPointerMove: (e: React.PointerEvent, card: Card) => void
  handleCardPointerUp: (e: React.PointerEvent, card: Card) => void
  selectedRectRafRef: React.RefObject<number | null>
  dragOutGuardRef: React.RefObject<boolean>
  containerRef: React.RefObject<HTMLDivElement | null>
}

export function useCardInteraction({
  onCardPointerDown,
  onCardPointerMove,
  onCardPointerUp,
  onSelectCard,
  onSelectedCardRectChange,
  selectedCardId
}: UseCardInteractionOptions): UseCardInteractionResult {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [panelPosition, setPanelPosition] = useState<{ x: number; y: number } | null>(null)
  const [rightClickedCard, setRightClickedCard] = useState<Card | null>(null)
  const selectedRectRafRef = useRef<number | null>(null)
  const dragOutGuardRef = useRef(false)
  // Cache per-pointer data to avoid repeated layout reads during move/up
  const pointerSessionRef = useRef<{
    active: boolean
    pointerId: number | null
    startX: number
    startY: number
    startedDrag: boolean
    cachedSize: { w: number; h: number } | null
  }>({ active: false, pointerId: null, startX: 0, startY: 0, startedDrag: false, cachedSize: null })

  const measureCardRectRelativeToContainer = useCallback((el: HTMLElement): { left: number; top: number; right: number; bottom: number } => {
    const c = containerRef.current
    const r = el.getBoundingClientRect()
    if (!c) return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    const cr = c.getBoundingClientRect()
    return { left: r.left - cr.left, top: r.top - cr.top, right: r.right - cr.left, bottom: r.bottom - cr.top }
  }, [])

  const scheduleSelectedRectUpdate = useCallback(() => {
    if (!onSelectedCardRectChange || selectedCardId == null) return
    if (selectedRectRafRef.current != null) return
    selectedRectRafRef.current = requestAnimationFrame(() => {
      selectedRectRafRef.current = null
      try {
        const c = containerRef.current
        if (!c) return
        const sel = c.querySelector(`[data-card-id="${String(selectedCardId)}"]`) as HTMLElement | null
        if (!sel) return
        const rect = measureCardRectRelativeToContainer(sel)
        onSelectedCardRectChange(rect)
      } catch {}
    })
  }, [onSelectedCardRectChange, selectedCardId, measureCardRectRelativeToContainer])

  // Tiny shared guard to distinguish drag-out from click selection
  const suppressClickIfDragged = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    if (dragOutGuardRef.current) {
      try { (e as any).preventDefault?.() } catch {}
      try { (e as any).stopPropagation?.() } catch {}
      dragOutGuardRef.current = false
      return true
    }
    return false
  }, [])

  // Handle right-click on cards
  const handleCardContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>, card: Card) => {
    e.preventDefault()
    e.stopPropagation()

    if (card.type === 'channel') {
      const targetRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      setPanelPosition({ x: targetRect.right + 8, y: targetRect.top })
      setRightClickedCard(card)
    }
  }, [])

  const handleCardClick = useCallback((e: React.PointerEvent | React.MouseEvent, card: Card, el: HTMLElement) => {
    if (suppressClickIfDragged(e)) return
    if (!onSelectCard) return
    const rect = measureCardRectRelativeToContainer(el)
    onSelectCard(card, rect)
  }, [suppressClickIfDragged, onSelectCard, measureCardRectRelativeToContainer])

  const handleCardPointerDown = useCallback((e: React.PointerEvent, card: Card) => {
    dragOutGuardRef.current = false
    const ps = pointerSessionRef.current
    ps.active = true
    ps.pointerId = e.pointerId
    ps.startX = e.clientX
    ps.startY = e.clientY
    ps.startedDrag = false
    // Measure once on pointerdown and cache
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    ps.cachedSize = { w: rect.width, h: rect.height }
    try { (e.currentTarget as any).setPointerCapture?.(e.pointerId) } catch {}
    if (onCardPointerDown) onCardPointerDown(card, ps.cachedSize, e)
  }, [onCardPointerDown])

  const handleCardPointerMove = useCallback((e: React.PointerEvent, card: Card) => {
    dragOutGuardRef.current = true
    const ps = pointerSessionRef.current
    if (!ps.active || ps.pointerId !== e.pointerId) return
    // Gate move until a small threshold to avoid work during hover
    if (!ps.startedDrag) {
      const dx = e.clientX - ps.startX
      const dy = e.clientY - ps.startY
      const dist = Math.hypot(dx, dy)
      if (dist < 3) return
      ps.startedDrag = true
    }
    // Reuse cached size; avoid getBoundingClientRect during move
    const size = ps.cachedSize || { w: 0, h: 0 }
    if (onCardPointerMove) onCardPointerMove(card, size, e)
  }, [onCardPointerMove])

  const handleCardPointerUp = useCallback((e: React.PointerEvent, card: Card) => {
    const ps = pointerSessionRef.current
    const size = ps.cachedSize || { w: 0, h: 0 }
    if (onCardPointerUp) onCardPointerUp(card, size, e)
    if (ps.pointerId === e.pointerId) {
      try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId) } catch {}
    }
    ps.active = false
    ps.pointerId = null
    ps.cachedSize = null
    ps.startedDrag = false
  }, [onCardPointerUp])

  return {
    hoveredId,
    setHoveredId,
    rightClickedCard,
    setRightClickedCard,
    panelPosition,
    setPanelPosition,
    measureCardRectRelativeToContainer,
    scheduleSelectedRectUpdate,
    suppressClickIfDragged,
    handleCardContextMenu,
    handleCardClick,
    handleCardPointerDown,
    handleCardPointerMove,
    handleCardPointerUp,
    selectedRectRafRef,
    dragOutGuardRef,
    containerRef,
  }
}
