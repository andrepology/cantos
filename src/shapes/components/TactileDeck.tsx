import { useEffect, useMemo, useRef, useState } from 'react'
import type { Card } from '../../arena/types'
import { useTactileLayout } from '../../arena/hooks/useTactileLayout'
import type { LayoutMode, CardLayout } from '../../arena/hooks/useTactileLayout'
import { TactileCard } from './TactileCard'
import type { SpringConfig } from './TactileCard'
import { useWheelPreventDefault } from '../../hooks/useWheelPreventDefault'

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

// Helper: Get scroll transform based on mode
function getScrollTransform(mode: LayoutMode, scrollOffset: number): string {
  switch (mode) {
    case 'row':
      return `translate3d(${-scrollOffset}px, 0, 0)`
    case 'column':
    case 'grid':
      return `translate3d(0, ${-scrollOffset}px, 0)`
    case 'stack':
      return 'none'
  }
}

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
    
    switch (mode) {
      case 'row': {
        const viewportLeft = scrollOffset - OVERSCAN
        const viewportRight = scrollOffset + containerW + OVERSCAN
        isVisible = layout.x + layout.width > viewportLeft && layout.x < viewportRight
        break
      }
      
      case 'column':
      case 'grid': {
        const viewportTop = scrollOffset - OVERSCAN
        const viewportBottom = scrollOffset + containerH + OVERSCAN
        isVisible = layout.y + layout.height > viewportTop && layout.y < viewportBottom
        break
      }
      
      case 'stack': {
        // Stack: Only render cards with reasonable depth (-1 to 6)
        // Calculate depth from scroll (50px per card)
        const effectiveScrollIndex = scrollOffset / 50
        const depth = i - effectiveScrollIndex
        isVisible = depth >= -1 && depth <= 6
        break
      }
    }
    
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
  const contentRef = useRef<HTMLDivElement>(null)
  
  const selectedPreset = PRESET_KEYS[selectedPresetIndex]
  const springConfig = SPRING_PRESETS[selectedPreset]

  // Layout Calculation - only Stack mode uses scrollOffset
  const { layoutMap, contentSize } = useTactileLayout({
    mode,
    containerW: w,
    containerH: h,
    scrollOffset: mode === 'stack' ? scrollOffset : 0,
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
  
  // Reset scroll on mode change (Phase 2: smart scroll transfer)
  useEffect(() => {
    setScrollOffset(0)
  }, [mode])
  
  // Prevent browser back swipe etc
  useWheelPreventDefault(containerRef)

  return (
    <div 
      ref={containerRef}
      style={{
        width: w,
        height: h,
        position: 'relative',
        overflow: 'hidden',
        background: '#f4f4f4',
        borderRadius: 'inherit',
        touchAction: 'none'
      }}
    >
      {/* Content Layer - transforms for Row/Col/Grid viewport scrolling */}
      <div
        ref={contentRef}
        style={{
          position: 'absolute',
          width: `${contentSize.width}px`,
          height: `${contentSize.height}px`,
          transform: getScrollTransform(mode, scrollOffset),
          transformOrigin: 'top left',
          willChange: 'transform',
          pointerEvents: 'none' // Allow clicks to pass through to cards
        }}
      >
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
              debug
            />
          )
        })}
      </div>
      
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
