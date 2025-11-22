import type { Card } from '../../arena/types'
import type { CardLayout } from '../../arena/hooks/useTactileLayout'
import { motion, useMotionValue, animate } from 'motion/react'
import { useEffect } from 'react'
import { CARD_BACKGROUND, CARD_BORDER_RADIUS, CARD_SHADOW } from '../../arena/constants'
import { recordCardRender } from '../../arena/tactilePerf'

export interface SpringConfig {
  stiffness: number
  damping: number
  mass: number
  distanceMultiplier?: number
  dampingMultiplier?: number
}

interface TactileCardProps {
  card: Card
  layout?: CardLayout
  index: number
  debug?: boolean
  springConfig?: SpringConfig
  immediate?: boolean // New prop: skip springs if true
  onClick?: (e: React.MouseEvent) => void
  onPointerDown?: (e: React.PointerEvent) => void
  onPointerMove?: (e: React.PointerEvent) => void
  onPointerUp?: (e: React.PointerEvent) => void
}

export function TactileCard({ card, layout, index, debug, springConfig, immediate, onClick, onPointerDown, onPointerMove, onPointerUp }: TactileCardProps) {
  // Perf instrumentation: record render counts and prop changes
  recordCardRender(
    card.id as number,
    layout as CardLayout | undefined,
    {
      onClick,
      onPointerDown,
      onPointerMove,
      onPointerUp,
    }
  )

  // Motion Values for manual control
  const x = useMotionValue(layout?.x ?? 0)
  const y = useMotionValue(layout?.y ?? 0)
  const scale = useMotionValue(layout?.scale ?? 1)
  const opacity = useMotionValue(layout?.opacity ?? 1)
  const zIndex = useMotionValue(layout?.zIndex ?? 0)
  const width = useMotionValue(layout?.width ?? 100)
  const height = useMotionValue(layout?.height ?? 100)

  useEffect(() => {
    if (!layout) return

    // Instant Update Mode (for Scrolling)
    if (immediate) {
      x.set(layout.x)
      y.set(layout.y)
      scale.set(layout.scale)
      width.set(layout.width)
      height.set(layout.height)
      // Opacity might still want a tiny fade for culling, but let's be instant for now
      opacity.set(layout.opacity) 
      zIndex.set(layout.zIndex)
      return
    }

    // Inactive cards (no spring config): instant position/scale
    if (!springConfig) {
      x.set(layout.x)
      y.set(layout.y)
      scale.set(layout.scale)
      width.set(layout.width)
      height.set(layout.height)
      zIndex.set(layout.zIndex)
      return
    }

    // --- Animated Mode (for Layout Morphing) ---

    // Calculate distance to new target
    const dx = layout.x - x.get()
    const dy = layout.y - y.get()
    const dist = Math.hypot(dx, dy)

    // Apply spring config
    let stiffness: number
    let damping: number
    let mass: number

    if (springConfig.distanceMultiplier !== undefined) {
      // "Tactile" mode: distance-based stiffness
      stiffness = springConfig.stiffness + (dist * springConfig.distanceMultiplier)
      damping = springConfig.damping + (dist * (springConfig.dampingMultiplier ?? 0))
    } else {
      // Fixed preset
      stiffness = springConfig.stiffness
      damping = springConfig.damping
    }
    mass = springConfig.mass

    const config = {
        type: "spring",
        stiffness,
        damping,
        mass
    }

    // Animate X/Y with physics
    animate(x, layout.x, config as any)
    animate(y, layout.y, config as any)
    
    // Animate Width/Height with same physics for smooth resize
    animate(width, layout.width, config as any)
    animate(height, layout.height, config as any)

    // Animate Scale/Opacity slightly differently (usually faster/snappier)
    animate(scale, layout.scale, { type: "spring", stiffness: 300, damping: 30 })
    animate(opacity, layout.opacity, { duration: 0.2 }) 
    
    zIndex.set(layout.zIndex)
  }, [layout, x, y, width, height, scale, opacity, zIndex, springConfig, immediate])

  if (!layout) return null

  return (
    <motion.div
      style={{
        position: 'absolute',
        width,
        height,
        x,
        y,
        scale,
        // Only use motion value opacity for active cards (with springs)
        // If inactive/immediate, we want instant opacity updates too.
        opacity: springConfig ? opacity : layout.opacity, 
        zIndex,
        background: CARD_BACKGROUND,
        borderRadius: CARD_BORDER_RADIUS,
        boxShadow: CARD_SHADOW,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid rgba(0,0,0,.08)',
        // Simple fade-in animation on mount only
        // animation: 'tactileCardFadeIn 0.6s ease-out forwards',
        // Optimization: Use hardware acceleration
        transformStyle: 'preserve-3d',
        willChange: 'transform',
        pointerEvents: 'auto',
        cursor: onClick ? 'pointer' : 'default'
      }}
      data-interactive="card"
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div style={{ textAlign: 'center', pointerEvents: 'none' }}>
        <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 4 }}>{card.id}</div>
        {debug && <div style={{ fontSize: 10, color: '#999' }}>{(card as any).color}</div>}
      </div>
    </motion.div>
  )
}
