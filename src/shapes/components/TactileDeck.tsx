import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { Card } from '../../arena/types'
import { useTactileLayout, getScrollBounds, STACK_SCROLL_STRIDE } from '../../arena/hooks/useTactileLayout'
import type { LayoutMode, CardLayout } from '../../arena/hooks/useTactileLayout'
import { TactileCard } from './TactileCard'
import type { SpringConfig } from './TactileCard'
import { useWheelControl } from '../../hooks/useWheelControl'
import { useScrollRestoration } from '../../arena/hooks/useScrollRestoration'
import { useTactileInteraction } from '../../arena/hooks/useTactileInteraction'
import { Scrubber } from '../../arena/Scrubber'
import { useStackNavigation, useScrubberVisibility } from '../hooks/useStackNavigation'
import {
  getTactilePerfSnapshot,
  recordCullingTiming,
  recordDeckRender,
  recordLayoutTiming,
  recordScrollBoundsTiming,
  resetTactilePerf,
  setLastMorphDuration,
} from '../../arena/tactilePerf'

interface TactileDeckProps {
  w: number
  h: number
  mode: LayoutMode
}

// Spring physics presets
const SPRING_PRESETS: Record<string, SpringConfig> = {
  'Tactile': { 
    stiffness: 150, 
    damping: 25, 
    mass: 2.0, 
    distanceMultiplier: 0.8, 
    dampingMultiplier: 0.1 
  },
  'Snappy': { 
    stiffness: 400, 
    damping: 30, 
    mass: 0.8 
  },
  'Bouncy': { 
    stiffness: 200, 
    damping: 15, 
    mass: 1.2 
  },
  'Smooth': { 
    stiffness: 260, 
    damping: 35, 
    mass: 1.0 
  },
  'Heavy': { 
    stiffness: 150, 
    damping: 25, 
    mass: 2.0 
  },
}

const PRESET_KEYS = Object.keys(SPRING_PRESETS)



// Generate mock cards
function deterministicRandom(seed: number) {
  const x = Math.sin(seed * 999) * 43758.5453
  return x - Math.floor(x)
}

const MOCK_CARDS: Card[] = Array.from({ length: 500 }).map((_, i) => {
  const aspect = 0.6 + deterministicRandom(i) * 1.4 // 0.6 - 2.0
  return {
    id: i,
    title: `Card ${i}`,
    createdAt: new Date().toISOString(),
    type: 'text',
    content: `Content for card ${i}`,
    color: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'][i % 5],
    mockAspect: aspect,
  } as any
})

const CARD_COUNT = MOCK_CARDS.length

const STACK_CARD_STRIDE = STACK_SCROLL_STRIDE

// Helper: Calculate which cards should render (viewport + active set strategy)
function getRenderableCardIds(
  items: Card[],
  layoutMap: Map<number, CardLayout>,
  scrollOffset: number,
  containerW: number,
  containerH: number,
  mode: LayoutMode
): { renderIds: Set<number>; activeIds: Set<number> } {
  const renderIds = new Set<number>()
  const activeIds = new Set<number>()
  const OVERSCAN = 200 // px buffer for smooth scroll
  const ACTIVE_SET_SIZE = 8 // First N cards always in active set
  const STACK_PX_PER_CARD = 50
  const STACK_TRAIL = 4 // cards behind the active set to keep visible

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const layout = layoutMap.get(item.id)
    if (!layout) continue
    
    // Stack/mini: limit to active window around scroll position
    if (mode === 'stack' || mode === 'mini') {
      const topIndex = Math.floor(scrollOffset / STACK_PX_PER_CARD)
      const start = Math.max(0, topIndex - STACK_TRAIL)
      const end = Math.min(items.length - 1, topIndex + ACTIVE_SET_SIZE - 1)

      if (i >= start && i <= end) {
        renderIds.add(item.id)
        activeIds.add(item.id)
      }
      continue
    }

    // Active set: first N cards (for smooth mode transitions) in non-stack modes
    const isInActiveSet = i < ACTIVE_SET_SIZE
    
    let isVisible = false
    
    // Viewport culling is now simple: check if layout box intersects viewport box
    // Since layout coordinates are already viewport-relative (scroll subtracted),
    // we just check against 0 and containerW/H
    
    const viewportLeft = -OVERSCAN
    const viewportRight = containerW + OVERSCAN
    const viewportTop = -OVERSCAN
    const viewportBottom = containerH + OVERSCAN
    
    // Simple AABB intersection
    isVisible = 
        layout.x + layout.width > viewportLeft &&
        layout.x < viewportRight &&
        layout.y + layout.height > viewportTop &&
        layout.y < viewportBottom
    
    // Stack mode has opacity culling built-in to layout generation, so this is safe
    
    // Render if visible OR in active set (for mode transitions)
    if (isVisible || isInActiveSet) {
      renderIds.add(item.id)
      
      // Active animation: visible cards OR active set cards
      if (isVisible || isInActiveSet) {
        activeIds.add(item.id)
      }
    }
  }
  
  return { renderIds, activeIds }
}

export function TactileDeck({ w, h, mode }: TactileDeckProps) {
  // Perf: track renders
  recordDeckRender()

  const [scrollOffset, setScrollOffset] = useState(0)
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const isScrollingRef = useRef(false)
  
  // Focus Mode State
  const [focusTargetId, setFocusTargetId] = useState<number | null>(null)
  const isFocusMode = focusTargetId !== null
  
  // Effective Mode: override if focused
  const effectiveMode = isFocusMode ? 'stack' : mode
  const isStackLikeMode = effectiveMode === 'stack' || effectiveMode === 'mini'
  const rawScrubberWidth = Math.min(Math.max(0, w - 48), 400)
  const scrubberWidth = rawScrubberWidth >= 50 ? rawScrubberWidth : 0
  const showScrubber = isStackLikeMode && CARD_COUNT > 1 && scrubberWidth > 0

  const handleStackScrollChange = useCallback(
    (offset: number) => {
      isScrollingRef.current = false
      setScrollOffset(offset)
    },
    [setScrollOffset]
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
  // We use a ref to track the "last action type" to avoid extra renders
  const [isAnimating, setIsAnimating] = useState(false)
  const animationTimeoutRef = useRef<number | null>(null)
  const morphStartTimeRef = useRef<number | null>(null)
  
  // Cleanup animation timeout on unmount
  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current)
      }
    }
  }, [])
  
  // Focus Mode Handler (Hoist before drag handlers)
  const handleCardClick = useCallback(
    (id: number) => {
      const index = MOCK_CARDS.findIndex((c) => c.id === id)
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
      setScrollOffset(index * STACK_CARD_STRIDE)
      setIsAnimating(true)
      if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current)
      animationTimeoutRef.current = setTimeout(() => setIsAnimating(false), 100)
    },
    [effectiveMode, goToIndex, isFocusMode, setFocusTargetId]
  )

  // Use new interaction hook
  const interaction = useTactileInteraction({
     onCardClick: handleCardClick
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
  const restoration = useScrollRestoration(prevEffectiveMode, scrollOffset, MOCK_CARDS, { w, h })

  // Derived State Update Pattern (Render Loop)
  
  // 1. Handle Resize (Priority: preserve anchor)
  if (w !== prevSize.w || h !== prevSize.h) {
      const newScroll = restoration.getResizeScrollOffset(prevSize.w, prevSize.h)
      if (newScroll !== scrollOffset) {
          setScrollOffset(newScroll)
      }
      setPrevSize({ w, h })
  }
  // 2. Handle Mode Change
  else if (effectiveMode !== prevEffectiveMode || isFocusMode !== prevFocusMode) {
      // Mode changed! 
      
      // Determine if we should use restoration or explicit target
      // If entering focus mode (changing TO stack from something else), we usually have a target
      let newScroll = 0
      
      if (isFocusMode && !prevEffectiveMode.startsWith('stack')) {
          // Entring Focus Mode
          // The logic to set scroll to the specific card is done in the click handler
          // BUT we need to make sure we don't overwrite it with 0 or something else here if we didn't set it yet.
          // Actually, if we are here, it means effectiveMode changed.
          // If we set state in click handler, scrollOffset is already set to target.
          // We should KEEP it.
          newScroll = scrollOffset
          
          // Safety check: if scrollOffset is 0 (maybe we didn't set it?), try to find target
          if (scrollOffset === 0 && focusTargetId !== null) {
             const index = MOCK_CARDS.findIndex(c => c.id === focusTargetId)
             if (index !== -1) newScroll = index * STACK_CARD_STRIDE
          }
      } else {
          // Exiting Focus Mode OR Prop Mode Change
          // Use restoration logic
          const { nextScrollOffset } = restoration.getTransitionData(effectiveMode)
          newScroll = nextScrollOffset
      }
      
      if (newScroll !== scrollOffset) {
          setScrollOffset(newScroll)
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

  // Layout Calculation
  const layoutResult = (() => {
    const t0 = performance.now()
    const result = useTactileLayout({
      mode: effectiveMode,
      containerW: w,
      containerH: h,
      scrollOffset,
      items: MOCK_CARDS,
      isFocusMode
    })
    const t1 = performance.now()
    recordLayoutTiming(t1 - t0)
    return result
  })()

  const { layoutMap, contentSize } = layoutResult

  // Calculate renderable and active sets
  const { renderIds, activeIds } = useMemo(() => {
    const t0 = performance.now()
    const result = getRenderableCardIds(MOCK_CARDS, layoutMap, scrollOffset, w, h, effectiveMode)
    const t1 = performance.now()
    recordCullingTiming(t1 - t0)
    return result
  }, [layoutMap, scrollOffset, w, h, effectiveMode])


  // Scroll bounds per mode
  const scrollBounds = useMemo(() => {
    const t0 = performance.now()
    const result = getScrollBounds(effectiveMode, contentSize, w, h, MOCK_CARDS.length)
    const t1 = performance.now()
    recordScrollBoundsTiming(t1 - t0)
    return result
  }, [effectiveMode, contentSize, w, h])

  const handleBack = () => {
      setFocusTargetId(null)
      // Render loop will handle transition back to original mode + restoration
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
        isScrollingRef.current = true
        let delta = 0
        if (effectiveMode === 'row') {
          delta = e.deltaX
        } else {
          delta = e.deltaY
        }
        const newScroll = prev + delta
        return Math.max(scrollBounds.min, Math.min(scrollBounds.max, newScroll))
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
      {MOCK_CARDS.map(card => {
        // Only render cards in render set
        if (!renderIds.has(card.id)) return null

        // Cards in active set get spring animations, others render instantly
        const isActive = activeIds.has(card.id)

        const baseLayout = layoutMap.get(card.id)
        let layout = baseLayout

        // In stack / mini modes, only render cards that are in the active set
        if ((effectiveMode === 'stack' || effectiveMode === 'mini') && !isActive) return null

        return (
          <TactileCard
            key={card.id}
            card={card}
            index={card.id}
            layout={layout}
            springConfig={isActive ? springConfig : undefined}
            immediate={isScrollingRef.current && !isAnimating} // Disable immediate during morph
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

function getTimingColor(avgMs: number, maxMs: number): string {
  if (avgMs < 0.5 && maxMs < 2) return '#22c55e' // green
  if (avgMs < 1.5 && maxMs < 5) return '#eab308' // amber
  return '#f97373' // red
}

function getMorphColor(durationMs: number): string {
  if (durationMs < 200) return '#22c55e'
  if (durationMs < 400) return '#eab308'
  return '#f97373'
}

function TactileDeckPerfPanel() {
  const [perfSnapshot, setPerfSnapshot] = useState(() => getTactilePerfSnapshot())

  useEffect(() => {
    const id = window.setInterval(() => {
      setPerfSnapshot(getTactilePerfSnapshot())
    }, 250)
    return () => {
      window.clearInterval(id)
    }
  }, [])

  const layoutColor = getTimingColor(perfSnapshot.layout.avgMs, perfSnapshot.layout.maxMs)
  const cullColor = getTimingColor(perfSnapshot.culling.avgMs, perfSnapshot.culling.maxMs)
  const scrollColor = getTimingColor(perfSnapshot.scrollBounds.avgMs, perfSnapshot.scrollBounds.maxMs)

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 9, opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          deck {perfSnapshot.deckRenderCount}r{' '}
          {perfSnapshot.cardSamples.length > 0 && (
            <>
              •{' '}
              {perfSnapshot.cardSamples
                .map(
                  (s) =>
                    `c${s.id}:${s.renders}r/${s.layoutChanges}l/${s.handlerChanges}h`
                )
                .join(' • ')}
            </>
          )}
        </span>
        <button
          onClick={() => {
            resetTactilePerf()
            setPerfSnapshot(getTactilePerfSnapshot())
          }}
          style={{
            padding: '2px 6px',
            fontSize: 8,
            borderRadius: 3,
            border: '1px solid rgba(255,255,255,0.3)',
            background: 'rgba(0,0,0,0.3)',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          reset stats
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 8, opacity: 0.85 }}>
        <span>
          layout{' '}
          <span style={{ color: layoutColor }}>
            {perfSnapshot.layout.avgMs.toFixed(2)} / {perfSnapshot.layout.maxMs.toFixed(2)}ms
          </span>
        </span>
        <span>
          cull{' '}
          <span style={{ color: cullColor }}>
            {perfSnapshot.culling.avgMs.toFixed(2)} / {perfSnapshot.culling.maxMs.toFixed(2)}ms
          </span>
        </span>
        <span>
          scroll{' '}
          <span style={{ color: scrollColor }}>
            {perfSnapshot.scrollBounds.avgMs.toFixed(2)} / {perfSnapshot.scrollBounds.maxMs.toFixed(2)}ms
          </span>
        </span>
        {perfSnapshot.lastMorphDurationMs != null && (
          <span>
            morph{' '}
            <span style={{ color: getMorphColor(perfSnapshot.lastMorphDurationMs) }}>
              {Math.round(perfSnapshot.lastMorphDurationMs)}ms
            </span>
          </span>
        )}
      </div>
    </>
  )
}
