import { memo } from 'react'
import { TEXT_SECONDARY, SHAPE_SHADOW } from '../../arena/constants'

interface HoverIndicatorProps {
  connectionsCount: number
  position: { x: number; y: number }
  zoom: number
}

export const HoverIndicator = memo(function HoverIndicator({
  connectionsCount,
  position,
  zoom
}: HoverIndicatorProps) {
  const size = 24
  const fontSize = 12

  return (
    <div
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y - size / 2, // Center vertically around the position
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.96)',
        color: TEXT_SECONDARY,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize,
        fontWeight: 600,
        letterSpacing: '-0.0125em',
        pointerEvents: 'none',
        zIndex: 1000,
        boxShadow: SHAPE_SHADOW,
        backdropFilter: 'blur(22px)',
        border: '1px solid rgba(0,0,0,0.08)',
      }}
    >
      {connectionsCount}
    </div>
  )
})
