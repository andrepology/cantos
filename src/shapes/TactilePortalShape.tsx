import { BaseBoxShapeUtil, HTMLContainer, T, resizeBox, stopEventPropagation, useEditor, useValue, type TLResizeInfo } from 'tldraw'
import type { TLBaseShape } from 'tldraw'
import { TactileDeck } from './components/TactileDeck'
import { HoverIndicator } from './components/HoverIndicator'
import { useMemo, useState, useCallback, useEffect } from 'react'
import { motion } from 'motion/react'
import { isInteractiveTarget } from '../arena/dom'
import { SHAPE_BORDER_RADIUS, SHAPE_SHADOW, ELEVATED_SHADOW, PORTAL_BACKGROUND } from '../arena/constants'
import { MixBlendBorder, type MixBlendBorderHandle } from './MixBlendBorder'
import { selectLayoutMode, type LayoutMode } from '../arena/layoutConfig'
import { getGridSize, snapToGrid, TILING_CONSTANTS } from '../arena/layout'
import { useDoubleClick } from '../hooks/useDoubleClick'
import { PortalAddressBar, MOCK_PORTAL_SOURCES, type PortalSource, type PortalSourceOption, type PortalSourceSelection } from './components/PortalAddressBar'
import { getChannelMetadata, getDefaultChannelMetadata } from '../arena/mockMetadata'
import { useMinimizeAnimation } from './hooks/useMinimizeAnimation'
import { useHoverBorder } from './hooks/useHoverBorder'
import { createMinimizeHandler } from './utils/createMinimizeHandler'
import type { Card } from '../arena/types'
import { useArenaChannelStream } from '../arena/hooks/useArenaChannelStream'
import { LoadingPulse } from './LoadingPulse'
import { useCoState } from 'jazz-tools/react'
import { ArenaBlock } from '../jazz/schema'
import { TEXT_SECONDARY } from '../arena/constants'
import {
  findContainingSlide,
  clampPositionToSlide,
  clampDimensionsToSlide,
  SLIDE_CONTAINMENT_MARGIN,
} from './slideContainment'
import { computeNearestFreeBounds } from '../arena/collisionAvoidance'
import { usePortalTextScale } from './hooks/usePortalTextScale'
import { recordRender } from '../arena/renderCounts'

export interface TactilePortalShape extends TLBaseShape<
  'tactile-portal',
  {
    w: number
    h: number
    source: PortalSource
    scrollOffset?: number
    focusedCardId?: number
    minimized?: boolean
    restoredW?: number
    restoredH?: number
    minimizeAnchor?: string
    spawnDragging?: boolean
    spawnIntro?: boolean
  }
> { }

export class TactilePortalShapeUtil extends BaseBoxShapeUtil<TactilePortalShape> {
  static override type = 'tactile-portal' as const
  static override props = {
    w: T.number,
    h: T.number,
    // Store the discriminated source object directly; tolerant validator for simplicity
    source: T.any,
    scrollOffset: T.number.optional(),
    focusedCardId: T.number.optional(),
    minimized: T.boolean.optional(),
    restoredW: T.number.optional(),
    restoredH: T.number.optional(),
    minimizeAnchor: T.string.optional(),
    spawnDragging: T.boolean.optional(),
    spawnIntro: T.boolean.optional(),
  }

  getDefaultProps(): TactilePortalShape['props'] {
    return {
      w: 320,
      h: 320,
      source: { kind: 'channel', slug: 'capitalism' },
    }
  }

  onResize(shape: TactilePortalShape, info: TLResizeInfo<TactilePortalShape>) {
    const resized = resizeBox(shape, info)
    const gridSize = getGridSize()

    // Snap dimensions to grid and apply minimums
    const originalW = resized.props.w
    const originalH = resized.props.h
    const snappedW = Math.max(TILING_CONSTANTS.minWidth, snapToGrid(originalW, gridSize))
    const snappedH = Math.max(TILING_CONSTANTS.minHeight, snapToGrid(originalH, gridSize))

    // Find containing slide and clamp dimensions
    const bounds = { x: resized.x, y: resized.y, w: snappedW, h: snappedH }
    const slide = findContainingSlide(this.editor, bounds)
    const { w: cappedW, h: cappedH } = clampDimensionsToSlide(
      snappedW,
      snappedH,
      slide,
      TILING_CONSTANTS.minWidth,
      TILING_CONSTANTS.minHeight
    )

    // Calculate how much the dimensions changed due to capping
    const deltaW = cappedW - originalW
    const deltaH = cappedH - originalH

    // Adjust x/y position based on which handle is being dragged
    // This prevents jittering on the opposite edge
    let adjustedX = resized.x
    let adjustedY = resized.y

    const handle = info.handle

    // For handles that affect the left edge, compensate x position
    if (handle === 'top_left' || handle === 'left' || handle === 'bottom_left') {
      adjustedX = resized.x - deltaW
    }

    // For handles that affect the top edge, compensate y position  
    if (handle === 'top_left' || handle === 'top' || handle === 'top_right') {
      adjustedY = resized.y - deltaH
    }

    // Clamp final position to slide bounds
    const finalBounds = { x: adjustedX, y: adjustedY, w: cappedW, h: cappedH }
    const clampedPos = clampPositionToSlide(finalBounds, slide)

    return {
      ...resized,
      x: clampedPos.x,
      y: clampedPos.y,
      props: {
        ...resized.props,
        w: cappedW,
        h: cappedH,
      }
    }
  }

  onTranslate(initial: TactilePortalShape, current: TactilePortalShape) {
    const pageBounds = this.editor.getShapePageBounds(current)
    if (!pageBounds) return

    const bounds = { x: current.x, y: current.y, w: pageBounds.w, h: pageBounds.h }

    // First avoid collisions with other shapes
    const collisionFree = computeNearestFreeBounds(bounds, {
      editor: this.editor,
      shapeId: current.id,
      gap: TILING_CONSTANTS.gap,
      gridSize: getGridSize(),
      maxSearchRings: 20,
    })

    // Then clamp to the containing slide
    const slide = findContainingSlide(this.editor, collisionFree)
    const clamped = clampPositionToSlide(collisionFree, slide)

    // Only return update if position needs clamping
    if (Math.abs(clamped.x - current.x) > 0.01 || Math.abs(clamped.y - current.y) > 0.01) {
      return {
        id: current.id,
        type: 'tactile-portal' as const,
        x: clamped.x,
        y: clamped.y,
      }
    }
  }

  component(shape: TactilePortalShape) {
    
    recordRender('TactilePortalShape')
    recordRender(`TactilePortalShape:${shape.id}`)
    
    const editor = useEditor()
    const { w, h, source, focusedCardId, spawnDragging, spawnIntro } = shape.props
    const { x, y } = shape
    const textScale = usePortalTextScale()

    const selectionMode = useValue('selectionMode', () => {
      const ids = editor.getSelectedShapeIds()
      if (ids.length !== 1) return 0 // none or multi
      return ids[0] === shape.id ? 1 : 2 // selected vs other
    }, [editor, shape.id])
    const isSelected = selectionMode === 1
    const vpb = useValue('viewportPageBounds', () => editor.getViewportPageBounds(), [editor])
    const perspectivePx = useMemo(() => `${Math.max(vpb.w, vpb.h)}px`, [vpb.h, vpb.w])
    const shouldTilt = selectionMode === 2
    const deskTiltXDeg = shouldTilt ? 45 : 0
    const spb = editor.getShapePageBounds(shape)
    const perspectiveOrigin = useMemo(() => {
      if (!spb) return `${w / 2}px ${h / 2}px`
      const px = vpb.midX - spb.midX + spb.w / 2
      const py = vpb.midY - spb.midY + spb.h / 2
      return `${px}px ${py}px`
    }, [h, spb, vpb.midX, vpb.midY, w])
    const { isHovered, borderRef, handlePointerEnter, handlePointerLeave } = useHoverBorder()

    const activeSource: PortalSource = source ?? { kind: 'channel', slug: 'cantos-hq' }

    // Tactile-specific auto layout mode selection
    const mode: LayoutMode = useMemo(() => selectLayoutMode(w, h), [w, h])

    const labelVisible = useMemo(() => {
      if (mode === 'tab' || mode === 'vtab' || mode === 'mini') {
        return false
      }
      return w >= 140 && h >= 120
    }, [mode, w, h])


    const channelSlug = activeSource.kind === 'channel' ? activeSource.slug : undefined
    const { channel, blockIds, layoutItems, loading } = useArenaChannelStream(channelSlug)
    const showLoading = loading && blockIds.length === 0

    // Resolve focused block title from Jazz
    const focusedJazzId = useMemo(() => {
      if (focusedCardId == null) return undefined
      return layoutItems.find(i => i.arenaId === focusedCardId)?.id as any
    }, [focusedCardId, layoutItems])

    const focusedBlockCoState = useCoState(ArenaBlock, focusedJazzId, { resolve: {} })

    const focusedBlock = useMemo(() => {
      if (focusedCardId == null) return null
      if (focusedBlockCoState?.$isLoaded) {
        return { id: focusedCardId, title: focusedBlockCoState.title ?? `Card ${focusedCardId}` }
      }
      return { id: focusedCardId, title: `Card ${focusedCardId}` }
    }, [focusedCardId, focusedBlockCoState])

    const handleFocusChange = useCallback(
      (block: { id: number; title: string } | null) => {
        editor.updateShape({
          id: shape.id,
          type: 'tactile-portal',
          props: { focusedCardId: block?.id ?? undefined }
        })
      },
      [editor, shape.id]
    )

    const handleFocusPersist = useCallback(
      (id: number | null) => {
        editor.updateShape({
          id: shape.id,
          type: 'tactile-portal',
          props: { focusedCardId: id === null ? undefined : id }
        })
      },
      [editor, shape.id]
    )


    // Get connections count for hover indicator
    const connectionsCount = useMemo(() => {
      const channelSlug = activeSource.kind === 'channel' ? activeSource.slug : undefined
      const metadata = channelSlug
        ? getChannelMetadata(channelSlug) || getDefaultChannelMetadata()
        : getDefaultChannelMetadata()
      return metadata.connections.length
    }, [activeSource])

    const portalOptions = MOCK_PORTAL_SOURCES

    const labelDisplayText = useMemo(() => {
      if (activeSource.kind === 'channel') {
        if (channel?.slug === activeSource.slug) {
          return channel.title ?? activeSource.title ?? activeSource.slug
        }
        const match = portalOptions.find(
          (option) => option.kind === 'channel' && option.channel.slug === activeSource.slug
        )
        if (match?.kind === 'channel') return match.channel.title || match.channel.slug || 'Channel'
        return activeSource.title ?? activeSource.slug
      }
      if (activeSource.kind === 'author') {
        const match = portalOptions.find(
          (option) => option.kind === 'author' && option.author.id === activeSource.id
        )
        if (match?.kind === 'author') return match.author.fullName || 'Author'
        return activeSource.fullName ?? 'Author'
      }
      return 'Channel'
    }, [activeSource, channelSlug, portalOptions])

    const labelAuthor = useMemo(() => {
      if (activeSource.kind !== 'channel') return null
      const source = activeSource as { kind: 'channel'; slug: string }
      if (channel?.slug !== source.slug) return null
      const author = channel.author as any
      if (!author || !author.$isLoaded) return null
      return {
        id: author.id,
        fullName: author.fullName ?? undefined,
        avatarThumb: author.avatarThumb ?? undefined,
      }
    }, [activeSource, channel])

    const handleSourceChange = useCallback(
      (selection: PortalSourceSelection) => {
        if (selection.kind === 'channel') {
          editor.updateShape({
            id: shape.id,
            type: 'tactile-portal',
            props: {
              source: {
                kind: 'channel',
                slug: selection.slug,
              },
              scrollOffset: 0,
              focusedCardId: undefined,
            },
          })
        } else {
          editor.updateShape({
            id: shape.id,
            type: 'tactile-portal',
            props: {
              source: {
                kind: 'author',
                id: selection.userId,
                fullName: selection.fullName,
                avatarThumb: selection.avatarThumb,
              },
              scrollOffset: 0,
              focusedCardId: undefined,
            },
          })
        }
      },
      [editor, shape.id]
    )

    const handleBack = useCallback(() => {
      handleFocusPersist(null)
    }, [handleFocusPersist])

    // Minimize/restore animation hook
    const { contentW, contentH, contentX, contentY, animateTransition } = useMinimizeAnimation(w, h, x, y)
    const handleDoubleClick = useDoubleClick(
      createMinimizeHandler(shape, editor, animateTransition)
    )


    return (
      <>
        <HTMLContainer
          style={{
            pointerEvents: 'all',
            overflow: 'visible',
            position: 'relative',
            boxSizing: 'border-box',
            perspective: perspectivePx,
            perspectiveOrigin,
          }}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onPointerDown={handleDoubleClick}

        >
          {/* Visual wrapper to scale full content and border during spawn-drag */}
          <motion.div
            animate={{
              rotateX: deskTiltXDeg,
              opacity: shouldTilt ? 0.22 : 1,
              filter: shouldTilt ? 'blur(2px)' : 'blur(0px)',
              scale: shouldTilt ? 0.8 : 1,
            }}
            transition={{
              rotateX: { type: 'spring', stiffness: 420, damping: 42, mass: 0.9 },
              opacity: { duration: 0.18, ease: [0.2, 0, 0, 1] },
              filter: { duration: 0.22, ease: [0.2, 0, 0, 1] },
            }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: contentW,
              height: contentH,
              x: contentX,
              y: contentY,
              transformOrigin: 'center center',
              transformStyle: 'preserve-3d',
              willChange: 'transform, opacity, filter',
              scale: spawnDragging ? 0.95 : spawnIntro ? 1.02 : 1,
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: PORTAL_BACKGROUND,
                borderRadius: `${SHAPE_BORDER_RADIUS}px`,
                boxShadow: spawnDragging ? ELEVATED_SHADOW : SHAPE_SHADOW,
                overflow: 'hidden',
              }}
            >
              {/* Border effect - ensure non-interactive and respects rounded corners */}
              <div style={{ pointerEvents: 'none', position: 'absolute', inset: 0 }}>
                <MixBlendBorder
                  ref={borderRef}
                  panelOpen={false}
                  borderRadius={SHAPE_BORDER_RADIUS}
                  transformOrigin="top center"
                  zIndex={5}
                  subtleNormal={true}
                />
              </div>
              {/* Interactive content layer */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                  zIndex: 4,
                }}
                onPointerDown={(e) => {
                  if (isInteractiveTarget(e.target)) {
                    stopEventPropagation(e)
                  }
                }}
                onWheel={(e) => {
                  if (e.ctrlKey) return
                  // Explicitly stop propagation at the shape container level too
                  e.stopPropagation()
                }}
              >
                {showLoading ? (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      pointerEvents: 'none',
                      zIndex: 6,
                    }}
                  >
                    <div style={{ width: 64, height: 64, opacity: 0.9 }}>
                      <LoadingPulse
                        size={40}
                        centerDotSize={10}
                        animationDuration="1.6s"
                        rippleCount={3}
                        color={'rgba(64,66,66,0.08)'}
                      />
                    </div>
                  </div>
                ) : null}
                <TactileDeck
                  w={w}
                  h={h}
                  mode={mode}
                  source={activeSource}
                  blockIds={blockIds}
                  layoutItems={layoutItems}
                  shapeId={shape.id}
                  initialScrollOffset={shape.props.scrollOffset}
                  initialFocusedCardId={focusedCardId}
                  onFocusChange={handleFocusChange}
                  onFocusPersist={handleFocusPersist}
                />
              </div>
            </div>
            {labelVisible ? (
              <PortalAddressBar
                sourceKind={activeSource.kind === 'author' ? 'author' : 'channel'}
                displayText={labelDisplayText}
                authorId={labelAuthor?.id}
                authorFullName={labelAuthor?.fullName}
                authorAvatarThumb={labelAuthor?.avatarThumb}
                focusedBlock={focusedBlock}
                isSelected={isSelected}
                options={portalOptions}
                onSourceChange={handleSourceChange}
                onBack={handleBack}
                shapeId={shape.id}
                textScale={textScale}
              />
            ) : null}
            {/* Hover indicator for connections count when not selected */}
            <motion.div
              animate={{ opacity: (!isSelected && isHovered) ? 1 : 0 }}
              transition={{ duration: 0.15 }}
            >
              <HoverIndicator
                connectionsCount={connectionsCount}
                position={{
                  x: w + 8, // Right side of shape + small gap
                  y: 20  // Vertically centered
                }}
                zoom={1}
              />
            </motion.div>
          </motion.div>
        </HTMLContainer>
      </>
    )
  }

  indicator(shape: TactilePortalShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />
  }
}
