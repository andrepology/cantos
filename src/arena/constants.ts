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
    shape: '0 2px 6px rgba(0,0,0,.03)',
  },
  colors: {
    border: 'rgba(0,0,0,.08)',
    background: '#fff',
    ghostBackground: 'rgba(255, 255, 255, 0.25)',
    surfaceBackground: 'rgba(255, 255, 255, 0.75)',
    portalBackground: 'rgba(255, 255, 255, 0.45)',
    shadow: '0 0 0',
    textSecondary: '#A9AAAA',
    textTertiary: '#CACACA',
  },
} as const

// Convenience exports
export const CARD_BORDER_RADIUS = DESIGN_TOKENS.borderRadius.medium
export const SHAPE_BORDER_RADIUS = DESIGN_TOKENS.borderRadius.large
export const CARD_SHADOW = DESIGN_TOKENS.shadows.card
export const SHAPE_SHADOW = DESIGN_TOKENS.shadows.shape
export const SHAPE_BACKGROUND = DESIGN_TOKENS.colors.surfaceBackground
export const PORTAL_BACKGROUND = DESIGN_TOKENS.colors.portalBackground
export const CARD_BACKGROUND = DESIGN_TOKENS.colors.background
export const GHOST_BACKGROUND = DESIGN_TOKENS.colors.ghostBackground
export const TEXT_SECONDARY = DESIGN_TOKENS.colors.textSecondary
export const TEXT_TERTIARY = DESIGN_TOKENS.colors.textTertiary
export const PROFILE_CIRCLE_BORDER = '1px solid rgba(0,0,0,.1)'
export const PROFILE_CIRCLE_SHADOW = '0 1px 3px rgba(0,0,0,.1)'
