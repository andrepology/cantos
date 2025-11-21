import type { Card } from '../../arena/types'
import type { CardLayout } from '../../arena/hooks/useTactileLayout'
import { motion, useMotionValue, animate } from 'motion/react'
import { useEffect } from 'react'

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
}

export function TactileCard({ card, layout, index, debug, springConfig }: TactileCardProps) {
  // Motion Values for manual control
  const x = useMotionValue(layout?.x ?? 0)
  const y = useMotionValue(layout?.y ?? 0)
  const scale = useMotionValue(layout?.scale ?? 1)
  const opacity = useMotionValue(layout?.opacity ?? 1)
  const zIndex = useMotionValue(layout?.zIndex ?? 0)

  useEffect(() => {
    if (!layout) return

    // Inactive cards (no spring config): instant position/scale
    // (opacity handled by initial/animate props for fade-in)
    if (!springConfig) {
      x.set(layout.x)
      y.set(layout.y)
      scale.set(layout.scale)
      zIndex.set(layout.zIndex)
      return
    }

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

    // Animate Scale/Opacity slightly differently (usually faster/snappier)
    animate(scale, layout.scale, { type: "spring", stiffness: 300, damping: 30 })
    animate(opacity, layout.opacity, { duration: 0.2 }) // Opacity usually linear/ease is fine
    
    // ZIndex is instant or we can just set it
    zIndex.set(layout.zIndex)
  }, [layout, x, y, scale, opacity, zIndex, springConfig])

  if (!layout) return null

  return (
    <motion.div
      style={{
        position: 'absolute',
        width: layout.width,
        height: layout.height,
        x,
        y,
        scale,
        // Only use motion value opacity for active cards (with springs)
        ...(springConfig ? { opacity, zIndex } : { zIndex }),
        backgroundColor: 'white',
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid rgba(0,0,0,0.1)',
        // Simple fade-in animation on mount
        animation: 'tactileCardFadeIn 0.6s ease-out forwards',
        // Optimization: Use hardware acceleration
        transformStyle: 'preserve-3d',
        willChange: 'transform',
        pointerEvents: 'auto'
      }}
      data-interactive="card"
    >
      <div style={{ textAlign: 'center', pointerEvents: 'none' }}>
        <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 4 }}>{card.id}</div>
        {debug && <div style={{ fontSize: 10, color: '#999' }}>{(card as any).color}</div>}
      </div>
    </motion.div>
  )
}

