// Design tokens and constants
export const DESIGN_TOKENS = {
  borderRadius: {
    small: 2,
    medium: 4,
    large: 8,
    round: 9999,
  },
  shadows: {
    card: '0 6px 18px rgba(0,0,0,.08)',
    elevated: '0 10px 25px rgba(0,0,0,.15)',
  },
  colors: {
    border: 'rgba(0,0,0,.08)',
    background: '#fff',
  },
} as const

// Convenience exports
export const CARD_BORDER_RADIUS = DESIGN_TOKENS.borderRadius.medium
export const CARD_SHADOW = DESIGN_TOKENS.shadows.card
