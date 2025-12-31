import { memo } from 'react'
import { motion } from 'motion/react'
import { TEXT_TERTIARY, SHAPE_SHADOW, PORTAL_BACKGROUND } from '../../arena/constants'
import { usePressFeedback } from '../../hooks/usePressFeedback'

interface HoverIndicatorProps {
  connectionsCount: number
  position: { x: number; y: number }
  variant?: 'count' | 'close' | 'info'
  interactive?: boolean
  onClick?: () => void
  ariaLabel?: string
}

export const ConnectionBadge = memo(function ConnectionBadge({
  connectionsCount,
  position,
  variant = 'count',
  interactive = false,
  onClick,
  ariaLabel,
}: HoverIndicatorProps) {
  const size = 24
  const fontSize = 12
  const iconSize = 12
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
        width: size,
        height: size,
        borderRadius: '50%',
        background: PORTAL_BACKGROUND,
        color: TEXT_TERTIARY,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize,
        fontWeight: 600,
        letterSpacing: '-0.0125em',
        lineHeight: 1,
        pointerEvents: interactive ? 'auto' : 'none',
        cursor: interactive ? 'pointer' : 'default',
        zIndex: 1000,
        boxShadow: SHAPE_SHADOW,
        backdropFilter: 'blur(22px)',
        border: '1px solid rgba(0,0,0,0.08)',
        scale: pressFeedback.pressScale,
        willChange: 'transform',
      }}
      role={interactive ? 'button' : undefined}
      aria-label={interactive ? ariaLabel : undefined}
      onClick={interactive ? onClick : undefined}
      onPointerDown={interactive ? pressFeedback.bind.onPointerDown : undefined}
      onPointerUp={interactive ? pressFeedback.bind.onPointerUp : undefined}
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
