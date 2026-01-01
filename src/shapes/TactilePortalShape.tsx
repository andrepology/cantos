import { BaseBoxShapeUtil, HTMLContainer, T, resizeBox, stopEventPropagation, useEditor, useValue, type TLResizeInfo } from 'tldraw'
import type { TLBaseShape } from 'tldraw'
import { TactileDeck } from './components/TactileDeck'
import { useMemo, useCallback } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { motion } from 'motion/react'
import { isInteractiveTarget } from '../arena/dom'
import { SHAPE_BORDER_RADIUS, SHAPE_SHADOW, ELEVATED_SHADOW, PORTAL_BACKGROUND } from '../arena/constants'
import { MixBlendBorder } from './MixBlendBorder'
import { selectLayoutMode, type LayoutMode } from '../arena/layoutConfig'
import { getGridSize, snapToGrid, TILING_CONSTANTS } from '../arena/layout'
import { useDoubleClick } from '../hooks/useDoubleClick'
import { AddressBar } from './components/AddressBar'
import {
  type PortalSource,
  type PortalSourceSelection,
} from '../arena/search/portalSearchTypes'
import { useMinimizeAnimation } from './hooks/useMinimizeAnimation'
import { useHoverBorder } from './hooks/useHoverBorder'
import { createMinimizeHandler } from './utils/createMinimizeHandler'
// Split subscription hooks for optimized re-renders
import { useChannelStructure } from '../arena/hooks/useChannelStructure'
import { useLayoutMetrics } from '../arena/hooks/useLayoutMetrics'
import { useChannelChrome } from '../arena/hooks/useChannelChrome'
import { useSyncTrigger } from '../arena/hooks/useSyncTrigger'
import { useAuthorMetadata } from '../arena/hooks/useAuthorMetadata'
import { LoadingPulse } from './LoadingPulse'
import { useCoState } from 'jazz-tools/react'
import { ArenaBlock } from '../jazz/schema'
import {
  findContainingSlide,
  clampPositionToSlide,
  clampDimensionsToSlide,
} from './slideContainment'
import { computeNearestFreeBounds } from '../arena/collisionAvoidance'
import { usePortalTextScale } from './hooks/usePortalTextScale'
import { recordRender } from '../arena/renderCounts'
import { useShapeFocus } from './hooks/useShapeFocus'

const FOCUSED_PORTAL_BACKGROUND = 'rgba(255, 255, 255, 0.04)'

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

    const isSelected = useValue('isSelected', () => {
      const ids = editor.getSelectedShapeIds()
      return ids.includes(shape.id)
    }, [editor, shape.id])
    
    const { focusState, handlePointerDown: handleFocusPointerDown } = useShapeFocus(shape.id, editor)
    const isFocused = focusState.activeShapeId === shape.id
    const shouldTilt = focusState.activeShapeId !== null && !isFocused
    const enablePerspective = shouldTilt || isFocused
    const { isHovered, handlePointerEnter, handlePointerLeave } = useHoverBorder()

    const activeSource: PortalSource = source ?? { kind: 'channel', slug: 'cantos-hq' }

    // Tactile-specific auto layout mode selection
    const mode: LayoutMode = useMemo(() => selectLayoutMode(w, h), [w, h])

    // === SPLIT SUBSCRIPTION ARCHITECTURE ===
    // Each hook subscribes to only what it needs, using selectors to filter updates
    const channelSlug = activeSource.kind === 'channel' ? activeSource.slug : undefined
    
    // 1. Structure: shallow subscription for block IDs and pagination state
    //    Re-renders: only on add/remove/reorder
    const { channelId, blockIds, loading: structureLoading } = useChannelStructure(channelSlug)
    
    // 2. Layout metrics: selector-filtered subscription for aspects only
    //    Re-renders: only when aspects change (not title/description/etc)
    const layoutItems = useLayoutMetrics(channelId)
    
    // 3. Chrome: selector-filtered subscription for title/author
    //    Re-renders: only when display metadata changes
    const channelChrome = useChannelChrome(channelId)
    
    // 4. Sync trigger: handles staleness detection and sync orchestration
    //    Re-renders: only on syncing/error state change
    const { syncing } = useSyncTrigger(channelSlug)

    // Author data for author source portals
    const authorUserId = activeSource.kind === 'author' ? activeSource.id : undefined
    const authorMetadata = useAuthorMetadata(authorUserId)
    
    const showLoading = activeSource.kind === 'channel' 
      ? ((structureLoading || syncing) && blockIds.length === 0)
      : (authorMetadata === undefined)

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
    const isCardFocus = focusedCardId != null

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


    // Derive display text from channelChrome (selector-filtered, stable)
    const labelDisplayText = useMemo(() => {
      if (activeSource.kind === 'channel') {
        // Use channelChrome if available (from selector-filtered subscription)
        if (channelChrome?.slug === activeSource.slug) {
          return channelChrome.title ?? activeSource.title ?? activeSource.slug
        }
        return activeSource.title ?? activeSource.slug
      }
      if (activeSource.kind === 'author') {
        // Prefer fetched author metadata over source props
        if (authorMetadata?.fullName) return authorMetadata.fullName
        return activeSource.fullName ?? 'Author'
      }
      return 'Channel'
    }, [activeSource, channelChrome, authorMetadata])

    // Derive author from channelChrome (selector-filtered, stable)
    const labelAuthor = useMemo(() => {
      if (activeSource.kind !== 'channel') return null
      if (!channelChrome || channelChrome.slug !== activeSource.slug) return null
      if (!channelChrome.author) return null
      return {
        id: channelChrome.author.id,
        fullName: channelChrome.author.fullName,
        avatarThumb: channelChrome.author.avatarThumb,
      }
    }, [activeSource, channelChrome])

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

    const handlePointerDown = useCallback((e: ReactPointerEvent) => {
      if (handleFocusPointerDown(e)) return
      handleDoubleClick(e)
    }, [handleDoubleClick, handleFocusPointerDown])

    const content = (
      <motion.div
        animate={{
          rotateX: shouldTilt ? 40 : 0,
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
            background: isFocused ? 'transparent' : (isCardFocus ? FOCUSED_PORTAL_BACKGROUND : PORTAL_BACKGROUND),
            borderRadius: `${SHAPE_BORDER_RADIUS}px`,
            boxShadow: isFocused ? 'none' : (spawnDragging || isSelected ? ELEVATED_SHADOW : SHAPE_SHADOW),
            overflow: 'hidden',
            transition: 'background-color 220ms ease-out, box-shadow 250ms ease-out',
          }}
        >
          <div style={{ pointerEvents: 'none', position: 'absolute', inset: 0 }}>
            <MixBlendBorder
              width={isFocused ? 0 : (isHovered || isSelected ? 4 : (isCardFocus ? 0 : 0.5))}
              borderRadius={SHAPE_BORDER_RADIUS}
              transformOrigin="top center"
              zIndex={5}
            />
          </div>
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
              authorMetadata={authorMetadata}
              shapeId={shape.id}
              isSelected={isSelected}
              isHovered={isHovered}
              initialScrollOffset={shape.props.scrollOffset}
              initialFocusedCardId={focusedCardId}
              onFocusChange={handleFocusChange}
              onFocusPersist={handleFocusPersist}
            />
          </div>
        </div>
        <AddressBar
          sourceKind={activeSource.kind === 'author' ? 'author' : 'channel'}
          sourceSlug={activeSource.kind === 'channel' ? activeSource.slug : undefined}
          sourceUserId={activeSource.kind === 'author' ? activeSource.id : undefined}
          displayText={labelDisplayText}
          authorId={labelAuthor?.id}
          authorFullName={labelAuthor?.fullName}
          authorAvatarThumb={labelAuthor?.avatarThumb}
          focusedBlock={focusedBlock}
          isSelected={isSelected}
          isHovered={isHovered}
          onSourceChange={handleSourceChange}
          onBack={handleBack}
          shapeId={shape.id}
          textScale={textScale}
          layoutMode={mode}
        />
      </motion.div>
    )

    return (
      <PerspectiveContainer
        editor={editor}
        shape={shape}
        w={w}
        h={h}
        enablePerspective={enablePerspective}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
      >
        {content}
      </PerspectiveContainer>
    )
  }

  indicator(shape: TactilePortalShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />
  }
}

function PerspectiveContainer({
  editor,
  shape,
  w,
  h,
  enablePerspective,
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
  children,
}: {
  editor: ReturnType<typeof useEditor>
  shape: TactilePortalShape
  w: number
  h: number
  enablePerspective: boolean
  onPointerEnter: (e: ReactPointerEvent) => void
  onPointerLeave: (e: ReactPointerEvent) => void
  onPointerDown: (e: ReactPointerEvent) => void
  children: ReactNode
}) {
  if (!enablePerspective) {
    return (
      <HTMLContainer
        style={{
          pointerEvents: 'all',
          overflow: 'visible',
          position: 'relative',
          boxSizing: 'border-box',
        }}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onPointerDown={onPointerDown}
      >
        {children}
      </HTMLContainer>
    )
  }

  const vpb = useValue('viewportPageBounds', () => editor.getViewportPageBounds(), [editor])
  const perspectivePx = useMemo(() => `${Math.max(vpb.w, vpb.h)}px`, [vpb.h, vpb.w])
  const spb = editor.getShapePageBounds(shape)
  const perspectiveOrigin = useMemo(() => {
    if (!spb) return `${w / 2}px ${h / 2}px`
    const px = vpb.midX - spb.midX + spb.w / 2
    const py = vpb.midY - spb.midY + spb.h / 2
    return `${px}px ${py}px`
  }, [h, spb, vpb.midX, vpb.midY, w])

  return (
    <HTMLContainer
      style={{
        pointerEvents: 'all',
        overflow: 'visible',
        position: 'relative',
        boxSizing: 'border-box',
        perspective: perspectivePx,
        perspectiveOrigin,
      }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
    >
      {children}
    </HTMLContainer>
  )
}
