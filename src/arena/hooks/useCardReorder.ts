import { useCallback, useState, useRef } from 'react'
import type { CardLayout, LayoutItem } from './useTactileLayout'

interface DragState {
  id: string
  x: number
  y: number
  offsetX: number
  offsetY: number
}

interface UseCardReorderProps {
  items: LayoutItem[]
  setItems: (items: LayoutItem[]) => void
  layoutMap: Map<string, CardLayout>
  containerRef: React.RefObject<HTMLElement>
  w: number // Internal layout width, needed for scale calc
  enabled?: boolean
}

export function useCardReorder({ items, setItems, layoutMap, containerRef, w, enabled = true }: UseCardReorderProps) {
  const [dragState, setDragState] = useState<DragState | null>(null)
  
  // Dwell Logic State
  const pendingTargetId = useRef<string | null>(null)
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

  const handleReorderStart = useCallback((cardId: string, initial: { x: number; y: number }) => {
      if (!enabled || !containerRef.current) return
      
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
  }, [layoutMap, containerRef, getScale, enabled])

  const handleReorderDrag = useCallback((cardId: string, current: { x: number; y: number }) => {
      if (!enabled || !containerRef.current || !dragState) return
      
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
      // Use POINTER POSITION for hit testing (more precise than card center)
      // Mouse internal coordinates are already calculated: mouseInternalX, mouseInternalY
      
      let closestId: string | null = null
      let minDist = Infinity
      
      // Pointer coordinates (internal space)
      const pointerX = mouseInternalX
      const pointerY = mouseInternalY
      
      for (const [id, layout] of layoutMap.entries()) {
          if (id === cardId) continue
          
          const cx = layout.x + layout.width / 2
          const cy = layout.y + layout.height / 2
          
          // Distance from pointer to card center
          const dist = Math.hypot(cx - pointerX, cy - pointerY)
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
                  
                  // Check if pointer has actually crossed the threshold line between current and target
                  // This prevents "snapping" before you actually reach the visual slot
                  const currentLayout = layoutMap.get(cardId)
                  const targetLayout = layoutMap.get(closestId)
                  
                  let hasCrossedThreshold = true // Default true if we can't determine geometry
                  
                  if (currentLayout && targetLayout) {
                      const currentCX = currentLayout.x + currentLayout.width / 2
                      const currentCY = currentLayout.y + currentLayout.height / 2
                      const targetCX = targetLayout.x + targetLayout.width / 2
                      const targetCY = targetLayout.y + targetLayout.height / 2
                      
                      // Midpoint between current slot and target slot
                      const midX = (currentCX + targetCX) / 2
                      const midY = (currentCY + targetCY) / 2
                      
                      // Check if pointer has crossed the midpoint towards the target
                      // Vector from current center to target center
                      const vecX = targetCX - currentCX
                      const vecY = targetCY - currentCY
                      
                      // Vector from current center to pointer
                      const ptrX = pointerX - currentCX
                      const ptrY = pointerY - currentCY
                      
                      // Project pointer vector onto direction vector
                      // If projection > 0.5 (past midpoint), then valid
                      // Dot product
                      const dot = ptrX * vecX + ptrY * vecY
                      const lenSq = vecX * vecX + vecY * vecY
                      
                      if (lenSq > 0) {
                          const projection = dot / lenSq
                          // Require crossing 50% of the way to the target center
                          if (projection < 0.5) {
                              hasCrossedThreshold = false
                          }
                      }
                  }

                  if (currentIndex !== -1 && targetIndex !== -1 && currentIndex !== targetIndex && hasCrossedThreshold) {
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
      
  }, [dragState, layoutMap, items, setItems, containerRef, getScale, enabled])

  const handleReorderEnd = useCallback((cardId: string) => {
      if (!enabled) return
      setDragState(null)
      pendingTargetId.current = null
      pendingSince.current = 0
  }, [enabled])

  return {
    dragState,
    handleReorderStart,
    handleReorderDrag,
    handleReorderEnd
  }
}
