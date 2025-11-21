import type { Card } from '../../arena/types'
import type { CardLayout, LayoutResult } from '../../arena/hooks/useTactileLayout'
import { motion, useMotionValue, useSpring, animate } from 'motion/react'
import { useEffect, useRef } from 'react'

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

  // Track previous target to calculate deltas
  const prevTarget = useRef(layout)

  useEffect(() => {
    if (!layout) return

    // Calculate distance to new target
    const dx = layout.x - x.get()
    const dy = layout.y - y.get()
    const dist = Math.hypot(dx, dy)

    // Apply spring config
    let stiffness: number
    let damping: number
    let mass: number

    if (springConfig) {
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
    } else {
      // Default: tactile
      stiffness = 200 + (dist * 0.5)
      damping = 25 + (dist * 0.05)
      mass = 1
    }

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

    prevTarget.current = layout
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
        opacity,
        zIndex,
        backgroundColor: 'white',
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid rgba(0,0,0,0.1)',
        // Optimization: Use hardware acceleration
        transformStyle: 'preserve-3d',
        willChange: 'transform'
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

