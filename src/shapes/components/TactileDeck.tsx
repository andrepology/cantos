import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { Card } from '../../arena/types'
import { useTactileLayout, getScrollBounds } from '../../arena/hooks/useTactileLayout'
import type { LayoutMode, CardLayout } from '../../arena/hooks/useTactileLayout'
import { TactileCard } from './TactileCard'
import { useWheelControl } from '../../hooks/useWheelControl'
import { useScrollRestoration } from '../../arena/hooks/useScrollRestoration'
import { useTactileInteraction } from '../../arena/hooks/useTactileInteraction'
import { Scrubber } from '../../arena/Scrubber'
import { useStackNavigation, useScrubberVisibility } from '../hooks/useStackNavigation'
import {
  recordDeckRender,
  recordLayoutTiming,
  recordScrollBoundsTiming,
  setLastMorphDuration,
} from '../../arena/tactilePerf'
import { SPRING_PRESETS, PRESET_KEYS, INITIAL_CARDS, STACK_CARD_STRIDE } from '../../arena/tactileUtils'
import { useCardReorder } from '../../arena/hooks/useCardReorder'
import { useCardRendering } from '../../arena/hooks/useCardRendering'
import { useEditor, type TLShapeId } from 'tldraw'
// import { TactileDeckPerfPanel } from '../../arena/components/TactileDeckPerfPanel' // Unused for now to save space

interface TactileDeckProps {
  w: number
  h: number
  mode: LayoutMode
  shapeId?: TLShapeId
  initialScrollOffset?: number
}

export function TactileDeck({ w, h, mode, shapeId, initialScrollOffset = 0 }: TactileDeckProps) {
  // Perf: track renders
  recordDeckRender()

  const editor = useEditor()

  const [items, setItems] = useState<Card[]>(INITIAL_CARDS)
  const [scrollOffset, setScrollOffset] = useState(initialScrollOffset)
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
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

  // Debounced scroll persistence - only update shape props when scrolling stops
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
  
  // Focus Mode State
  const [focusTargetId, setFocusTargetId] = useState<number | null>(null)
  const isFocusMode = focusTargetId !== null
  
  // Effective Mode: override if focused
  const effectiveMode = isFocusMode ? 'stack' : mode
  const isStackLikeMode = effectiveMode === 'stack' || effectiveMode === 'mini'
  const CARD_COUNT = items.length
  
  const rawScrubberWidth = Math.min(Math.max(0, w - 48), 400)
  const scrubberWidth = rawScrubberWidth >= 50 ? rawScrubberWidth : 0
  const showScrubber = isStackLikeMode && CARD_COUNT > 1 && scrubberWidth > 0

  const handleStackScrollChange = useCallback(
    (offset: number) => {
      if (isScrollingRef.current) {
          isScrollingRef.current = false
          setIsScrolling(false)
      }
      setScrollOffset(offset)
      persistScrollOffset(offset)
    },
    [setScrollOffset, persistScrollOffset]
  )

  const { stackIndex, goToIndex, handleWheelDelta, resetWheel } = useStackNavigation({
    cardCount: CARD_COUNT,
    stride: STACK_CARD_STRIDE,
    scrollOffset,
    isActive: isStackLikeMode,
    onScrollChange: handleStackScrollChange,
  })

  const {
    isVisible: isScrubberVisible,
    handleZoneEnter,
    handleZoneLeave,
    handleScrubStart: visibilityScrubStart,
    handleScrubEnd: visibilityScrubEnd,
    forceHide: forceHideScrubber,
  } = useScrubberVisibility({ isActive: isStackLikeMode })

  const handleScrubStart = useCallback(() => {
    visibilityScrubStart()
  }, [visibilityScrubStart])

  const handleScrubEnd = useCallback(() => {
    visibilityScrubEnd()
  }, [visibilityScrubEnd])

  useEffect(() => {
    if (!isStackLikeMode) {
      resetWheel()
      forceHideScrubber()
    }
  }, [forceHideScrubber, isStackLikeMode, resetWheel])

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
    (id: number) => {
      const index = items.findIndex((c) => c.id === id)
      if (index === -1) return

      if (effectiveMode === 'stack' || effectiveMode === 'mini') {
        goToIndex(index)
        if (!isFocusMode) {
          setFocusTargetId(id)
        }
        setIsAnimating(true)
        if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current)
        animationTimeoutRef.current = setTimeout(() => setIsAnimating(false), 100)
        return
      }

      setFocusTargetId(id)
      const newOffset = index * STACK_CARD_STRIDE
      setScrollOffset(newOffset)
      persistScrollOffset(newOffset)
      setIsAnimating(true)
      if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current)
      animationTimeoutRef.current = setTimeout(() => setIsAnimating(false), 100)
    },
    [effectiveMode, goToIndex, isFocusMode, setFocusTargetId, items]
  )

  // Layout Calculation - Need this available for reorder logic
  const layoutResult = (() => {
    const t0 = performance.now()
    const result = useTactileLayout({
      mode: effectiveMode,
      containerW: w,
      containerH: h,
      scrollOffset,
      items: items,
      isFocusMode
    })
    const t1 = performance.now()
    recordLayoutTiming(t1 - t0)
    return result
  })()
  
  const { layoutMap, contentSize } = layoutResult

  // Reorder Logic
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

  const handleScrubberChange = useCallback(
    (nextIndex: number) => {
      goToIndex(nextIndex)
    },
    [goToIndex]
  )
  
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
      // Mode changed! 
      
      // Determine if we should use restoration or explicit target
      let newScroll = 0
      
      if (isFocusMode && !prevEffectiveMode.startsWith('stack')) {
          // Entering Focus Mode
          newScroll = scrollOffset
          
          // Safety check: if scrollOffset is 0 (maybe we didn't set it?), try to find target
          if (scrollOffset === 0 && focusTargetId !== null) {
             const index = items.findIndex(c => c.id === focusTargetId)
             if (index !== -1) newScroll = index * STACK_CARD_STRIDE
          }
      } else {
          // Exiting Focus Mode OR Prop Mode Change
          const { nextScrollOffset } = restoration.getTransitionData(effectiveMode)
          newScroll = nextScrollOffset
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
      items,
      layoutMap,
      scrollOffset,
      containerW: w,
      containerH: h,
      mode: effectiveMode
  })


  // Scroll bounds per mode
  const scrollBounds = useMemo(() => {
    const t0 = performance.now()
    const result = getScrollBounds(effectiveMode, contentSize, w, h, items.length)
    const t1 = performance.now()
    recordScrollBoundsTiming(t1 - t0)
    return result
  }, [effectiveMode, contentSize, w, h, items.length])

  const handleBack = () => {
      setFocusTargetId(null)
  }

  const handleNativeWheel = useCallback(
    (e: WheelEvent) => {
      if (e.ctrlKey) return

      e.stopPropagation()
      if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation()
      }

      if (isStackLikeMode) {
        const stage = Math.max(w, h, 240)
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? stage : 1
        const delta = -e.deltaY * unit
        if (!Number.isFinite(delta) || delta === 0) return
        handleWheelDelta(delta)
        return
      }

      setScrollOffset((prev) => {
        if (!isScrollingRef.current) {
             isScrollingRef.current = true
             setIsScrolling(true)
        }

        // Clear existing timeout to detect scroll stop
        if ((window as any).scrollEndTimeout) clearTimeout((window as any).scrollEndTimeout)
        ;(window as any).scrollEndTimeout = setTimeout(() => {
             isScrollingRef.current = false
             setIsScrolling(false)
        }, 150)

        let delta = 0
        if (effectiveMode === 'row') {
          delta = e.deltaX
        } else {
          delta = e.deltaY
        }
        const newScroll = prev + delta
        const clampedScroll = Math.max(scrollBounds.min, Math.min(scrollBounds.max, newScroll))

        // Persist scroll position when scrolling stops (debounced)
        persistScrollOffset(clampedScroll)

        return clampedScroll
      })
    },
    [effectiveMode, handleWheelDelta, h, isStackLikeMode, scrollBounds, w]
  )

  useWheelControl(containerRef, {
    capture: true,
    passive: false,
    onWheel: handleNativeWheel,
  })

  

  return (
    <div
      ref={containerRef}
      style={{
        width: w,
        height: h,
        position: 'relative',
        overflow: 'visible',
        background: 'transparent',
        borderRadius: 'inherit',
        // boxShadow: SHAPE_SHADOW,
        transform:
          effectiveMode === 'mini'
            ? 'perspective(200px) rotateX(30deg) rotateZ(6deg) scale(0.40)'
            : undefined,
        transformOrigin: effectiveMode === 'mini' ? 'center center' : undefined,
        transition: 'transform 220ms ease-out',
        touchAction: 'none'
      }}
    >
      {/* Cards are now direct children, positioned absolutely in the viewport space */}
      {items.map(card => {
        // Only render cards in render set
        if (!renderIds.has(card.id)) return null

        // Cards in active set get spring animations, others render instantly
        const isActive = activeIds.has(card.id)

        const baseLayout = layoutMap.get(card.id)
        let layout = baseLayout

        // Handle Drag Overrides
        const isDragging = dragState?.id === card.id
        if (isDragging && dragState && layout) {
            layout = {
                ...layout,
                x: dragState.x,
                y: dragState.y,
                zIndex: 9999 // Float above
            }
        }

        // In stack / mini modes, only render cards that are in the active set
        if ((effectiveMode === 'stack' || effectiveMode === 'mini') && !isActive) return null

        return (
          <TactileCard
            key={card.id}
            card={card}
            index={card.id}
            layout={layout}
            // If dragging, disable springs (immediate)
            springConfig={isActive && !isDragging ? springConfig : undefined}
            immediate={(isScrollingRef.current && !isAnimating) || isDragging} 
            // Use the bind function from our new hook (disabled in folded modes)
            {...(effectiveMode === 'mini' || effectiveMode === 'tab' || effectiveMode === 'vtab'
              ? {}
              : interaction.bind(
                  card,
                  (() => {
                    const l = layoutMap.get(card.id)
                    return l ? { w: l.width, h: l.height } : { w: 100, h: 100 }
                  })()
                ))}
            debug
          />
        )
      })}

      {showScrubber && (
        <>
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '30%',
              pointerEvents: 'auto',
              background: 'transparent',
              zIndex: 4000,
            }}
            onMouseEnter={handleZoneEnter}
            onMouseLeave={handleZoneLeave}
          />

          <div
            style={{
              position: 'absolute',
              bottom: 12,
              left: '50%',
              transform: `translate(-50%, ${isScrubberVisible ? '0px' : '24px'})`,
              opacity: isScrubberVisible ? 1 : 0,
              pointerEvents: isScrubberVisible ? 'auto' : 'none',
              transition: 'opacity 160ms ease, transform 220ms ease',
              width: scrubberWidth,
              zIndex: 4001,
            }}
            onMouseEnter={handleZoneEnter}
            onMouseLeave={handleZoneLeave}
          >
            <Scrubber
              count={CARD_COUNT}
              index={stackIndex}
              onChange={handleScrubberChange}
              width={scrubberWidth}
              forceSimple={scrubberWidth < 220}
              onScrubStart={handleScrubStart}
              onScrubEnd={handleScrubEnd}
            />
          </div>
        </>
      )}

      {/* Back Button (Focus Mode Only) */}
      {isFocusMode && (
          <button
            onClick={(e) => {
                e.stopPropagation()
                handleBack()
            }}
            onPointerDown={(e) => e.stopPropagation()}
            data-interactive="true"
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              zIndex: 9999,
              padding: '4px 10px',
              borderRadius: 20,
              border: 'none',
              background: 'rgba(0,0,0,0.03)',
              color: '#bbb',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              // boxShadow: '0 2px 2px rgba(0,0,0,0.04)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              pointerEvents: 'auto' // ensure it's clickable
            }}
          >
            <span>back</span>
          </button>
      )}

      {/* Debug Info - stays fixed in viewport */}
      {(effectiveMode !== 'mini' && effectiveMode !== 'tab' && effectiveMode !== 'vtab') || false && (
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
          {/* <TactileDeckPerfPanel /> */}

          {effectiveMode === 'row' && (
            <span style={{ fontSize: 8, opacity: 0.5 }}>
              content:{Math.round(contentSize.width)}×{Math.round(contentSize.height)}px
            </span>
          )}
        </div>
      )}

    </div>
  )
}
