import { memo } from 'react'
import { motion } from 'motion/react'
import { DESIGN_TOKENS, SHAPE_SHADOW } from '../../arena/constants'
import { usePressFeedback } from '../../hooks/usePressFeedback'

interface HoverIndicatorProps {
  connectionsCount: number
  position: { x: number; y: number }
  variant?: 'count' | 'close' | 'info'
  interactive?: boolean
  onClick?: (e: React.MouseEvent | React.PointerEvent) => void
  ariaLabel?: string
}

export const HoverIndicator = memo(function HoverIndicator({
  connectionsCount,
  position,
  variant = 'count',
  interactive = false,
  onClick,
  ariaLabel,
}: HoverIndicatorProps) {
  const size = 28
  const fontSize = 10.5
  const iconSize = 13
  const resolvedVariant = variant === 'count' && connectionsCount === 0 ? 'info' : variant
  const pressFeedback = usePressFeedback({
    scale: 0.92,
    hoverScale: 1.04,
    disabled: !interactive,
  })

  return (
    <motion.div
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y - size / 2, // Center vertically around the position
        minWidth: size,
        height: size,
        padding: '0 7px',
        borderRadius: DESIGN_TOKENS.borderRadius.large,
        background: DESIGN_TOKENS.colors.portalBackground,
        color: DESIGN_TOKENS.colors.textPrimary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize,
        fontFamily: DESIGN_TOKENS.typography.label,
        fontWeight: 800,
        letterSpacing: '-0.02em',
        lineHeight: 1,
        pointerEvents: interactive ? 'auto' : 'none',
        cursor: interactive ? 'pointer' : 'default',
        zIndex: 1000,
        boxShadow: SHAPE_SHADOW,
        border: `1px solid ${DESIGN_TOKENS.colors.border}`,
        scale: pressFeedback.pressScale,
        willChange: 'transform',
        boxSizing: 'border-box',
      }}
      role={interactive ? 'button' : undefined}
      aria-label={interactive ? ariaLabel : undefined}
      onClick={interactive ? (e) => {
        e.stopPropagation()
        onClick?.(e)
      } : undefined}
      onPointerDown={interactive ? (e) => {
        e.stopPropagation()
        pressFeedback.bind.onPointerDown(e)
      } : undefined}
      onPointerUp={interactive ? (e) => {
        e.stopPropagation()
        pressFeedback.bind.onPointerUp(e)
      } : undefined}
      onMouseEnter={interactive ? pressFeedback.bind.onMouseEnter : undefined}
      onMouseLeave={interactive ? pressFeedback.bind.onMouseLeave : undefined}
    >
      {resolvedVariant === 'close' ? (
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 12 12"
          aria-hidden="true"
          focusable="false"
          style={{ display: 'block', transform: 'translateY(0.25px)' }}
        >
          <line x1="3" y1="3" x2="9" y2="9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="9" y1="3" x2="3" y2="9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ) : resolvedVariant === 'info' ? (
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 12 12"
          aria-hidden="true"
          focusable="false"
          style={{ display: 'block', transform: 'translateY(0.25px)' }}
        >
          <line x1="6" y1="5.2" x2="6" y2="9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="6" cy="3" r="1" fill="currentColor" />
        </svg>
      ) : (
        <span style={{ display: 'block', transform: 'translateY(0.5px)' }}>
          {connectionsCount}
        </span>
      )}
    </motion.div>
  )
})

