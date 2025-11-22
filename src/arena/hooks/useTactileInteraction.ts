import { useCallback, useRef } from 'react'
import { useEditor } from 'tldraw'
import type { Card } from '../types'
import { useSpawnEngine } from './useSpawnEngine'
import { getGridSize, snapToGrid } from '../layout'

interface UseTactileInteractionProps {
  onCardClick: (cardId: number) => void
}

export function useTactileInteraction({ onCardClick }: UseTactileInteractionProps) {
  const editor = useEditor()
  const { spawnFromCard } = useSpawnEngine()
  
  const state = useRef<{
    active: boolean
    pointerId: number | null
    startScreen: { x: number; y: number } | null
    activeCard: Card | null
    activeCardLayout: { w: number, h: number } | null
    spawnedShapeId: string | null
    isDragging: boolean
  }>({
    active: false,
    pointerId: null,
    startScreen: null,
    activeCard: null,
    activeCardLayout: null,
    spawnedShapeId: null,
    isDragging: false
  })

  const screenToPage = useCallback((x: number, y: number) => {
    const anyEditor = editor as any
    if (typeof anyEditor.screenToPage === 'function') return anyEditor.screenToPage({ x, y })
    if (typeof anyEditor.viewportScreenToPage === 'function') return anyEditor.viewportScreenToPage({ x, y })
    const inputs = (editor as any).inputs
    if (inputs?.currentPagePoint) return inputs.currentPagePoint
    const v = editor.getViewportPageBounds()
    return { x: v.midX, y: v.midY }
  }, [editor])

  const handlePointerDown = useCallback((card: Card, layout: { w: number, h: number }, e: React.PointerEvent) => {
    state.current = {
      active: true,
      pointerId: e.pointerId,
      startScreen: { x: e.clientX, y: e.clientY },
      activeCard: card,
      activeCardLayout: layout,
      spawnedShapeId: null,
      isDragging: false
    }
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch {}
    e.stopPropagation()
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const s = state.current
    if (!s.active || s.pointerId !== e.pointerId) return
    
    const dx = e.clientX - s.startScreen!.x
    const dy = e.clientY - s.startScreen!.y
    const dist = Math.hypot(dx, dy)

    // Start Dragging
    if (!s.isDragging && dist > 1) {
      s.isDragging = true
      
      // Spawn logic
      if (s.activeCard && s.activeCardLayout) {
        // Use the layout dimensions directly for the spawn context
        // Calculate pointer offset relative to the card center or click point?
        // Let's center it on the pointer for now to match "pick up" feel
        // Or better: relative to the click point within the card
        const page = screenToPage(e.clientX, e.clientY)
        const zoom = editor.getZoomLevel()
        
        // We need to pass the card size *unzoomed* because spawn engine expects "cardSize" (usually rendered px)
        // But wait, TactileCard layout props are in "canvas/content space" pixels?
        // No, they are CSS pixels in the container.
        // We should just pass the raw layout width/height.
        
        s.spawnedShapeId = spawnFromCard(s.activeCard, page, { 
            zoom, 
            cardSize: { w: s.activeCardLayout.w, h: s.activeCardLayout.h },
            // We can calculate exact offset if we want strict tracking
            pointerOffsetPage: null 
        })
      }
    }

    // Continue Dragging
    if (s.isDragging && s.spawnedShapeId) {
       const page = screenToPage(e.clientX, e.clientY)
       const shape = editor.getShape(s.spawnedShapeId as any)
       if (shape) {
          // Center the shape on cursor
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
  }, [editor, screenToPage, spawnFromCard])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const s = state.current
    if (!s.active || s.pointerId !== e.pointerId) return

    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId) } catch {}

    if (!s.isDragging) {
        // It was a Click!
        if (s.activeCard) {
            onCardClick(s.activeCard.id)
        }
    } else {
        // It was a Drag - cleanup
        if (s.spawnedShapeId) {
             // Reset spawnDragging prop
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

    // Reset state
    state.current = {
        active: false,
        pointerId: null,
        startScreen: null,
        activeCard: null,
        activeCardLayout: null,
        spawnedShapeId: null,
        isDragging: false
    }
    
    e.stopPropagation()
  }, [editor, onCardClick])

  return {
    bind: (card: Card, layout: { w: number, h: number }) => ({
        onPointerDown: (e: React.PointerEvent) => handlePointerDown(card, layout, e),
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
        // Also bind onClick to stop propagation just in case, but do nothing
        onClick: (e: React.MouseEvent) => e.stopPropagation()
    })
  }
}

