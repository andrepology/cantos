import type { Card } from '../../arena/types'
import type { CardLayout } from '../../arena/hooks/useTactileLayout'
import { motion, useMotionValue, animate, useTransform, AnimatePresence } from 'motion/react'
import { useEffect, useCallback } from 'react'
import { usePressFeedback } from '../../hooks/usePressFeedback'
import { CARD_BACKGROUND, CARD_BORDER_RADIUS, CARD_SHADOW } from '../../arena/constants'
import { recordCardRender } from '../../arena/tactilePerf'
import { ProfileCircle } from '../../arena/icons'

// Minimum container width to show chat metadata (profile circles, names, dates)
const CHAT_METADATA_MIN_WIDTH = 216

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
  initialLayout?: Partial<CardLayout>
  index: number
  debug?: boolean
  springConfig?: SpringConfig
  immediate?: boolean // New prop: skip springs if true
  containerWidth?: number // For metadata width check
  onClick?: (e: React.MouseEvent) => void
  onPointerDown?: (e: React.PointerEvent) => void
  onPointerMove?: (e: React.PointerEvent) => void
  onPointerUp?: (e: React.PointerEvent) => void
  style?: React.CSSProperties
}

export function TactileCard({ card, layout, initialLayout, index, debug, springConfig, immediate, containerWidth, onClick, onPointerDown, onPointerMove, onPointerUp, style }: TactileCardProps) {
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
  // Initialize with initialLayout if provided, otherwise fallback to layout
  const x = useMotionValue(initialLayout?.x ?? layout?.x ?? 0)
  const y = useMotionValue(initialLayout?.y ?? layout?.y ?? 0)
  const scale = useMotionValue(initialLayout?.scale ?? layout?.scale ?? 1)
  const opacity = useMotionValue(initialLayout?.opacity ?? layout?.opacity ?? 1)
  const zIndex = useMotionValue(initialLayout?.zIndex ?? layout?.zIndex ?? 0)
  const width = useMotionValue(initialLayout?.width ?? layout?.width ?? 100)
  const height = useMotionValue(initialLayout?.height ?? layout?.height ?? 100)

  // Tactile press feedback - hook handles combining user handlers
  const { pressScale, bind: pressFeedbackBind } = usePressFeedback({
    onPointerDown,
    onPointerUp
  })

  // Combine layout scale with press feedback scale
  const combinedScale = useTransform(() => scale.get() * pressScale.get())

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

    // For dropped cards, animate zIndex from high to final position
    if (initialLayout) {
      zIndex.set(9999) // Start at highest zIndex
      // Animate zIndex down to target after a brief delay to ensure it's visible
      setTimeout(() => {
        animate(zIndex, layout.zIndex, { duration: 0.6, ease: "easeOut" })
      }, 50)
    } else {
      zIndex.set(layout.zIndex)
    }
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
        scale: combinedScale,
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
        // Add padding for metadata
        paddingTop: 0,
        // Simple fade-in animation on mount only
        // animation: 'tactileCardFadeIn 0.6s ease-out forwards',
        // Optimization: Use hardware acceleration
        transformStyle: 'preserve-3d',
        willChange: 'transform',
        pointerEvents: (typeof opacity === 'number' ? opacity : opacity.get?.()) === 0 ? 'none' : 'auto',
        cursor: onClick ? 'pointer' : 'default',
        ...style
      }}
      data-interactive="card"
      onClick={onClick}
      onPointerMove={onPointerMove}
      {...pressFeedbackBind}
    >
      <div style={{ textAlign: 'center', pointerEvents: 'none' }}>
        <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 4 }}>{card.id}</div>
        {debug && <div style={{ fontSize: 10, color: '#999' }}>{(card as any).color}</div>}
      </div>

      {/* Chat metadata overlay */}
      <AnimatePresence>
        {layout.showMetadata && card.user && (
          <motion.div
            key={`metadata-${card.id}`}
            initial={immediate ? { opacity: 1, y: 0 } : { opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2, transition: { duration: 0.15 } }}
            transition={{
              delay: immediate ? 0 : 0.2 + (index % 5) * 0.05, // No delay when scrolling, staggered when animating
              duration: immediate ? 0 : 0.3, // Instant when scrolling, smooth when animating
              ease: "easeOut"
            }}
            style={{
              position: 'absolute',
              top: 0,
              left: -32,
              right: -32,
              pointerEvents: 'none'
            }}
          >
            {/* Profile circle + name on left */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                position: 'absolute',
                left: 0,
                top: -24
              }}
            >
              <div
                style={{
                  position: 'relative',
                  top: 6,
                }}
              >
                <ProfileCircle avatar={card.user.avatar || undefined} />
              </div>
              <span
                style={{
                  fontSize: 11,
                  color: 'rgba(0,0,0,.7)',
                  marginLeft: 10,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '120px',
                  fontWeight: 500,
                }}
              >
                {card.user.full_name || card.user.username}
              </span>
            </div>

            {/* Formatted date on right */}
            {card.createdAt && (
              <span
                style={{
                  position: 'absolute',
                  right: 0,
                  top: -20,
                  fontSize: 10,
                  color: 'rgba(0,0,0,.5)'
                }}
              >
                {(() => {
                  const date = new Date(card.createdAt!)
                  const now = new Date()
                  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())

                  const month = date.toLocaleDateString('en-US', { month: 'short' })
                  const day = date.getDate()
                  const year = date.toLocaleDateString('en-US', { year: '2-digit' })

                  // If within the last year, show "Sep 21", otherwise show "Sep '23"
                  if (date >= oneYearAgo) {
                    return `${month} ${day}`
                  } else {
                    return `${month} '${year}`
                  }
                })()}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
