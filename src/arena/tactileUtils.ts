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

// Sample users for testing chat metadata
const SAMPLE_USERS = [
  { id: 1, full_name: 'Alice Chen', username: 'alice', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice' },
  { id: 2, full_name: 'Bob Smith', username: 'bob', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob' },
  { id: 3, full_name: 'Carol Wong', username: 'carol', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=carol' },
  { id: 4, full_name: 'David Kim', username: 'david', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=david' },
  { id: 5, full_name: 'Emma Johnson', username: 'emma', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=emma' },
]

export const INITIAL_CARDS: Card[] = Array.from({ length: 25 }).map((_, i) => {
  const aspect = 0.6 + deterministicRandom(i) * 1.4 // 0.6 - 2.0

  // Add user metadata to cards 5-24 (skip first 5 so we can test both with/without metadata)
  const hasUser = i >= 5
  const user = hasUser ? SAMPLE_USERS[(i - 5) % SAMPLE_USERS.length] : undefined

  // Spread dates over the last year for testing date formatting
  const daysAgo = (i - 5) * 7 // Every card 7 days apart, starting from 5 weeks ago
  const createdAt = hasUser ? new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString() : new Date().toISOString()

  return {
    id: i,
    title: `Block ${i}`,
    createdAt,
    type: 'text',
    content: `Content for Block ${i}`,
    color: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'][i % 5],
    mockAspect: aspect,
    user, // Add user metadata for testing
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

