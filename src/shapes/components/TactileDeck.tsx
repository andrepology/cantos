import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { Card } from '../../arena/types'
import { useTactileLayout, getScrollBounds } from '../../arena/hooks/useTactileLayout'
import type { LayoutMode, CardLayout } from '../../arena/hooks/useTactileLayout'
import { TactileCard } from './TactileCard'
import type { SpringConfig } from './TactileCard'
import { useWheelPreventDefault } from '../../hooks/useWheelPreventDefault'
import { useScrollRestoration } from '../../arena/hooks/useScrollRestoration'
import { useTactileInteraction } from '../../arena/hooks/useTactileInteraction'
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
    distanceMultiplier: 0.05, 
    dampingMultiplier: 0.05 
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
const MOCK_CARDS: Card[] = Array.from({ length: 500 }).map((_, i) => ({
  id: i,
  title: `Card ${i}`,
  createdAt: new Date().toISOString(),
  type: 'text',
  content: `Content for card ${i}`,
  color: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'][i % 5]
} as any))

const STACK_CARD_STRIDE = 50 // Keep in sync with stack layout spacing

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
  const STACK_TRAIL = 6 // cards behind the active set to keep visible

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
  
  // Focus Mode State
  const [focusTargetId, setFocusTargetId] = useState<number | null>(null)
  const isFocusMode = focusTargetId !== null
  
  // Effective Mode: override if focused
  const effectiveMode = isFocusMode ? 'stack' : mode

  // State for scroll restoration - tracks EFFECTIVE mode
  const [prevEffectiveMode, setPrevEffectiveMode] = useState(effectiveMode)
  const [prevFocusMode, setPrevFocusMode] = useState(isFocusMode)
  const [prevSize, setPrevSize] = useState({ w, h })
  
  // State to differentiate scroll updates vs mode updates
  // We use a ref to track the "last action type" to avoid extra renders
  const isScrollingRef = useRef(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const animationTimeoutRef = useRef<number | null>(null)
  const morphStartTimeRef = useRef<number | null>(null)
  
  // Focus Mode Handler (Hoist before drag handlers)
  const handleCardClick = useCallback((id: number) => {
    if (effectiveMode === 'stack') {
        const index = MOCK_CARDS.findIndex(c => c.id === id)
        if (index !== -1) {
             setScrollOffset(index * STACK_CARD_STRIDE)
             
             if (!isFocusMode) {
                 setFocusTargetId(id)
             }
             
             // Add animation flag (same as the other branch)
             setIsAnimating(true)
             if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current)
             animationTimeoutRef.current = setTimeout(() => setIsAnimating(false), 100)
        }
        return
    }
    
    const index = MOCK_CARDS.findIndex(c => c.id === id)
    if (index === -1) return

    // 1. Set focus target
    setFocusTargetId(id)
    
    // 2. Explicitly set scroll to target card
    setScrollOffset(index * STACK_CARD_STRIDE)
    
    // 3. Animate
    setIsAnimating(true)
    if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current)
    animationTimeoutRef.current = setTimeout(() => setIsAnimating(false), 100)
  }, [effectiveMode, isFocusMode, setScrollOffset, setFocusTargetId])

  
  // Use new interaction hook
  const interaction = useTactileInteraction({
     onCardClick: handleCardClick
  })
  
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
      // Mode change logic below will run in the RE-RENDER triggered by these updates
      // So we don't need to worry about conflict here.
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

  // Native Wheel Listener (Capture Phase) to prevent Tldraw canvas panning
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return // Allow zoom
      
      e.preventDefault()
      e.stopPropagation()
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation()

      setScrollOffset(prev => {
        // Mark as scrolling action
        isScrollingRef.current = true

        // Row mode: Use deltaX if available (trackpad horizontal scroll), otherwise deltaY (vertical wheel)
        // Column/Grid/Stack: Use deltaY
        let delta = 0
        if (effectiveMode === 'row') {
          delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
        } else {
          delta = e.deltaY
        }
        
        const newScroll = prev + delta
        return Math.max(scrollBounds.min, Math.min(scrollBounds.max, newScroll))
      })
    }

    // Use capture: true to intercept before Tldraw
    el.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => el.removeEventListener('wheel', onWheel, { capture: true } as any)
  }, [scrollBounds, effectiveMode, w, h])
  
  // Prevent browser back swipe etc
  useWheelPreventDefault(containerRef)

  // Cleanup animation timeout on unmount
  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current)
      }
    }
  }, [])

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
