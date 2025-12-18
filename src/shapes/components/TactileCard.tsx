import type React from 'react'
import type { CardLayout } from '../../arena/hooks/useTactileLayout'
import { motion, useMotionValue, animate, useTransform, AnimatePresence } from 'motion/react'
import { useEffect, useCallback, memo, useMemo } from 'react'
import { usePressFeedback } from '../../hooks/usePressFeedback'
import { CARD_BACKGROUND, CARD_BORDER_RADIUS, CARD_SHADOW } from '../../arena/constants'
import { ProfileCircle } from '../../arena/icons'
import { useCoState } from 'jazz-tools/react'
import { ArenaBlock, type LoadedArenaBlock } from '../../jazz/schema'
import { useTactileInteraction } from '../../arena/hooks/useTactileInteraction'
import type { ID } from 'jazz-tools'
import { BlockRenderer } from './BlockRenderer'

export interface SpringConfig {
  stiffness: number
  damping: number
  mass: number
  distanceMultiplier?: number
  dampingMultiplier?: number
}

interface TactileCardProps {
  blockId: string
  layout?: CardLayout
  initialLayout?: Partial<CardLayout>
  index: number
  debug?: boolean
  springConfig?: SpringConfig
  immediate?: boolean 
  isFocused?: boolean
  ownerId?: string
  interactionEnabled?: boolean
  
  style?: React.CSSProperties
  onCardClick?: (id: number) => void
  onReorderStart?: (id: string, initial: { x: number; y: number }) => void
  onReorderDrag?: (id: string, current: { x: number; y: number }) => void
  onReorderEnd?: (id: string) => void
}

export const TactileCard = memo(function TactileCard({ 
  blockId, 
  layout, 
  initialLayout, 
  index, 
  debug, 
  springConfig, 
  immediate, 
  isFocused,
  ownerId,
  interactionEnabled = true,
  style,
  onCardClick,
  onReorderStart,
  onReorderDrag,
  onReorderEnd
}: TactileCardProps) {
  
  // Subscribe to the block and its user metadata
  const block = useCoState(ArenaBlock, blockId as ID<typeof ArenaBlock>, { 
    resolve: { user: true } 
  })

  // Motion Values for manual control
  const x = useMotionValue(initialLayout?.x ?? layout?.x ?? 0)
  const y = useMotionValue(initialLayout?.y ?? layout?.y ?? 0)
  const scale = useMotionValue(initialLayout?.scale ?? layout?.scale ?? 1)
  const opacity = useMotionValue(initialLayout?.opacity ?? layout?.opacity ?? 1)
  const zIndex = useMotionValue(initialLayout?.zIndex ?? layout?.zIndex ?? 0)
  const width = useMotionValue(initialLayout?.width ?? layout?.width ?? 100)
  const height = useMotionValue(initialLayout?.height ?? layout?.height ?? 100)

  // Interaction binding moved here to have access to the loaded block
  const interaction = useTactileInteraction({
    onCardClick: (id) => onCardClick?.(id),
    onReorderStart,
    onReorderDrag,
    onReorderEnd
  })

  const { pressScale, bind: pressFeedbackBind } = usePressFeedback({})

  const pointerEvents = useTransform(opacity, (v) => (v <= 0.01 ? 'none' : 'auto'))

  useEffect(() => {
    if (!layout) return

    const stopAll = () => {
      x.stop?.(); y.stop?.(); scale.stop?.(); width.stop?.(); height.stop?.(); opacity.stop?.(); zIndex.stop?.()
    }

    if (immediate) {
      stopAll()
      x.set(layout.x); y.set(layout.y); scale.set(layout.scale); width.set(layout.width); height.set(layout.height); opacity.set(layout.opacity); zIndex.set(layout.zIndex)
      return
    }

    if (!springConfig) {
      stopAll()
      x.set(layout.x); y.set(layout.y); scale.set(layout.scale); width.set(layout.width); height.set(layout.height); zIndex.set(layout.zIndex); opacity.set(layout.opacity)
      return
    }

    stopAll()
    const dx = layout.x - x.get()
    const dy = layout.y - y.get()
    const dist = Math.hypot(dx, dy)

    let stiffness = springConfig.stiffness
    let damping = springConfig.damping
    if (springConfig.distanceMultiplier !== undefined) {
      stiffness += (dist * springConfig.distanceMultiplier)
      damping += (dist * (springConfig.dampingMultiplier ?? 0))
    }

    const config = { type: "spring", stiffness, damping, mass: springConfig.mass }

    animate(x, layout.x, config as any)
    animate(y, layout.y, config as any)
    animate(width, layout.width, config as any)
    animate(height, layout.height, config as any)
    animate(scale, layout.scale, { type: "spring", stiffness: 300, damping: 30 })
    animate(opacity, layout.opacity, { duration: 0.2 })

    if (initialLayout) {
      zIndex.set(9999)
      setTimeout(() => animate(zIndex, layout.zIndex, { duration: 0.6, ease: "easeOut" }), 50)
    } else {
      zIndex.set(layout.zIndex)
    }
  }, [layout, springConfig, immediate, initialLayout])

  if (!layout) return null

  // Interaction binding
  const interactionBind = useMemo(() => {
    if (!block || !block.$isLoaded || !interactionEnabled || !layout) return {}
    return interaction.bind(block as any, { w: layout.width, h: layout.height })
  }, [block, interaction, interactionEnabled, layout])

  return (
    <motion.div
      style={{
        position: 'absolute',
        width,
        height,
        x,
        y,
        scale,
        opacity: springConfig ? opacity : layout.opacity,
        zIndex,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transformStyle: 'preserve-3d',
        willChange: 'transform',
        pointerEvents,
        ...style
      }}
      data-interactive="card"
      {...interactionBind}
    >
      <motion.div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          pointerEvents: 'auto',
          borderRadius: CARD_BORDER_RADIUS,
          paddingTop: 0,
          scale: pressScale,
        }}
        {...pressFeedbackBind}
      >
        {block && block.$isLoaded ? (
          <BlockRenderer block={block} isFocused={isFocused} ownerId={ownerId} />
        ) : (
          <div style={{ 
            width: '100%', 
            height: '100%', 
            background: CARD_BACKGROUND, 
            borderRadius: CARD_BORDER_RADIUS,
            boxShadow: CARD_SHADOW,
            display: 'grid',
            placeItems: 'center'
          }}>
            {/* Loading Skeleton */}
            <div style={{ width: 24, height: 24, opacity: 0.1, borderRadius: '50%', background: '#000' }} />
          </div>
        )}
      </motion.div>

      {/* Chat metadata overlay - reactive to block.user */}
      <AnimatePresence>
        {layout.showMetadata && block?.$isLoaded && block.user && (
            <motion.div
              key={`metadata-${blockId}`}
              initial={immediate ? { opacity: 1, y: 0 } : { opacity: 0, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2, transition: { duration: 0.15 } }}
              transition={{
                delay: immediate ? 0 : 0.2 + (index % 5) * 0.05,
                duration: immediate ? 0 : 0.3,
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
              <div style={{ display: 'flex', alignItems: 'center', position: 'absolute', left: 0, top: -24 }}>
                <div style={{ position: 'relative', top: 6 }}>
                  <ProfileCircle avatar={block.user.avatarThumb || undefined} />
                </div>
                <span style={{
                  fontSize: 11,
                  color: 'rgba(0,0,0,.7)',
                  marginLeft: 10,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '120px',
                  fontWeight: 500,
                }}>
                  {block.user.fullName || block.user.username}
                </span>
              </div>

              {block.createdAt && (
                <span style={{ position: 'absolute', right: 36, top: -20, fontSize: 10, color: 'rgba(0,0,0,.5)' }}>
                  {(() => {
                    const date = new Date(block.createdAt)
                    const now = new Date()
                    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
                    const month = date.toLocaleDateString('en-US', { month: 'short' })
                    const day = date.getDate()
                    const year = date.toLocaleDateString('en-US', { year: '2-digit' })
                    return date >= oneYearAgo ? `${month} ${day}` : `${month} '${year}`
                  })()}
                </span>
              )}
            </motion.div>
          )}
      </AnimatePresence>
    </motion.div>
  )
})
