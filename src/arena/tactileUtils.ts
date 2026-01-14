import type { SpringConfig } from '../shapes/components/TactileCard'
import { STACK_SCROLL_STRIDE } from './hooks/useTactileLayout'

// Spring physics presets
export const SPRING_PRESETS: Record<string, SpringConfig> = {
  'Tactile': {
    stiffness: 180,
    damping: 28,
    mass: 1.5
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

export const STACK_CARD_STRIDE = STACK_SCROLL_STRIDE

