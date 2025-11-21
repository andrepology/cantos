import { useEffect, useMemo, useRef, useState } from 'react'
import type { Card } from '../../arena/types'
import { useTactileLayout } from '../../arena/hooks/useTactileLayout'
import type { LayoutMode } from '../../arena/hooks/useTactileLayout'
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

export function TactileDeck({ w, h, mode }: TactileDeckProps) {
  const [scrollOffset, setScrollOffset] = useState(0)
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  
  const selectedPreset = PRESET_KEYS[selectedPresetIndex]
  const springConfig = SPRING_PRESETS[selectedPreset]

  // Layout Calculation
  const { layoutMap, activeSetIds, contentSize } = useTactileLayout({
    mode,
    containerW: w,
    containerH: h,
    scrollOffset,
    items: MOCK_CARDS
  })

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
        const maxScroll = Math.max(0, contentSize.height - h + 100) // +100 buffer
        const newScroll = prev + e.deltaY
        
        // Simple bounds clamping (can add rubber banding later)
        // For Stack, we allow negative scroll to "peel"
        if (mode === 'stack') {
            return Math.max(-100, Math.min(newScroll, MOCK_CARDS.length * 50))
        }
        return Math.max(0, Math.min(newScroll, maxScroll))
      })
    }

    // Use capture: true to intercept before Tldraw
    el.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => el.removeEventListener('wheel', onWheel, { capture: true } as any)
  }, [mode, contentSize.height, h])
  
  // Prevent browser back swipe etc
  useWheelPreventDefault(containerRef)

  return (
    <div 
      ref={containerRef}
      style={{
        width: w,
        height: h,
        position: 'relative',
        overflow: 'hidden', // Hide overflow
        background: '#f4f4f4', // Subtle bg to see container bounds
        borderRadius: 'inherit',
        touchAction: 'none'
      }}
    >
      {MOCK_CARDS.map(card => {
        // Only render if in active set or we want to keep DOM nodes (virtualization later)
        // For now, use activeSetIds from hook which filters somewhat
        if (!activeSetIds.has(card.id)) return null
        
        return (
          <TactileCard
            key={card.id}
            card={card}
            index={card.id}
            layout={layoutMap.get(card.id)}
            springConfig={springConfig}
            debug
          />
        )
      })}
      
      {/* Debug Info */}
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
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <span style={{ fontSize: 9, opacity: 0.7 }}>
          {mode} • {Math.round(scrollOffset)}px • {activeSetIds.size} active
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
    </div>
  )
}
