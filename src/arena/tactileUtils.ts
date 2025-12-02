import type { SpringConfig } from '../shapes/components/TactileCard'
import type { Card } from './types'
import { STACK_SCROLL_STRIDE } from './hooks/useTactileLayout'

// Spring physics presets
export const SPRING_PRESETS: Record<string, SpringConfig> = {
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

export const PRESET_KEYS = Object.keys(SPRING_PRESETS)

// Generate mock cards
function deterministicRandom(seed: number) {
  const x = Math.sin(seed * 999) * 43758.5453
  return x - Math.floor(x)
}

export const INITIAL_CARDS: Card[] = Array.from({ length: 25 }).map((_, i) => {
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

export const STACK_CARD_STRIDE = STACK_SCROLL_STRIDE

export function getTimingColor(avgMs: number, maxMs: number): string {
  if (avgMs < 0.5 && maxMs < 2) return '#22c55e' // green
  if (avgMs < 1.5 && maxMs < 5) return '#eab308' // amber
  return '#f97373' // red
}

export function getMorphColor(durationMs: number): string {
  if (durationMs < 200) return '#22c55e'
  if (durationMs < 400) return '#eab308'
  return '#f97373'
}

