import { useEffect, useMemo, useRef, useState } from 'react'
import type { Card } from '../../arena/types'
import { useTactileLayout } from '../../arena/hooks/useTactileLayout'
import type { LayoutMode } from '../../arena/hooks/useTactileLayout'
import { TactileCard } from './TactileCard'
import { useWheelPreventDefault } from '../../hooks/useWheelPreventDefault'

interface TactileDeckProps {
  w: number
  h: number
  mode: LayoutMode
}

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
  const containerRef = useRef<HTMLDivElement>(null)

  // Layout Calculation
  const { layoutMap, activeSetIds, contentSize } = useTactileLayout({
    mode,
    containerW: w,
    containerH: h,
    scrollOffset,
    items: MOCK_CARDS
  })

  // Wheel Handler
  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation() // Don't zoom canvas
    
    // Simple scroll logic
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
  
  // Prevent browser back swipe etc
  useWheelPreventDefault(containerRef)

  return (
    <div 
      ref={containerRef}
      onWheel={handleWheel}
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
            debug
          />
        )
      })}
      
      {/* Debug Info */}
      <div style={{
        position: 'absolute',
        bottom: 4,
        right: 4,
        fontSize: 10,
        background: 'rgba(0,0,0,0.5)',
        color: 'white',
        padding: '2px 4px',
        borderRadius: 4,
        pointerEvents: 'none',
        zIndex: 9999
      }}>
        Mode: {mode} | Scroll: {Math.round(scrollOffset)} | Active: {activeSetIds.size}
      </div>
    </div>
  )
}

