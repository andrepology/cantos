import { useCallback, useState, useRef } from 'react'
import type { Card } from '../types'
import type { CardLayout } from './useTactileLayout'

interface DragState {
  id: number
  x: number
  y: number
  offsetX: number
  offsetY: number
}

interface UseCardReorderProps {
  items: Card[]
  setItems: (items: Card[]) => void
  layoutMap: Map<number, CardLayout>
  containerRef: React.RefObject<HTMLElement>
  w: number // Internal layout width, needed for scale calc
}

export function useCardReorder({ items, setItems, layoutMap, containerRef, w }: UseCardReorderProps) {
  const [dragState, setDragState] = useState<DragState | null>(null)
  
  // Dwell Logic State
  const pendingTargetId = useRef<number | null>(null)
  const pendingSince = useRef<number>(0)
  const DWELL_DELAY = 200 // ms to wait before swapping

  // Helper to get current scale factor between screen pixels and internal layout pixels
  const getScale = useCallback(() => {
      if (!containerRef.current) return 1
      const rect = containerRef.current.getBoundingClientRect()
      // Internal width 'w' vs Screen width 'rect.width'
      // scale = screen / internal
      // But we want to convert screen delta to internal delta: internal = screen / scale
      return rect.width / w
  }, [containerRef, w])

  const handleReorderStart = useCallback((cardId: number, initial: { x: number; y: number }) => {
      if (!containerRef.current) return
      
      const rect = containerRef.current.getBoundingClientRect()
      const cardLayout = layoutMap.get(cardId)
      
      if (!cardLayout) return

      const scale = getScale()
      
      // Calculate relative position in SCREEN pixels
      const mouseScreenX = initial.x - rect.left
      const mouseScreenY = initial.y - rect.top
      
      // Convert to INTERNAL pixels
      const mouseInternalX = mouseScreenX / scale
      const mouseInternalY = mouseScreenY / scale
      
      // Offset from card top-left in INTERNAL pixels
      const offsetX = mouseInternalX - cardLayout.x
      const offsetY = mouseInternalY - cardLayout.y
      
      setDragState({
          id: cardId,
          x: cardLayout.x,
          y: cardLayout.y,
          offsetX,
          offsetY
      })
      
      // Reset dwell state
      pendingTargetId.current = null
      pendingSince.current = 0
  }, [layoutMap, containerRef, getScale])

  const handleReorderDrag = useCallback((cardId: number, current: { x: number; y: number }) => {
      if (!containerRef.current || !dragState) return
      
      const rect = containerRef.current.getBoundingClientRect()
      const scale = getScale()

      const mouseScreenX = current.x - rect.left
      const mouseScreenY = current.y - rect.top
      
      const mouseInternalX = mouseScreenX / scale
      const mouseInternalY = mouseScreenY / scale
      
      const newX = mouseInternalX - dragState.offsetX
      const newY = mouseInternalY - dragState.offsetY
      
      // Update visual drag position
      setDragState(prev => prev ? { ...prev, x: newX, y: newY } : null)
      
      // Hit Test & Reorder
      // Find closest card
      let closestId: number | null = null
      let minDist = Infinity
      
      // Center of the dragged card (internal coords)
      const dragCX = newX + (layoutMap.get(cardId)?.width ?? 100) / 2
      const dragCY = newY + (layoutMap.get(cardId)?.height ?? 100) / 2
      
      for (const [id, layout] of layoutMap.entries()) {
          if (id === cardId) continue
          
          const cx = layout.x + layout.width / 2
          const cy = layout.y + layout.height / 2
          
          const dist = Math.hypot(cx - dragCX, cy - dragCY)
          if (dist < minDist) {
              minDist = dist
              closestId = id
          }
      }
      
      const threshold = 100 // px
      
      // Dwell Logic
      if (closestId !== null && minDist < threshold) {
          // We have a valid target
          if (closestId !== pendingTargetId.current) {
              // New target candidate
              pendingTargetId.current = closestId
              pendingSince.current = Date.now()
          } else {
              // Same target, check if we've dwelled long enough
              if (Date.now() - pendingSince.current > DWELL_DELAY) {
                  // COMMIT SWAP
                  const currentIndex = items.findIndex(c => c.id === cardId)
                  const targetIndex = items.findIndex(c => c.id === closestId)
                  
                  if (currentIndex !== -1 && targetIndex !== -1 && currentIndex !== targetIndex) {
                      // Swap
                      const newItems = [...items]
                      const [moved] = newItems.splice(currentIndex, 1)
                      newItems.splice(targetIndex, 0, moved)
                      setItems(newItems)
                      
                      // Reset pending since we just swapped
                      // Actually, now the closestId IS our id (spatially), or rather our slot moved.
                      // We should clear pending to prevent double-swap immediately if logic is fuzzy.
                      pendingTargetId.current = null
                      pendingSince.current = 0
                  }
              }
          }
      } else {
          // No valid target, reset
          pendingTargetId.current = null
          pendingSince.current = 0
      }
      
  }, [dragState, layoutMap, items, setItems, containerRef, getScale])

  const handleReorderEnd = useCallback((cardId: number) => {
      setDragState(null)
      pendingTargetId.current = null
      pendingSince.current = 0
  }, [])

  return {
    dragState,
    handleReorderStart,
    handleReorderDrag,
    handleReorderEnd
  }
}
