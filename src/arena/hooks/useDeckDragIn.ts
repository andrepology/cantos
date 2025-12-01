import { useState, useEffect, useRef, useCallback } from 'react'
import { useEditor, type TLShapeId } from 'tldraw'
import type { Card, CardImage, CardText, CardLink, CardMedia, CardPDF } from '../types'
import type { CardLayout } from './useTactileLayout'
import type { ArenaBlockShape } from '../../shapes/ArenaBlockShape'

interface UseDeckDragInProps {
  items: Card[]
  setItems: (items: Card[]) => void
  layoutMap: Map<number, CardLayout>
  containerRef: React.RefObject<HTMLElement>
  w: number
  h: number
  mode: string // 'stack' | 'row' | 'column' | 'grid'
}

interface DragInState {
  active: boolean
  index: number
  shapeId: TLShapeId | null
  previewCard: Card | null
}

export function useDeckDragIn({ items, setItems, layoutMap, containerRef, w, h, mode }: UseDeckDragInProps) {
  const editor = useEditor()
  
  const [dragInState, setDragInState] = useState<DragInState>({
    active: false,
    index: -1,
    shapeId: null,
    previewCard: null
  })

  // Track previous dragging state to detect drop
  const wasDraggingRef = useRef(false)
  const dragInStateRef = useRef(dragInState) // For access in effect without dep cycle

  useEffect(() => {
    dragInStateRef.current = dragInState
  }, [dragInState])

  // Convert ArenaBlockShape to Card
  const convertShapeToCard = useCallback((shape: ArenaBlockShape): Card => {
    const props = shape.props
    const base: any = {
      id: Date.now(), // Generate a new ID
      title: props.title || 'New Card',
      createdAt: new Date().toISOString(),
      // Preserve aspect ratio for layout
      mockAspect: props.aspectRatio || (props.w / props.h)
    }

    switch (props.kind) {
      case 'image':
        return { ...base, type: 'image', url: props.imageUrl || '', alt: props.title || '' } as CardImage
      case 'text':
        return { ...base, type: 'text', content: props.title || '' } as CardText
      case 'link':
        return { ...base, type: 'link', url: props.url || '', imageUrl: props.imageUrl } as CardLink
      case 'media':
        return { ...base, type: 'media', embedHtml: props.embedHtml || '', thumbnailUrl: props.imageUrl, url: props.url } as CardMedia
      case 'pdf':
        return { ...base, type: 'pdf', url: props.url || '', thumbnailUrl: props.imageUrl, contentType: 'application/pdf' } as CardPDF
      default:
        return { ...base, type: 'text', content: props.title || '' } as CardText
    }
  }, [])

  // Create a ghost card for preview
  const createGhostCard = useCallback((shape: ArenaBlockShape): Card => {
    const card = convertShapeToCard(shape)
    return {
      ...card,
      id: -999, // Special ID for ghost
      title: 'Drop to add',
      // Ensure the ghost doesn't have weird initial layout properties
    }
  }, [convertShapeToCard])

  // Helper to get scale
  const getScale = useCallback(() => {
      if (!containerRef.current) return 1
      const rect = containerRef.current.getBoundingClientRect()
      return rect.width / w
  }, [containerRef, w])

  // Helper to determine split axis
  const getSplitAxis = useCallback((m: string) => {
      if (m === 'column' || m === 'vtab' || m === 'stack' || m === 'mini') return 'vertical'
      return 'horizontal'
  }, [])

  useEffect(() => {
    let rafId: number
    
    const checkDrag = () => {
      const isDragging = editor.inputs.isDragging
      
      // HANDLE DROP (Transition True -> False)
      if (wasDraggingRef.current && !isDragging) {
        const state = dragInStateRef.current
        if (state.active && state.previewCard) {
          // COMMIT DROP
          const shape = editor.getShape(state.shapeId as TLShapeId) as ArenaBlockShape
          if (shape) {
            const newCard = convertShapeToCard(shape)
            
            const newItems = [...items]
            const insertIndex = state.index < 0 ? newItems.length : Math.min(state.index, newItems.length)
            newItems.splice(insertIndex, 0, newCard)
            
            setItems(newItems)
            editor.deleteShapes([state.shapeId as TLShapeId])
          }
        }
        setDragInState({ active: false, index: -1, shapeId: null, previewCard: null })
      }
      
      // HANDLE DRAG (State is True)
      if (isDragging) {
        const selectedShapes = editor.getSelectedShapes()
        const draggedShape = selectedShapes.length === 1 && selectedShapes[0].type === 'arena-block' 
          ? selectedShapes[0] as ArenaBlockShape 
          : null

        if (draggedShape && containerRef.current) {
          const inputs = editor.inputs
          const pointerClient = { x: inputs.currentScreenPoint.x, y: inputs.currentScreenPoint.y }
          const containerRect = containerRef.current.getBoundingClientRect()
          
          const isOver = 
            pointerClient.x >= containerRect.left &&
            pointerClient.x <= containerRect.right &&
            pointerClient.y >= containerRect.top &&
            pointerClient.y <= containerRect.bottom
            
          if (isOver) {
            const scale = getScale()
            const mouseInternalX = (pointerClient.x - containerRect.left) / scale
            const mouseInternalY = (pointerClient.y - containerRect.top) / scale
            
            let closestIndex = -1
            let foundIntersection = false

            // 1. Strict Intersection Pass (Geometry-based)
            // With overlap fix: Find ALL intersecting cards, pick the one with center closest to pointer
            const intersectingIndices: number[] = []

            for (let i = 0; i < items.length; i++) {
                 const item = items[i]
                 const layout = layoutMap.get(item.id)
                 if (!layout) continue
                 
                 if (mouseInternalX >= layout.x && mouseInternalX <= layout.x + layout.width &&
                     mouseInternalY >= layout.y && mouseInternalY <= layout.y + layout.height) {
                     intersectingIndices.push(i)
                 }
            }

            if (intersectingIndices.length > 0) {
                foundIntersection = true
                
                // Resolving overlapping hitboxes: pick closest center
                let bestIntersectIndex = -1
                let minCenterDist = Infinity

                for (const idx of intersectingIndices) {
                    const item = items[idx]
                    const layout = layoutMap.get(item.id)
                    if (!layout) continue
                    const cx = layout.x + layout.width / 2
                    const cy = layout.y + layout.height / 2
                    const dist = Math.hypot(cx - mouseInternalX, cy - mouseInternalY)
                    if (dist < minCenterDist) {
                        minCenterDist = dist
                        bestIntersectIndex = idx
                    }
                }

                const axis = getSplitAxis(mode)
                const layout = layoutMap.get(items[bestIntersectIndex].id)!
                
                // Split logic
                if (axis === 'vertical') {
                     const midY = layout.y + layout.height / 2
                     closestIndex = mouseInternalY < midY ? bestIntersectIndex : bestIntersectIndex + 1
                 } else {
                     const midX = layout.x + layout.width / 2
                     closestIndex = mouseInternalX < midX ? bestIntersectIndex : bestIntersectIndex + 1
                 }
            }

            // 2. Distance Fallback (Whitespace/Gaps)
            if (!foundIntersection) {
                let minDist = Infinity
                
                items.forEach((item, idx) => {
                   const layout = layoutMap.get(item.id)
                   if (!layout) return
                   
                   const cx = layout.x + layout.width / 2
                   const cy = layout.y + layout.height / 2
                   
                   const dist = Math.hypot(cx - mouseInternalX, cy - mouseInternalY)
                   
                   if (dist < minDist) {
                     minDist = dist
                     closestIndex = idx
                   }
                })
                
                // Refinement for whitespace
                if (closestIndex !== -1) {
                     const item = items[closestIndex]
                     const layout = layoutMap.get(item.id)
                     if (layout) {
                         const cx = layout.x + layout.width / 2
                         const cy = layout.y + layout.height / 2
                         
                         let isAfter = false
                         
                         // Simplified Grid Heuristic:
                         // If vertical distance is dominant and positive -> likely next row
                         // Otherwise, use horizontal
                         if (mode === 'grid') {
                             const dx = mouseInternalX - cx
                             const dy = mouseInternalY - cy
                             
                             // If strictly below the bottom edge -> NEXT ROW -> after
                             if (dy > layout.height / 2) {
                                 isAfter = true
                             } 
                             // If strictly above top edge -> BEFORE (default false)
                             else if (dy < -layout.height / 2) {
                                 isAfter = false
                             }
                             // If vertically within card bounds (gutter area), rely on X
                             else {
                                 isAfter = dx > 0
                             }
                         } else {
                             // Standard logic for 1D lists
                             if (mode === 'row' || mode === 'tab') {
                                 isAfter = mouseInternalX > cx
                             } else {
                                 isAfter = mouseInternalY > cy
                             }
                         }
                         
                         if (isAfter) closestIndex++
                     }
                }
            }
            
            if (closestIndex === -1) closestIndex = items.length

            if (!dragInStateRef.current.active || dragInStateRef.current.index !== closestIndex) {
               const ghost = createGhostCard(draggedShape)
               setDragInState({
                 active: true,
                 index: closestIndex,
                 shapeId: draggedShape.id,
                 previewCard: ghost
               })
            }
          } else {
             if (dragInStateRef.current.active) {
               setDragInState({ active: false, index: -1, shapeId: null, previewCard: null })
             }
          }
        } else {
           if (dragInStateRef.current.active) {
             setDragInState({ active: false, index: -1, shapeId: null, previewCard: null })
           }
        }
      }

      wasDraggingRef.current = isDragging
      rafId = requestAnimationFrame(checkDrag)
    }

    rafId = requestAnimationFrame(checkDrag)
    return () => cancelAnimationFrame(rafId)
  }, [editor, items, setItems, layoutMap, containerRef, getScale, createGhostCard, getSplitAxis, mode])

  return dragInState
}
