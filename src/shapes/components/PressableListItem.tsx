import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { motion } from 'motion/react'
import { CARD_BORDER_RADIUS, DESIGN_TOKENS, PORTAL_BACKGROUND } from '../../arena/constants'
import { usePressFeedback } from '../../hooks/usePressFeedback'

type PressableListItemProps = Omit<HTMLAttributes<HTMLDivElement>, 'onPointerDown' | 'onPointerUp'> & {
  children: ReactNode
  minHeight?: number
  padding?: string
  pressScale?: number
  hoverScale?: number
  stiffness?: number
  damping?: number
  disabled?: boolean
  onPointerDown?: (e: React.PointerEvent) => void
  onPointerUp?: (e: React.PointerEvent) => void
  style?: CSSProperties
}

export function PressableListItem({
  children,
  minHeight,
  padding = '6px 8px',
  pressScale = 0.98,
  hoverScale = 1.02,
  stiffness = 400,
  damping = 25,
  disabled = false,
  onPointerDown,
  onPointerUp,
  style,
  ...rest
}: PressableListItemProps) {
  const pressFeedback = usePressFeedback({
    scale: pressScale,
    hoverScale,
    stiffness,
    damping,
    disabled,
    onPointerDown,
    onPointerUp,
  })

  return (
    <motion.div
      {...pressFeedback.bind}
      {...rest}
      style={{
        padding,
        borderRadius: CARD_BORDER_RADIUS,
        border: `1px solid ${DESIGN_TOKENS.colors.border}`,
        background: PORTAL_BACKGROUND,
        transition: 'background 120ms ease',
        pointerEvents: 'auto',
        minHeight,
        display: 'flex',
        alignItems: 'center',
        scale: pressFeedback.pressScale,
        transformOrigin: 'center center',
        willChange: 'transform',
        cursor: disabled ? 'default' : 'pointer',
        ...style,
      }}
    >
      {children}
    </motion.div>
  )
}
