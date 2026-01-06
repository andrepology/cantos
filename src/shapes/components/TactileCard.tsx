import type React from 'react'
import type { CardLayout } from '../../arena/hooks/useTactileLayout'
import { motion, useMotionValue, animate, useTransform, AnimatePresence } from 'motion/react'
import { useEffect, useCallback, memo, useMemo, useState } from 'react'
import { usePressFeedback } from '../../hooks/usePressFeedback'
import { CARD_BACKGROUND, CARD_BORDER_RADIUS, CARD_SHADOW, GHOST_BACKGROUND, SHAPE_BORDER_RADIUS, SHAPE_SHADOW, TEXT_PRIMARY } from '../../arena/constants'
import { ProfileCircle } from '../../arena/icons'
import { useCoState } from 'jazz-tools/react'
import { ArenaBlock, type LoadedArenaBlock } from '../../jazz/schema'
import { useTactileInteraction } from '../../arena/hooks/useTactileInteraction'
import type { ID } from 'jazz-tools'
import { BlockRenderer } from './BlockRenderer'
import { usePortalSpawnDrag } from '../../arena/hooks/usePortalSpawnDrag'
import type { PortalAuthor } from '../../arena/search/portalSearchTypes'
import { useEditor, type TLShapeId } from 'tldraw'
import { useScreenToPagePoint } from '../../arena/hooks/useScreenToPage'

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
  focusState?: 'deck' | 'card'
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
  focusState,
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
  const rotate = useMotionValue(initialLayout?.rotation ?? layout?.rotation ?? 0)
  const width = useMotionValue(initialLayout?.width ?? layout?.width ?? 100)
  const height = useMotionValue(initialLayout?.height ?? layout?.height ?? 100)

  // Interaction binding moved here to have access to the loaded block
  const { bind, isSpawning } = useTactileInteraction({
    onCardClick: (id) => onCardClick?.(id),
    onReorderStart,
    onReorderDrag,
    onReorderEnd
  })

  const { pressScale: cardPressScale, bind: cardPressFeedbackBind } = usePressFeedback({})

  // Shadow elevation derived from press scale
  // When scale > 1 (hovering), show elevated shadow; otherwise show idle shadow
  const elevatedShadowOpacity = useTransform(cardPressScale, [1, 1.02], [0, 1])
  const idleShadowOpacity = useTransform(cardPressScale, [1, 1.02], [1, 0])

  const authorPressFeedback = usePressFeedback({
    scale: 0.96,
    hoverScale: 1.05,
    stiffness: 400,
    damping: 25,
  })

  const editor = useEditor()

  const screenToPagePoint = useScreenToPagePoint()

  const getAuthorSpawnPayload = useCallback((author: PortalAuthor) => {
    return { 
      kind: 'author' as const, 
      userId: author.id, 
      userName: author.fullName || '', 
      userAvatar: author.avatarThumb 
    }
  }, [])

  const portalSpawnDimensions = useMemo(() => ({ w: 180, h: 180 }), [])

  const handleAuthorSelect = useCallback((_: any, author: PortalAuthor) => {
    if (!ownerId) return
    editor.updateShape({
      id: ownerId as TLShapeId,
      type: 'tactile-portal',
      props: {
        source: {
          kind: 'author',
          id: author.id,
          fullName: author.fullName,
          avatarThumb: author.avatarThumb,
        },
        scrollOffset: 0,
        focusedCardId: undefined,
      },
    })
  }, [editor, ownerId])

  const {
    ghostState: authorGhostState,
    handlePointerDown: handleAuthorPointerDown,
    handlePointerMove: handleAuthorPointerMove,
    handlePointerUp: handleAuthorPointerUp,
  } = usePortalSpawnDrag<PortalAuthor>({
    thresholdPx: 12,
    screenToPagePoint,
    getSpawnPayload: getAuthorSpawnPayload,
    defaultDimensions: portalSpawnDimensions,
    selectSpawnedShape: false,
    onClick: handleAuthorSelect,
  })

  const authorItem = useMemo<PortalAuthor | null>(() => {
    if (!block || !block.$isLoaded || !block.user) return null
    return {
      id: (block.user as any).id ?? 0,
      fullName: block.user.fullName || block.user.username || '',
      avatarThumb: block.user.avatarThumb || undefined,
    }
  }, [block])

  const pointerEvents = useTransform(opacity, (v) => (v <= 0.01 ? 'none' : 'auto'))

  useEffect(() => {
    if (!layout) return

    const stopAll = () => {
      x.stop?.(); y.stop?.(); scale.stop?.(); width.stop?.(); height.stop?.(); opacity.stop?.(); zIndex.stop?.(); rotate.stop?.()
    }

    if (immediate) {
      stopAll()
      x.set(layout.x); y.set(layout.y); scale.set(layout.scale); width.set(layout.width); height.set(layout.height); opacity.set(layout.opacity); zIndex.set(layout.zIndex); rotate.set(layout.rotation ?? 0)
      return
    }

    if (!springConfig) {
      stopAll()
      x.set(layout.x); y.set(layout.y); scale.set(layout.scale); width.set(layout.width); height.set(layout.height); zIndex.set(layout.zIndex); opacity.set(layout.opacity); rotate.set(layout.rotation ?? 0)
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
    animate(rotate, layout.rotation ?? 0, { type: "spring", stiffness: 300, damping: 30 })

    if (isSpawning) {
        animate(scale, 1.0, { duration: 0.15 })
        animate(opacity, 1, { duration: 0.15 })
    } else {
        animate(scale, layout.scale, { type: "spring", stiffness: 300, damping: 30 })
        animate(opacity, layout.opacity, { duration: 0.2 })
    }

    if (initialLayout) {
      zIndex.set(9999)
      setTimeout(() => animate(zIndex, layout.zIndex, { duration: 0.6, ease: "easeOut" }), 50)
    } else {
      zIndex.set(layout.zIndex)
    }
  }, [layout, springConfig, immediate, initialLayout, isSpawning])

  if (!layout) return null

  // Interaction binding
  const interactionBind = useMemo(() => {
    if (!block || !block.$isLoaded || !interactionEnabled || !layout) return {}
    return bind(block as any, { w: layout.width, h: layout.height })
  }, [block, bind, interactionEnabled, layout])

  return (
    <motion.div
      style={{
        position: 'absolute',
        width,
        height,
        x,
        y,
        rotate,
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
      data-card-type={block?.$isLoaded ? block.type : 'image'}
      data-card-id={block?.$isLoaded ? (block.arenaId ? String(block.arenaId) : block.blockId) : blockId}
      data-card-title={block?.$isLoaded ? block.title : ''}
      data-image-url={block?.$isLoaded ? block.displayUrl : undefined}
      data-aspect-ratio={block?.$isLoaded ? block.aspect : undefined}
      data-url={block?.$isLoaded ? (block.type === 'link' ? block.content : undefined) : undefined}
      data-content={block?.$isLoaded ? (block.type === 'text' ? block.content : undefined) : undefined}
      data-embed-html={block?.$isLoaded ? block.embedHtml : undefined}
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
          scale: cardPressScale,
        }}
        {...cardPressFeedbackBind}
      >
        {/* Shadow layers - GPU composited via opacity transitions (Apple-style) */}
        {block && block.$isLoaded && (
          <>
            <motion.div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: CARD_BORDER_RADIUS,
                pointerEvents: 'none',
                opacity: idleShadowOpacity,
                boxShadow: '0 1px 3px rgba(0,0,0,0.025), 0 2px 8px rgba(0,0,0,0.015)',
              }}
            />
            <motion.div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: CARD_BORDER_RADIUS,
                pointerEvents: 'none',
                opacity: elevatedShadowOpacity,
                boxShadow: '0 8px 24px rgba(0,0,0,0.035), 0 20px 48px rgba(0,0,0,0.025), 0 40px 80px rgba(0,0,0,0.015)',
              }}
            />
          </>
        )}

        <AnimatePresence mode="wait">
          {block && block.$isLoaded ? (
            <motion.div
              key="loaded"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              style={{ width: '100%', height: '100%' }}
            >
              <BlockRenderer block={block} focusState={focusState} ownerId={ownerId} width={width} height={height} />
            </motion.div>
          ) : (
            <motion.div
              key="loading"
              initial={{ opacity: 0.08 }}
              animate={{ opacity: [0.08, 0.15, 0.08] }}
              transition={{
                duration: 2.5,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeInOut"
              }}
              style={{
                width: '100%',
                height: '100%',
                // border: '1px solid rgba(0, 0, 0, 1)',
                borderRadius: CARD_BORDER_RADIUS,
              }}
            />
          )}
        </AnimatePresence>
      </motion.div>

      {/* Chat metadata overlay - reactive to block.user */}
      <AnimatePresence>
        {layout.showMetadata && block && block.$isLoaded && block.user && (
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
              <motion.div 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  position: 'absolute', 
                  left: 0, 
                  top: -24,
                  pointerEvents: 'auto',
                  cursor: 'pointer',
                  scale: authorPressFeedback.pressScale,
                  willChange: 'transform',
                }}
                {...authorPressFeedback.bind}
                onPointerDown={(e) => {
                  authorPressFeedback.bind.onPointerDown(e)
                  e.stopPropagation()
                  if (authorItem) handleAuthorPointerDown(authorItem, e)
                }}
                onPointerMove={(e) => {
                  e.stopPropagation()
                  if (authorItem) handleAuthorPointerMove(authorItem, e)
                }}
                onPointerUp={(e) => {
                  authorPressFeedback.bind.onPointerUp(e)
                  e.stopPropagation()
                  if (authorItem) handleAuthorPointerUp(authorItem, e)
                }}
              >
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
              </motion.div>

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

      {/* <PortalSpawnGhost
        ghost={authorGhostState}
        padding={4}
        borderWidth={1}
        borderRadius={SHAPE_BORDER_RADIUS}
        boxShadow={SHAPE_SHADOW}
        background={GHOST_BACKGROUND}
        renderContent={(auth) => {
          const author = auth as PortalAuthor
          return (
            <div
              style={{
                padding: `4px 8px`,
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                height: '100%',
                gap: 8,
              }}
            >
              <ProfileCircle avatar={author.avatarThumb} size={20} />
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: TEXT_PRIMARY,
                }}
              >
                {author.fullName}
              </div>
            </div>
          )
        }}
      /> */}
    </motion.div>
  )
})
