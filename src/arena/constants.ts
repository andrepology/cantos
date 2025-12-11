// Design tokens and constants
export const DESIGN_TOKENS = {
  borderRadius: {
    small: 2,
    medium: 4,
    large: 8,
    round: 9999,
    roundedSquare: 6,
  },
  shadows: {
    card: '0 6px 12px rgba(0,0,0,.12)',
    elevated: '0 5px 12px rgba(0,0,0,.12)',
    shape: '0 2px 6px rgba(0,0,0,.04)',
    slide: '0 0 32px rgba(0,0,0,.05)',
  },
  colors: {
    border: 'rgba(0,0,0,.08)',
    background: '#fff',
    ghostBackground: 'rgba(255, 255, 255, 0.25)',
    surfaceBackground: 'rgba(255, 255, 255, 0.75)',
    surfaceBackgroundDense: 'rgba(255, 255, 255, 0.9)',
    portalBackground: 'rgba(255, 255, 255, 0.45)',
    shadow: '0 0 0',

    textPrimary: 'rgba(58,58,58,0.74)',
    textSecondary: 'rgba(64, 66, 66, 0.25)',
    textTertiary: '#CACACA',
  },
  blur: {
    subtle: '4px',
    medium: '8px',
    heavy: '64px',
  },
  typography: {
    label: "'Alte Haas Grotesk', system-ui, -apple-system, 'Segoe UI', Roboto, Ubuntu, Cantarell, 'Noto Sans', sans-serif",
  },
} as const

// Convenience exports
export const CARD_BORDER_RADIUS = DESIGN_TOKENS.borderRadius.medium
export const SHAPE_BORDER_RADIUS = DESIGN_TOKENS.borderRadius.large
export const ROUNDED_SQUARE_BORDER_RADIUS = DESIGN_TOKENS.borderRadius.roundedSquare

export const CARD_SHADOW = DESIGN_TOKENS.shadows.card
export const SHAPE_SHADOW = DESIGN_TOKENS.shadows.shape
export const ELEVATED_SHADOW = DESIGN_TOKENS.shadows.elevated
export const SLIDE_SHADOW = DESIGN_TOKENS.shadows.slide


export const SHAPE_BACKGROUND = DESIGN_TOKENS.colors.surfaceBackground
export const PORTAL_BACKGROUND = DESIGN_TOKENS.colors.portalBackground
export const CARD_BACKGROUND = DESIGN_TOKENS.colors.background
export const GHOST_BACKGROUND = DESIGN_TOKENS.colors.ghostBackground

export const TEXT_PRIMARY = DESIGN_TOKENS.colors.textPrimary
export const TEXT_SECONDARY = DESIGN_TOKENS.colors.textSecondary
export const TEXT_TERTIARY = DESIGN_TOKENS.colors.textTertiary
export const BACKDROP_BLUR = DESIGN_TOKENS.blur.heavy
export const LABEL_FONT_FAMILY = DESIGN_TOKENS.typography.label
export const PROFILE_CIRCLE_BORDER = '1px solid rgba(0,0,0,.1)'
export const PROFILE_CIRCLE_SHADOW = '0 1px 3px rgba(0,0,0,.1)'

// Tactile feedback utilities for interactive elements
export type TactileVariant = 'toggle' | 'action' | 'subtle';

export interface TactileScales {
  '--tactile-scale': number;
  '--tactile-scale-hover': number;
  '--tactile-scale-active': number;
  transition: string;
}

/**
 * Returns CSS custom properties for tactile scaling feedback.
 * Use with CSS that applies these properties to transform on hover/active states.
 *
 * @param variant - The type of interaction: toggle (has selected state), action (momentary), subtle (minimal)
 * @param selected - For toggle variant, whether the element is currently selected
 * @returns Object with CSS custom properties and transition
 */
export const getTactileScales = (variant: TactileVariant, selected = false): TactileScales => {
  const ranges = {
    // Toggle buttons: selected state stays smaller, hover/press scale from there
    toggle: selected ? [0.9, 0.95, 0.95] : [1, 1.05, 0.95],    // [base, hover, active]
    // Action buttons: momentary feedback, no persistent selected state
    action: [1, 1.05, 0.95],                                     // [base, hover, active]
    // Subtle elements: minimal scaling for inputs/labels
    subtle: [1, 1.01, 1]                                         // [base, hover, active]
  };

  const [base, hover, active] = ranges[variant];

  return {
    '--tactile-scale': base,
    '--tactile-scale-hover': hover,
    '--tactile-scale-active': active,
    transition: 'transform 0.15s ease'
  };
}

// Component style constants - organized by category for reusability
export const COMPONENT_STYLES = {
  // Button styles
  buttons: {
    // Circular icon buttons (profile, login)
    iconButton: {
      width: 28,
      height: 28,
      borderRadius: DESIGN_TOKENS.borderRadius.round,
      border: `1px solid ${DESIGN_TOKENS.colors.border}`,
      background: DESIGN_TOKENS.colors.surfaceBackground,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 12,
      fontWeight: 600,
      letterSpacing: '-0.02em',
      color: '#000000',
      lineHeight: 1,
      padding: 0,
      boxSizing: 'border-box',
      marginRight: 16,
    } as const,
    // Login button variant with shadow
    iconButtonWithShadow: {
      width: 28,
      height: 28,
      borderRadius: DESIGN_TOKENS.borderRadius.round,
      border: `1px solid ${DESIGN_TOKENS.colors.border}`,
      background: DESIGN_TOKENS.colors.surfaceBackground,
      boxShadow: SHAPE_SHADOW,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '-0.02em',
      color: '#111',
      marginRight: 16,
    } as const,
    // Rectangular text button for login
    textButton: {
      borderRadius: DESIGN_TOKENS.borderRadius.medium,
      border: `1px solid ${DESIGN_TOKENS.colors.border}`,
      background: DESIGN_TOKENS.colors.surfaceBackground,
      boxShadow: SHAPE_SHADOW,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 12,
      fontWeight: 600,
      letterSpacing: '-0.02em',
      color: '#111',
      padding: '4px 8px',
      marginRight: 16,
      whiteSpace: 'nowrap',
    } as const,
  },

  // Input styles
  inputs: {
    search: {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif",
      fontSize: 14,
      fontWeight: 600,
      letterSpacing: '-0.0125em',
      color: '#111',
      border: `1px solid ${DESIGN_TOKENS.colors.border}`,
      borderRadius: DESIGN_TOKENS.borderRadius.large,
      padding: '6px 10px',
      width: 280,
      touchAction: 'none',
      boxShadow: SHAPE_SHADOW,
    } as const,
  },

  // Layout utility styles
  layouts: {
    // Common flex patterns
    flexCenter: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    } as const,
    flexBaselineSpaceBetween: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 8,
    } as const,
    // Grid patterns
    gridGap8: {
      display: 'grid',
      gap: 8,
    } as const,
    // Toolbar layout
    toolbarRow: {
      position: 'relative',
      display: 'grid',
      gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'center',
      width: '100%',
      gap: -2,
    } as const,
    // Tool button wrapper
    toolButtonWrapper: {
      transform: 'scale(1.0)',
      transformOrigin: 'center',
    } as const,
    // Toolbar sections
    toolbarLeft: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 16,
      minWidth: 32,
    } as const,
    toolbarCenter: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    } as const,
    toolbarRight: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 16,
      minWidth: 32,
    } as const,
  },

  // Typography styles
  typography: {
    profileName: {
      fontSize: 12,
      color: '#000000',
      fontWeight: 600,
      letterSpacing: '-0.01em',
    } as const,
    profileLogout: {
      alignSelf: 'start',
      border: 'none',
      background: 'transparent',
      padding: 0,
      fontSize: 12,
      color: TEXT_SECONDARY,
      textDecoration: 'underline',
    } as const,
  },

  // Overlay/popover styles
  overlays: {
    profilePopover: {
      width: 280,
      background: DESIGN_TOKENS.colors.background,
      boxShadow: DESIGN_TOKENS.shadows.card,
      border: `1px solid ${DESIGN_TOKENS.colors.border}`,
      borderRadius: DESIGN_TOKENS.borderRadius.large,
      padding: '8px 12px 0px 12px',
      zIndex: 1000,
    } as const,
    searchPopover: {
      width: 280,
      maxHeight: 260,
      overflow: 'auto',
      background: DESIGN_TOKENS.colors.portalBackground,
      boxShadow: DESIGN_TOKENS.shadows.card,
      border: `1px solid ${DESIGN_TOKENS.colors.border}`,
      borderRadius: DESIGN_TOKENS.borderRadius.large,
      padding: '12px 0',
      touchAction: 'none',
      zIndex: 1000,
    } as const,
  },

  // Avatar and profile components
  avatars: {
    profile: {
      width: 32,
      height: 32,
      borderRadius: DESIGN_TOKENS.borderRadius.small,
      background: DESIGN_TOKENS.colors.ghostBackground,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 14,
      fontWeight: 600,
      color: TEXT_SECONDARY,
      flexShrink: 0,
    } as const,
  },

  // Divider styles
  dividers: {
    horizontal: {
      height: 1,
      background: DESIGN_TOKENS.colors.border,
    } as const,
  },
} as const
