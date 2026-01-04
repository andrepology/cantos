import { useEffect, useMemo, useRef, useState, useCallback, memo } from 'react'
import { motion, AnimatePresence, type MotionValue } from 'motion/react'
import type React from 'react'
import type { Card } from '../../arena/types'
import { useTactileLayout, getScrollBounds } from '../../arena/hooks/useTactileLayout'
import type { LayoutMode, CardLayout, LayoutItem } from '../../arena/hooks/useTactileLayout'
import { TactileCard } from './TactileCard'
import { useWheelControl } from '../../hooks/useWheelControl'
import { useScrollRestoration } from '../../arena/hooks/useScrollRestoration'
import { useTactileInteraction } from '../../arena/hooks/useTactileInteraction'
import { Scrubber } from '../../arena/Scrubber'
import { useStackNavigation, useScrubberVisibility } from '../hooks/useStackNavigation'
import { usePressFeedback } from '../../hooks/usePressFeedback'
import {
  recordDeckRender,
  recordLayoutTiming,
  recordScrollBoundsTiming,
  setLastMorphDuration,
} from '../../arena/tactilePerf'
import { recordRender } from '../../arena/renderCounts'
import { SPRING_PRESETS, PRESET_KEYS, STACK_CARD_STRIDE } from '../../arena/tactileUtils'
import { useCardReorder } from '../../arena/hooks/useCardReorder'
import { useDeckDragIn } from '../../arena/hooks/useDeckDragIn'
import { useCardRendering } from '../../arena/hooks/useCardRendering'
import { useEditor, type TLShapeId } from 'tldraw'
import type { PortalSource } from '../../arena/search/portalSearchTypes'
import { AuthorView } from './AuthorView'
import { BlockRenderer } from './BlockRenderer'
import { useStackArrowKeys } from '../hooks/useStackArrowKeys'
import type { AuthorMetadata } from '../../arena/hooks/useAuthorMetadata'

const SOURCE_TRANSITION = {
  duration: 0.18,
  ease: 'easeOut' as const,
  scale: 0.985,
}

interface TactileDeckProps {
  w: number
  h: number
  mode: LayoutMode
  source: PortalSource
  blockIds: string[]
  layoutItems: LayoutItem[]
  authorMetadata?: AuthorMetadata | null
  shapeId?: TLShapeId
  isSelected?: boolean
  isHovered?: boolean
  initialScrollOffset?: number
  initialFocusedCardId?: number
  onFocusChange?: (block: { id: number; title: string } | null) => void
  onFocusPersist?: (id: number | null) => void
}

export const TactileDeck = memo(function TactileDeck({
  w,
  h,
  mode,
  source,
  blockIds,
  layoutItems,
  authorMetadata,
  shapeId,
  isSelected = false,
  isHovered = false,
  initialScrollOffset = 0,
  initialFocusedCardId,
  onFocusChange,
  onFocusPersist,
}: TactileDeckProps) {
  recordRender('TactileDeck')
  recordRender(`TactileDeck:${shapeId ?? 'unknown'}`)
  // Perf: track renders
  // recordDeckRender()

  const isAuthorView = source.kind === 'author'

  const editor = useEditor()

  const [items, setItems] = useState<LayoutItem[]>(layoutItems)
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)

  const [scrollOffset, setScrollOffset] = useState(initialScrollOffset)
  const [isScrolling, setIsScrolling] = useState(false)
  // Ref to access current state in callbacks without re-binding
  const isScrollingRef = useRef(false)

  // Debounced scroll persistence
  const scrollDebounceRef = useRef<number | null>(null)
  const pendingScrollRef = useRef<number | null>(null)

  // Sync ref
  useEffect(() => {
      isScrollingRef.current = isScrolling
  }, [isScrolling])

  // Debounced scroll persistence to Tactile Portal Shape
  const persistScrollOffset = useCallback((offset: number) => {
    if (!shapeId) return

    // Clear any pending update
    if (scrollDebounceRef.current) {
      clearTimeout(scrollDebounceRef.current)
    }

    pendingScrollRef.current = offset

    // Substantial debounce - wait 800ms after scroll stops before updating shape
    scrollDebounceRef.current = setTimeout(() => {
      if (pendingScrollRef.current !== null) {
        editor.updateShape({
          id: shapeId,
          type: 'tactile-portal',
          props: { scrollOffset: pendingScrollRef.current }
        })
        pendingScrollRef.current = null
      }
    }, 800)
  }, [editor, shapeId])
  
  // Focus Mode State - NOW FULLY CONTROLLED
  const focusTargetId = initialFocusedCardId ?? null
  const isFocusMode = focusTargetId !== null
  
  // Keep track of the last focused card even after exiting focus mode, so we can keep it on top during transitions
  const lastFocusedIdRef = useRef<number | null>(focusTargetId)
  if (focusTargetId !== null) {
      lastFocusedIdRef.current = focusTargetId
  }

  // Effective Mode: override if focused
  const effectiveMode = isFocusMode ? 'stack' : mode
  const isStackLikeMode = effectiveMode === 'stack' || effectiveMode === 'mini'
  const isStackKeyMode = effectiveMode === 'stack'
  const CARD_COUNT = items.length


  const handleStackScrollChange = useCallback(
    (offset: number) => {
      if (isScrollingRef.current) {
          isScrollingRef.current = false
          setIsScrolling(false)
      }
      setScrollOffset(offset)
      persistScrollOffset(offset)

      // Update focus target when navigating in focus mode
      if (isFocusMode) {
        const focusedIndex = Math.round(offset / STACK_CARD_STRIDE)
        const focusedCard = items[focusedIndex]
        if (focusedCard && focusedCard.arenaId !== focusTargetId) {
          onFocusPersist?.(focusedCard.arenaId)
        }
      }
    },
    [setScrollOffset, persistScrollOffset, isFocusMode, items, focusTargetId, onFocusPersist]
  )

  const { stackIndex, goToIndex, handleWheelDelta, resetWheel } = useStackNavigation({
    cardCount: CARD_COUNT,
    stride: STACK_CARD_STRIDE,
    scrollOffset,
    isActive: isStackLikeMode,
    onScrollChange: handleStackScrollChange,
  })

  const stackIndexRef = useRef(stackIndex)

  useEffect(() => {
    stackIndexRef.current = stackIndex
  }, [stackIndex])

  useEffect(() => {
    if (!isFocusMode || focusTargetId == null) return
    const targetIndex = items.findIndex((c) => c.arenaId === focusTargetId)
    if (targetIndex === -1) return
    if (targetIndex === stackIndexRef.current) return
    goToIndex(targetIndex)
  }, [focusTargetId, goToIndex, isFocusMode, items])

  const {
    isVisible: isScrubberVisible,
    scrubberWidth,
    showScrubber,
    scrubberStyle,
    zoneStyle,
    handleZoneEnter,
    handleZoneLeave,
    handleScrubStart: visibilityScrubStart,
    handleScrubEnd: visibilityScrubEnd,
    forceHide: forceHideScrubber,
  } = useScrubberVisibility({
    isActive: isStackLikeMode,
    mode: effectiveMode,
    isFocusMode,
    cardCount: CARD_COUNT,
    containerWidth: w,
  })


  useEffect(() => {
    if (!isStackLikeMode) {
      resetWheel()
      forceHideScrubber()
    }
  }, [forceHideScrubber, isStackLikeMode, resetWheel])

  useStackArrowKeys({
    enabled: isStackKeyMode,
    isSelected: isSelected || isHovered,
    shapeId,
    getIndex: () => stackIndexRef.current,
    goToIndex,
  })


  const handleScrubberChange = useCallback(
    (nextIndex: number) => {
      goToIndex(nextIndex)
    },
    [goToIndex]
  )

  // State for scroll restoration - tracks EFFECTIVE mode
  const [prevEffectiveMode, setPrevEffectiveMode] = useState(effectiveMode)
  const [prevFocusMode, setPrevFocusMode] = useState(isFocusMode)
  const [prevSize, setPrevSize] = useState({ w, h })
  
  // State to differentiate scroll updates vs mode updates
  const [isAnimating, setIsAnimating] = useState(false)
  const animationTimeoutRef = useRef<number | null>(null)
  const morphStartTimeRef = useRef<number | null>(null)
  
  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current)
      }
      if (scrollDebounceRef.current) {
        clearTimeout(scrollDebounceRef.current)
      }
    }
  }, [])
  
  // Focus Mode Handler (Hoist before drag handlers)
  const handleCardClick = useCallback(
    (arenaId: number) => {
      const index = items.findIndex((c) => c.arenaId === arenaId)
      if (index === -1) return

      if (effectiveMode === 'stack') {
        goToIndex(index)
        onFocusPersist?.(arenaId)
        setIsAnimating(true)
        if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current)
        animationTimeoutRef.current = setTimeout(() => setIsAnimating(false), 100)
        return
      }

      onFocusPersist?.(arenaId)
      const newOffset = index * STACK_CARD_STRIDE
      setScrollOffset(newOffset)
      persistScrollOffset(newOffset)
      setIsAnimating(true)
      if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current)
      animationTimeoutRef.current = setTimeout(() => setIsAnimating(false), 100)
    },
    [effectiveMode, goToIndex, items, onFocusPersist, persistScrollOffset]
  )

  // Translate numeric focus ID to Jazz string ID for layout engine
  const focusedJazzId = useMemo(() => {
    const id = focusTargetId ?? lastFocusedIdRef.current
    if (id === null) return undefined
    return items.find(c => c.arenaId === id)?.id
  }, [focusTargetId, items])

  // Layout Calculation - Base layout for hit testing
  const baseLayoutResult = useTactileLayout({
    mode: effectiveMode,
    containerW: w,
    containerH: h,
    scrollOffset,
    items: items,
    isFocusMode,
    focusedCardId: focusedJazzId
  })

  // Track initial layouts for dropped items
  const droppedLayouts = useRef<Map<string, Partial<CardLayout>>>(new Map())

  // Drag In Logic (External Shapes)
  const dragInState = useDeckDragIn({
    items,
    setItems,
    layoutMap: baseLayoutResult.layoutMap,
    containerRef: containerRef as React.RefObject<HTMLElement>,
    w,
    h,
    mode: effectiveMode,
    onDrop: (item, layout) => {
      droppedLayouts.current.set(item.id, layout)
      // Clean up after animation would likely be done
      setTimeout(() => {
        droppedLayouts.current.delete(item.id)
      }, 1000)
    }
  })

  // Display Items: items + ghost if dragging in
  const displayItems = useMemo(() => {
    if (dragInState.active && dragInState.previewCard) {
      const newItems = [...items]
      // Clamp index
      const idx = Math.min(Math.max(0, dragInState.index), newItems.length)
      newItems.splice(idx, 0, dragInState.previewCard)
      return newItems
    }
    return items
  }, [items, dragInState])

  // Final Layout: Includes ghost drag card for rendering
  const finalLayoutResult = useMemo(() => {
    if (!dragInState.active) return baseLayoutResult
    return useTactileLayout({
      mode: effectiveMode,
      containerW: w,
      containerH: h,
      scrollOffset,
      items: displayItems,
      isFocusMode,
      focusedCardId: focusedJazzId
    })
  }, [baseLayoutResult, dragInState.active, effectiveMode, w, h, scrollOffset, displayItems, isFocusMode, focusedJazzId])
  
  const { layoutMap, contentSize } = finalLayoutResult

  // Reorder Logic - Operates on REAL items
  const { dragState, handleReorderStart, handleReorderDrag, handleReorderEnd } = useCardReorder({
      items,
      setItems,
      layoutMap, 
      containerRef: containerRef as React.RefObject<HTMLElement>,
      w
  })

  // Interaction Hook
  const interaction = useTactileInteraction({
     onCardClick: handleCardClick,
     onReorderStart: handleReorderStart,
     onReorderDrag: handleReorderDrag,
     onReorderEnd: handleReorderEnd
  })

  const selectedPreset = PRESET_KEYS[selectedPresetIndex]
  const springConfig = SPRING_PRESETS[selectedPreset]

  // Initialize Scroll Restoration Hook
  const restoration = useScrollRestoration(prevEffectiveMode, scrollOffset, items, { w, h })

  // Derived State Update Pattern (Render Loop)
  
  // 1. Handle Resize (Priority: preserve anchor)
  if (w !== prevSize.w || h !== prevSize.h) {
      const newScroll = restoration.getResizeScrollOffset(prevSize.w, prevSize.h)
      if (newScroll !== scrollOffset) {
          setScrollOffset(newScroll)
          persistScrollOffset(newScroll)
      }
      setPrevSize({ w, h })
  }
  // 2. Handle Mode Change
  else if (effectiveMode !== prevEffectiveMode || isFocusMode !== prevFocusMode) {
      let newScroll = scrollOffset

      if (effectiveMode !== prevEffectiveMode) {
          if (isFocusMode && !prevEffectiveMode.startsWith('stack')) {
              newScroll = scrollOffset

              if (scrollOffset === 0 && focusTargetId !== null) {
                 const index = items.findIndex(c => c.arenaId === focusTargetId)
                 if (index !== -1) newScroll = index * STACK_CARD_STRIDE
              }
          } else {
              const { nextScrollOffset } = restoration.getTransitionData(effectiveMode)
              newScroll = nextScrollOffset
          }
      } else if (isFocusMode && focusTargetId !== null) {
          const index = items.findIndex(c => c.arenaId === focusTargetId)
          if (index !== -1) newScroll = index * STACK_CARD_STRIDE
      }

      if (newScroll !== scrollOffset) {
          setScrollOffset(newScroll)
          persistScrollOffset(newScroll)
      }

      setPrevEffectiveMode(effectiveMode)
      setPrevFocusMode(isFocusMode)
      // Mode change is NOT a scroll action, it's a morph
      isScrollingRef.current = false
      setIsAnimating(true)
      morphStartTimeRef.current = performance.now()
      
      // Clear existing timeout if any
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current)
      }
      // Clear animation flag after morph completes
      animationTimeoutRef.current = setTimeout(() => {
        setIsAnimating(false)
        if (morphStartTimeRef.current != null) {
          const duration = performance.now() - morphStartTimeRef.current
          setLastMorphDuration(duration)
          morphStartTimeRef.current = null
        }
      }, 100)
  }

  // Calculate renderable and active sets using extracted hook
  const { renderIds, activeIds } = useCardRendering({
      items: displayItems,
      layoutMap,
      scrollOffset,
      containerW: w,
      containerH: h,
      mode: effectiveMode
  })

  // Scroll Bounds per mode
  const scrollBounds = useMemo(() => {
    const t0 = performance.now()
    const result = getScrollBounds(effectiveMode, contentSize, w, h, displayItems.length)
    const t1 = performance.now()
    recordScrollBoundsTiming(t1 - t0)
    return result
  }, [effectiveMode, contentSize, w, h, displayItems.length])

  const shouldHandleDeckWheel = useCallback(
    (e: WheelEvent) => !e.ctrlKey,
    []
  )

  // Scroll Accumulator for rAF-based throttling
  const scrollAccumulator = useRef({ x: 0, y: 0 })
  const rafId = useRef<number | null>(null)
  
  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current)
    }
  }, [])

  useWheelControl(containerRef, {
    capture: true,
    passive: false,
    condition: shouldHandleDeckWheel,
    onWheel:
      effectiveMode !== 'mini'
        ? (e) => {
            if (!shouldHandleDeckWheel(e)) return
            
            // Explicitly stop propagation as we are handling it
            e.stopPropagation()
            if (typeof e.stopImmediatePropagation === 'function') {
               e.stopImmediatePropagation()
            }
            
            // 1. Stack/Mini Mode: Discrete steps (Keep existing direct logic)
            if (isStackLikeMode) {
              const stage = Math.max(w, h, 240)
              const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? stage : 1
              const delta = -e.deltaY * unit
              if (!Number.isFinite(delta) || delta === 0) return
              handleWheelDelta(delta)
              return
            }

            // 2. Free Scrolling Modes (Row/Grid/Scatter): Accumulate and rAF
            
            // Accumulate delta
            scrollAccumulator.current.x += e.deltaX
            scrollAccumulator.current.y += e.deltaY

            // Schedule frame if not already scheduled
            if (rafId.current === null) {
              rafId.current = requestAnimationFrame(() => {
                // Read accumulated values
                const dx = scrollAccumulator.current.x
                const dy = scrollAccumulator.current.y
                
                // Reset accumulator
                scrollAccumulator.current = { x: 0, y: 0 }
                rafId.current = null

                setScrollOffset((prev) => {
                   // Manage scrolling state
                   if (!isScrollingRef.current) {
                        isScrollingRef.current = true
                        setIsScrolling(true)
                   }
                   
                   // Debounce scroll end (simpler logic, just keep extending while rAF is active)
                   if ((window as any).scrollEndTimeout) clearTimeout((window as any).scrollEndTimeout)
                   ;(window as any).scrollEndTimeout = setTimeout(() => {
                        isScrollingRef.current = false
                        setIsScrolling(false)
                   }, 150)

                   // Calculate effective delta based on mode
                   let delta = 0
                   if (effectiveMode === 'row') {
                     delta = dx
                     // Convenience: Map vertical wheel to horizontal if dominant
                     if (Math.abs(dy) > Math.abs(dx)) {
                        delta = dy
                     }
                   } else {
                     delta = dy
                   }

                   const newScroll = prev + delta
                   const clampedScroll = Math.max(scrollBounds.min, Math.min(scrollBounds.max, newScroll))

                   // Persist (debounced inside the hook)
                   persistScrollOffset(clampedScroll)

                   return clampedScroll
                })
              })
            }
          }
        : undefined,
  })

  

  // Source key for detecting source changes (channel slug or author id)
  const sourceKey =
    source.kind === 'channel' ? `channel-${source.slug}` : `author-${source.id}`
  const prevSourceKeyRef = useRef<string>(sourceKey)

  // Sync items from layoutItems synchronously during render (not via effect)
  // This avoids the "one render behind" problem
  const prevItemsRef = useRef(layoutItems)
  if (prevItemsRef.current !== layoutItems) {
    prevItemsRef.current = layoutItems
    setItems(layoutItems)
  }

  // Reset scroll/focus only when the source itself changes
  useEffect(() => {
    if (prevSourceKeyRef.current === sourceKey) return
    prevSourceKeyRef.current = sourceKey

    setScrollOffset(initialScrollOffset ?? 0)
    onFocusPersist?.(initialFocusedCardId ?? null)

    if (scrollDebounceRef.current) {
      clearTimeout(scrollDebounceRef.current)
      scrollDebounceRef.current = null
    }
    pendingScrollRef.current = null
  }, [sourceKey, initialScrollOffset, initialFocusedCardId, onFocusPersist])

  // Author View: bypass card layouts and render dedicated profile + channel list
  if (isAuthorView) {
    return <AuthorView w={w} h={h} author={authorMetadata} source={source} shapeId={shapeId} />
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, scale: SOURCE_TRANSITION.scale }}
        animate={{ 
          opacity: 1, 
          scale: effectiveMode === 'mini' ? 0.70 : 1,
          rotateX: effectiveMode === 'mini' ? 30 : 0,
          rotateZ: effectiveMode === 'mini' ? 6 : 0,
          transformPerspective: 200
        }}
        exit={{ opacity: 0, scale: SOURCE_TRANSITION.scale }}
        transition={{ duration: SOURCE_TRANSITION.duration, ease: SOURCE_TRANSITION.ease }}
        style={{
          width: w,
          height: h,
          position: 'relative',
          overflow: 'visible',
          background: 'transparent',
          borderRadius: 'inherit',
          // boxShadow: SHAPE_SHADOW,
          transformOrigin: effectiveMode === 'mini' ? 'center center' : undefined,
          touchAction: 'none'
        }}
      >
      {/* Cards are now direct children, positioned absolutely in the viewport space */}
      {displayItems.map((item, idx) => {
        // Only render cards in render set
        if (!renderIds.has(item.id)) return null

        // Cards in active set get spring animations, others render instantly
        const isActive = activeIds.has(item.id)
        const isDragging = dragState?.id === item.id
        const isGhost = dragInState.active && item.id === dragInState.previewCard?.id

        const baseLayout = layoutMap.get(item.id)
        let layout = baseLayout

        const initialLayout = droppedLayouts.current.get(item.id)

        if (isDragging && dragState && layout) {
            layout = {
                ...layout,
                x: dragState.x,
                y: dragState.y,
                zIndex: 9999 // Float above
            }
        }

        // Ghost card styling: transparent (invisible)
        const styleOverride = isGhost ? { opacity: 0, pointerEvents: 'none' } as any : undefined

        // In stack / mini modes, only render cards that are in the active set
        if ((effectiveMode === 'stack' || effectiveMode === 'mini') && !isActive) return null

        const focusState = isFocusMode ? (focusedJazzId === item.id ? 'card' : 'deck') : undefined

        return (
          <TactileCard
            key={item.id}
            blockId={item.id}
            index={idx}
            layout={layout}
            initialLayout={initialLayout}
            focusState={focusState}
            ownerId={shapeId}
            // If dragging, disable springs (immediate)
            springConfig={isActive && !isDragging ? springConfig : undefined}
            // Scroll should stay pixel-perfect even during morphs
            immediate={isScrollingRef.current || isDragging}     
            onCardClick={handleCardClick}
            onReorderStart={handleReorderStart}
            onReorderDrag={handleReorderDrag}
            onReorderEnd={handleReorderEnd}
            // Disable interaction in folded modes
            interactionEnabled={!(effectiveMode === 'mini' || effectiveMode === 'tab' || effectiveMode === 'vtab')}
            debug
            style={styleOverride}
          />
        )
      })}

      {showScrubber && source.kind === 'channel' && (
        <>
          <div
            style={zoneStyle}
            onMouseEnter={handleZoneEnter}
            onMouseLeave={handleZoneLeave}
          />

          <div
            style={scrubberStyle}
            onMouseEnter={handleZoneEnter}
            onMouseLeave={handleZoneLeave}
          >
            <Scrubber
              count={CARD_COUNT}
              index={stackIndex}
              onChange={handleScrubberChange}
              width={scrubberWidth}
              forceSimple={scrubberWidth < 180}
              onScrubStart={visibilityScrubStart}
              onScrubEnd={visibilityScrubEnd}
            />
          </div>
        </>
      )}

      {/* Debug Info - stays fixed in viewport */}
      {(false) && (
        <div
          style={{
            position: 'absolute',
            bottom: -96,
            left: 4,
            right: 4,
            fontSize: 10,
            background: 'rgba(0,0,0,0.6)',
            color: 'white',
            padding: '4px 6px',
            borderRadius: 4,
              pointerEvents: 'auto',
              zIndex: 9999,
              display: 'flex',
              flexDirection: 'column',
              gap: 2
            }}
          >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 9, opacity: 0.7 }}>
              {effectiveMode} {isFocusMode ? '(focused)' : ''} • scroll:{Math.round(scrollOffset)}/{Math.round(scrollBounds.max)}px • render:
              {renderIds.size} active:{activeIds.size}
            </span>
            <button
              onClick={() => setSelectedPresetIndex((selectedPresetIndex + 1) % PRESET_KEYS.length)}
              style={{
                padding: '2px 8px',
                fontSize: 9,
                borderRadius: 3,
                border: '1px solid rgba(255,255,255,0.3)',
                background: 'rgba(255,255,255,0.15)',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 500
              }}
            >
              {selectedPreset}
            </button>
          </div>

          {effectiveMode === 'row' && (
            <span style={{ fontSize: 8, opacity: 0.5 }}>
              content:{Math.round(contentSize.width)}×{Math.round(contentSize.height)}px
            </span>
          )}
        </div>
      )}

      </motion.div>
    </AnimatePresence>
  )
})
