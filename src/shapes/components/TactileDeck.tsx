import { useEffect, useMemo, useRef, useState } from 'react'
import type { Card } from '../../arena/types'
import { useTactileLayout } from '../../arena/hooks/useTactileLayout'
import type { LayoutMode, CardLayout } from '../../arena/hooks/useTactileLayout'
import { TactileCard } from './TactileCard'
import type { SpringConfig } from './TactileCard'
import { useWheelPreventDefault } from '../../hooks/useWheelPreventDefault'
import { SHAPE_SHADOW } from '../../arena/constants'
import { useScrollRestoration } from '../../arena/hooks/useScrollRestoration'

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
const MOCK_CARDS: Card[] = Array.from({ length: 50 }).map((_, i) => ({
  id: i,
  title: `Card ${i}`,
  createdAt: new Date().toISOString(),
  type: 'text',
  content: `Content for card ${i}`,
  color: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'][i % 5]
} as any))

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
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const layout = layoutMap.get(item.id)
    if (!layout) continue
    
    // Active set: first N cards (for smooth mode transitions)
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

// Helper: Get scroll bounds per mode
function getScrollBounds(
  mode: LayoutMode,
  contentSize: { width: number; height: number },
  containerW: number,
  containerH: number,
  itemCount: number
): { min: number; max: number } {
  switch (mode) {
    case 'row':
      return {
        min: 0,
        max: Math.max(0, contentSize.width - containerW)
      }
    
    case 'column':
    case 'grid':
      return {
        min: 0,
        max: Math.max(0, contentSize.height - containerH)
      }
    
    case 'stack':
      // Allow slight negative (peel up) and scroll through all cards
      return {
        min: -100,
        max: itemCount * 50
      }
  }
}

export function TactileDeck({ w, h, mode }: TactileDeckProps) {
  const [scrollOffset, setScrollOffset] = useState(0)
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  
  // State for scroll restoration
  const [prevMode, setPrevMode] = useState(mode)
  
  // State to differentiate scroll updates vs mode updates
  // We use a ref to track the "last action type" to avoid extra renders
  const isScrollingRef = useRef(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const animationTimeoutRef = useRef<number | null>(null)
  
  const selectedPreset = PRESET_KEYS[selectedPresetIndex]
  const springConfig = SPRING_PRESETS[selectedPreset]

  // Initialize Scroll Restoration Hook
  const restoration = useScrollRestoration(prevMode, scrollOffset, MOCK_CARDS, { w, h })

  // Derived State Update Pattern (Render Loop)
  if (mode !== prevMode) {
      // Mode changed! Calculate restoration immediately
      const { nextScrollOffset } = restoration.getTransitionData(mode)
      
      setScrollOffset(nextScrollOffset)
      setPrevMode(mode)
      // Mode change is NOT a scroll action, it's a morph
      isScrollingRef.current = false
      setIsAnimating(true)
      
      // Clear existing timeout if any
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current)
      }
      // Clear animation flag after morph completes
      animationTimeoutRef.current = setTimeout(() => setIsAnimating(false), 100)
      // Return to trigger re-render with new state
  }

  // Layout Calculation
  const { layoutMap, contentSize } = useTactileLayout({
    mode,
    containerW: w,
    containerH: h,
    scrollOffset,
    items: MOCK_CARDS
  })

  // Calculate renderable and active sets
  const { renderIds, activeIds } = useMemo(
    () => getRenderableCardIds(MOCK_CARDS, layoutMap, scrollOffset, w, h, mode),
    [layoutMap, scrollOffset, w, h, mode]
  )

  // Scroll bounds per mode
  const scrollBounds = useMemo(
    () => getScrollBounds(mode, contentSize, w, h, MOCK_CARDS.length),
    [mode, contentSize, w, h]
  )

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
        if (mode === 'row') {
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
  }, [scrollBounds, mode])
  
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
        overflow: 'hidden',
        background: 'transparent',
        borderRadius: 'inherit',
        boxShadow: SHAPE_SHADOW,
        touchAction: 'none'
      }}
    >
      {/* Cards are now direct children, positioned absolutely in the viewport space */}
      {MOCK_CARDS.map(card => {
        // Only render cards in render set
        if (!renderIds.has(card.id)) return null
        
        // Cards in active set get spring animations, others render instantly
        const isActive = activeIds.has(card.id)
        
        return (
          <TactileCard
            key={card.id}
            card={card}
            index={card.id}
            layout={layoutMap.get(card.id)}
            springConfig={isActive ? springConfig : undefined}
            immediate={isScrollingRef.current && !isAnimating} // Disable immediate during morph
            debug
          />
        )
      })}
      
      {/* Debug Info - stays fixed in viewport */}
      <div 
        style={{
          position: 'absolute',
          bottom: 4,
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
            {mode} • scroll:{Math.round(scrollOffset)}/{Math.round(scrollBounds.max)}px • render:{renderIds.size} active:{activeIds.size}
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
        {mode === 'row' && (
          <span style={{ fontSize: 8, opacity: 0.5 }}>
            content:{Math.round(contentSize.width)}×{Math.round(contentSize.height)}px
          </span>
        )}
      </div>
    </div>
  )
}
