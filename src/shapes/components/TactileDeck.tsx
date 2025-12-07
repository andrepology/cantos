import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type React from 'react'
import type { Card } from '../../arena/types'
import { useTactileLayout, getScrollBounds } from '../../arena/hooks/useTactileLayout'
import type { LayoutMode, CardLayout } from '../../arena/hooks/useTactileLayout'
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
import { SPRING_PRESETS, PRESET_KEYS, STACK_CARD_STRIDE } from '../../arena/tactileUtils'
import { useCardReorder } from '../../arena/hooks/useCardReorder'
import { useDeckDragIn } from '../../arena/hooks/useDeckDragIn'
import { useCardRendering } from '../../arena/hooks/useCardRendering'
import { useEditor, type TLShapeId } from 'tldraw'
// import { TactileDeckPerfPanel } from '../../arena/components/TactileDeckPerfPanel' // Unused for now to save space
import type { PortalSource } from './PortalAddressBar'
import type { CardAuthorBio, CardAuthorChannels } from '../../arena/types'
import { AuthorProfileCard, AuthorChannelsCard } from './AuthorCards'

const SOURCE_TRANSITION = {
  duration: 0.18,
  ease: 'easeOut' as const,
  scale: 0.985,
}

const isAuthorBio = (card: Card): card is CardAuthorBio => card.type === 'author-bio'
const isAuthorChannels = (card: Card): card is CardAuthorChannels => card.type === 'author-channels'

const CARD_RENDERERS: Partial<Record<Card['type'], (card: Card, layout: CardLayout) => React.ReactNode>> = {
  'author-bio': (card, layout) =>
    isAuthorBio(card) ? <AuthorProfileCard card={card} width={layout.width} height={layout.height} /> : null,
  'author-channels': (card, layout) =>
    isAuthorChannels(card) ? <AuthorChannelsCard card={card} width={layout.width} height={layout.height} /> : null,
}

interface TactileDeckProps {
  w: number
  h: number
  mode: LayoutMode
  source: PortalSource
  cards: Card[]
  shapeId?: TLShapeId
  initialScrollOffset?: number
  initialFocusedCardId?: number
  onFocusChange?: (block: { id: number; title: string } | null) => void
  onFocusPersist?: (id: number | null) => void
}

export function TactileDeck({
  w,
  h,
  mode,
  source,
  cards,
  shapeId,
  initialScrollOffset = 0,
  initialFocusedCardId,
  onFocusChange,
  onFocusPersist,
}: TactileDeckProps) {
  // Perf: track renders
  recordDeckRender()

  const editor = useEditor()

  const [items, setItems] = useState<Card[]>(cards)
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
  
  // Focus Mode State
  const [focusTargetId, setFocusTargetId] = useState<number | null>(initialFocusedCardId || null)
  const isFocusMode = focusTargetId !== null
  
  // Effective Mode: override if focused
  const effectiveMode = isFocusMode ? 'stack' : mode
  const isStackLikeMode = effectiveMode === 'stack' || effectiveMode === 'mini'
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
        if (focusedCard && focusedCard.id !== focusTargetId) {
          setFocusTargetId(focusedCard.id)
          onFocusPersist?.(focusedCard.id)
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
    (id: number) => {
      const index = items.findIndex((c) => c.id === id)
      if (index === -1) return

      if (effectiveMode === 'stack') {
        goToIndex(index)
        setFocusTargetId(id)
        onFocusPersist?.(id)
        setIsAnimating(true)
        if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current)
        animationTimeoutRef.current = setTimeout(() => setIsAnimating(false), 100)
        return
      }

      setFocusTargetId(id)
      onFocusPersist?.(id)
      const newOffset = index * STACK_CARD_STRIDE
      setScrollOffset(newOffset)
      persistScrollOffset(newOffset)
      setIsAnimating(true)
      if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current)
      animationTimeoutRef.current = setTimeout(() => setIsAnimating(false), 100)
    },
    [effectiveMode, goToIndex, setFocusTargetId, items]
  )

  // Layout Calculation - Base layout for hit testing
  const baseLayoutResult = useTactileLayout({
    mode: effectiveMode,
    containerW: w,
    containerH: h,
    scrollOffset,
    items: items,
    isFocusMode
  })

  // Track initial layouts for dropped items
  const droppedLayouts = useRef<Map<number, Partial<CardLayout>>>(new Map())

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
      isFocusMode
    })
  }, [baseLayoutResult, dragInState.active, effectiveMode, w, h, scrollOffset, displayItems, isFocusMode])
  
  const { layoutMap, contentSize } = finalLayoutResult

  // Reorder Logic - Operates on REAL items
  // When dragging internally, dragInState is false, so layoutMap matches items
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
      items: displayItems,
      layoutMap,
      scrollOffset,
      containerW: w,
      containerH: h,
      mode: effectiveMode
  })


  // Scroll bounds per mode
  const scrollBounds = useMemo(() => {
    const t0 = performance.now()
    const result = getScrollBounds(effectiveMode, contentSize, w, h, displayItems.length)
    const t1 = performance.now()
    recordScrollBoundsTiming(t1 - t0)
    return result
  }, [effectiveMode, contentSize, w, h, displayItems.length])



  useEffect(() => {
    if (focusTargetId == null) {
      onFocusChange?.(null)
      return
    }
    const focused = items.find((card) => card.id === focusTargetId)
    onFocusChange?.(
      focused ? { id: focusTargetId, title: (focused as any).title ?? `Card ${focusTargetId}` } : null
    )
  }, [focusTargetId, items, onFocusChange])

  const handleBack = () => {
    setFocusTargetId(null)
    onFocusPersist?.(null)
  }

  const { pressScale: backButtonPressScale, bind: backButtonPressBind } = usePressFeedback({
    scale: 0.9,
    hoverScale: 1.08
  })

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
    onWheel: effectiveMode !== 'mini' ? handleNativeWheel : undefined,
  })

  // Reset items and scroll when the source changes
  useEffect(() => {
    setItems(cards)
    setScrollOffset(initialScrollOffset ?? 0)
    setFocusTargetId(initialFocusedCardId ?? null)
    if (scrollDebounceRef.current) {
      clearTimeout(scrollDebounceRef.current)
      scrollDebounceRef.current = null
    }
    pendingScrollRef.current = null
  }, [cards, source, initialFocusedCardId, initialScrollOffset])

  const sourceKey =
    source.kind === 'channel' ? `channel-${source.slug}` : `author-${source.id}`

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={sourceKey}
        ref={containerRef}
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.985 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
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
      {displayItems.map(card => {
        // Only render cards in render set
        if (!renderIds.has(card.id)) return null

        // Cards in active set get spring animations, others render instantly
        const isActive = activeIds.has(card.id)

        const baseLayout = layoutMap.get(card.id)
        let layout = baseLayout

        const isDragging = dragState?.id === card.id
        
        // Ghost card style override
        const isGhost = dragInState.active && card.id === dragInState.previewCard?.id

        const initialLayout = droppedLayouts.current.get(card.id)

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

        let renderContent: ((card: Card, layout: CardLayout) => React.ReactNode) | undefined
        if (card.type === 'author-bio') {
          renderContent = (c, l) => (
            <AuthorProfileCard card={c as CardAuthorBio} width={l.width} height={l.height} />
          )
        } else if (card.type === 'author-channels') {
          renderContent = (c, l) => (
            <AuthorChannelsCard card={c as CardAuthorChannels} width={l.width} height={l.height} />
          )
        }

        return (
          <TactileCard
            key={card.id}
            card={card}
            index={card.id}
            layout={layout}
            initialLayout={initialLayout}
            // If dragging, disable springs (immediate)
            springConfig={isActive && !isDragging ? springConfig : undefined}
            immediate={(isScrollingRef.current && !isAnimating) || isDragging}
            containerWidth={w}
            renderContent={renderContent}
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
            style={styleOverride}
          />
        )
      })}

      {showScrubber && (
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

      {/* Back Button (Focus Mode Only) */}
      {isFocusMode && (
          <motion.div
            style={{
              position: 'absolute',
              top: 2,
              left: 4,
              zIndex: 10000,
              padding: 6,
              pointerEvents: 'auto',
              scale: backButtonPressScale,
            }}
            onClick={(e) => {
                e.stopPropagation()
                handleBack()
            }}
            {...backButtonPressBind}
            data-interactive="true"
          >
            <button
              
              style={{
                padding: '4px 10px',
                borderRadius: 20,
                border: 'none',
                background: 'rgba(0,0,0,0.03)',
                color: '#bbb',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                pointerEvents: 'none',
              }}
            >
              back
            </button>
          </motion.div>
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

      </motion.div>
    </AnimatePresence>
  )
}
