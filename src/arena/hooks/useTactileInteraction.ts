import { useCallback, useRef, useEffect, useState } from 'react'
import { useEditor } from 'tldraw'
import type { Card } from '../types'
import { useSpawnEngine } from './useSpawnEngine'
import { useScreenToPagePoint } from './useScreenToPage'

interface UseTactileInteractionProps {
  onCardClick: (cardId: number) => void
  onReorderStart?: (cardId: string, initial: { x: number; y: number }) => void
  onReorderDrag?: (cardId: string, current: { x: number; y: number }) => void
  onReorderEnd?: (cardId: string) => void
}

export function useTactileInteraction({ 
  onCardClick,
  onReorderStart,
  onReorderDrag,
  onReorderEnd
}: UseTactileInteractionProps) {
  const editor = useEditor()
  const { spawnFromCard } = useSpawnEngine()
  const [isSpawning, setIsSpawning] = useState(false)
  
  const state = useRef<{
    active: boolean
    pointerId: number | null
    startScreen: { x: number; y: number } | null
    activeCard: any | null
    activeCardLayout: { w: number, h: number } | null
    spawnedShapeId: string | null
    isDragging: boolean
    isReordering: boolean
    reorderOffset: { x: number, y: number } | null
  }>({
    active: false,
    pointerId: null,
    startScreen: null,
    activeCard: null,
    activeCardLayout: null,
    spawnedShapeId: null,
    isDragging: false,
    isReordering: false,
    reorderOffset: null
  })

  const screenToPage = useScreenToPagePoint()

  // Internal cleanup helper that doesn't depend on event object
  const cleanup = useCallback(() => {
      const s = state.current
      if (!s.active) return

      setIsSpawning(false)

      if (s.isDragging) {
        if (s.isReordering) {
            if (s.activeCard) {
                onReorderEnd?.(s.activeCard.$jazz?.id || s.activeCard.id)
            }
        } else if (s.spawnedShapeId) {
             const shape = editor.getShape(s.spawnedShapeId as any)
             if (shape) {
                editor.updateShape({ 
                    id: s.spawnedShapeId as any, 
                    type: shape.type as any, 
                    props: { spawnDragging: false } 
                } as any)
             }
        }
      }

      state.current = {
        active: false,
        pointerId: null,
        startScreen: null,
        activeCard: null,
        activeCardLayout: null,
        spawnedShapeId: null,
        isDragging: false,
        isReordering: false,
        reorderOffset: null
      }
  }, [editor, onReorderEnd])

  // Global Escape Abort
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && state.current.active) {
            // If dragging, we might want to revert...
            // For now, just cleanup which drops it where it is
            cleanup()
        }
    }
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [cleanup])

  const handlePointerDown = useCallback((card: any, layout: { w: number, h: number }, e: React.PointerEvent) => {
    const isReorderTrigger = e.ctrlKey || e.metaKey

    state.current = {
      active: true,
      pointerId: e.pointerId,
      startScreen: { x: e.clientX, y: e.clientY },
      activeCard: card,
      activeCardLayout: layout,
      spawnedShapeId: null,
      isDragging: false,
      isReordering: isReorderTrigger,
      reorderOffset: null
    }
    
    try { 
        const target = e.currentTarget as Element
        if (target.setPointerCapture) {
            target.setPointerCapture(e.pointerId) 
        }
    } catch {}
    e.stopPropagation()
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const s = state.current
    if (!s.active || s.pointerId !== e.pointerId) return
    
    // Buttons Check Failsafe
    // If we are supposedly active/dragging but no buttons are pressed, abort immediately.
    // Note: e.buttons === 0 means no button is down.
    // Exception: some touch devices might behave differently, but usually pointermove has buttons.
    // We only check this if we think we are dragging to avoid false positives on hover.
    if (s.active && e.buttons === 0) {
        cleanup()
        return
    }

    const dx = e.clientX - s.startScreen!.x
    const dy = e.clientY - s.startScreen!.y
    const dist = Math.hypot(dx, dy)

    // Start Dragging
    if (!s.isDragging && dist > 2) {
      s.isDragging = true
      
      if (s.isReordering) {
        if (s.activeCard) {
            onReorderStart?.(s.activeCard.$jazz?.id || s.activeCard.id, { x: s.startScreen!.x, y: s.startScreen!.y })
        }
      } else {
        if (s.activeCard && s.activeCardLayout) {
            const page = screenToPage(e.clientX, e.clientY)
            const zoom = editor.getZoomLevel()
            s.spawnedShapeId = spawnFromCard(s.activeCard, page, { 
                zoom, 
                cardSize: { w: s.activeCardLayout.w, h: s.activeCardLayout.h },
                pointerOffsetPage: null 
            })
            setIsSpawning(true)
        }
      }
    }

    // Continue Dragging
    if (s.isDragging) {
        if (s.isReordering) {
            if (s.activeCard) {
                onReorderDrag?.(s.activeCard.$jazz?.id || s.activeCard.id, { x: e.clientX, y: e.clientY })
            }
        } else if (s.spawnedShapeId) {
           const page = screenToPage(e.clientX, e.clientY)
           const shape = editor.getShape(s.spawnedShapeId as any)
           if (shape) {
              const w = (shape.props as any).w
              const h = (shape.props as any).h
              editor.updateShape({ 
                  id: s.spawnedShapeId as any, 
                  type: shape.type as any, 
                  x: page.x - w/2, 
                  y: page.y - h/2 
              } as any)
           }
        }
    }
  }, [editor, screenToPage, spawnFromCard, onReorderStart, onReorderDrag, cleanup])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const s = state.current
    if (!s.active) return 
    if (s.pointerId !== null && s.pointerId !== e.pointerId) return

    try { 
        const target = e.currentTarget as Element
        if (target.releasePointerCapture) {
            target.releasePointerCapture(e.pointerId) 
        }
    } catch {}

    if (!s.isDragging) {
        // Click
        if (s.activeCard) {
            onCardClick(s.activeCard.arenaId || s.activeCard.$jazz?.id || s.activeCard.id)
        }
        // Reset state
        state.current = {
            active: false,
            pointerId: null,
            startScreen: null,
            activeCard: null,
            activeCardLayout: null,
            spawnedShapeId: null,
            isDragging: false,
            isReordering: false,
            reorderOffset: null
        }
    } else {
        // Drag End -> Cleanup handles callbacks
        cleanup()
    }
    
    e.stopPropagation()
  }, [onCardClick, cleanup])

  // Robust cancellation
  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
     cleanup()
  }, [cleanup])

  const bind = useCallback((card: any, layout: { w: number, h: number }) => ({
        onPointerDown: (e: React.PointerEvent) => handlePointerDown(card, layout, e),
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
        onPointerCancel: handlePointerCancel,
        onLostPointerCapture: handlePointerCancel, // Extra safety
        onClick: (e: React.MouseEvent) => e.stopPropagation()
  }), [handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel])

  return {
    bind,
    isSpawning
  }
}
