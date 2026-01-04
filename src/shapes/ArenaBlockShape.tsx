import { HTMLContainer, Rectangle2d, ShapeUtil, T, resizeBox, stopEventPropagation, useEditor } from 'tldraw'
import type { TLBaseShape, TLResizeInfo } from 'tldraw'
import { getGridSize, snapToGrid, TILING_CONSTANTS } from '../arena/layout'
import { decodeHtmlEntities, isInteractiveTarget } from '../arena/dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WheelEvent as ReactWheelEvent, PointerEvent as ReactPointerEvent } from 'react'
import { getFluidFontSize, getFluidPadding } from '../arena/typography'
import { CARD_BORDER_RADIUS, SHAPE_SHADOW, ELEVATED_SHADOW, SHAPE_BACKGROUND } from '../arena/constants'
import { OverflowCarouselText } from '../arena/OverflowCarouselText'
import { MixBlendBorder } from './MixBlendBorder'
import { ScrollFade } from './components/ScrollFade'
import { HoverContainer } from './components/BlockRenderer'
import {
  findContainingSlide,
  clampPositionToSlide,
  clampDimensionsToSlide,
} from './slideContainment'
import { computeNearestFreeBounds } from '../arena/collisionAvoidance'
import { useAccount, useCoState } from 'jazz-tools/react'
import { Account, ArenaBlock, ArenaCache, type LoadedArenaBlock, type LoadedArenaCache } from '../jazz/schema'
import { motion } from 'motion/react'
import { useShapeFocus } from './hooks/useShapeFocus'
import { useShapeFocusState } from './focusState'


export type ArenaBlockShape = TLBaseShape<
  'arena-block',
  {
    w: number
    h: number
    blockId: string
    aspectRatio?: number
    spawnDragging?: boolean
    spawnIntro?: boolean
  }
>

export class ArenaBlockShapeUtil extends ShapeUtil<ArenaBlockShape> {
  static override type = 'arena-block' as const

  static override props = {
    w: T.number,
    h: T.number,
    blockId: T.string,
    aspectRatio: T.number.optional(),
    spawnDragging: T.boolean.optional(),
    spawnIntro: T.boolean.optional(),
  }

  override getDefaultProps(): ArenaBlockShape['props'] {
    return {
      w: 240,
      h: 240,
      blockId: '',
    }
  }

  override getGeometry(shape: ArenaBlockShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
  }

  override isAspectRatioLocked(shape: ArenaBlockShape) {
    return !!shape.props.aspectRatio
  }

  override onResize(shape: ArenaBlockShape, info: TLResizeInfo<ArenaBlockShape>) {
    // Box (width/height) resizing with grid snapping and optional aspect locking
    const resized = resizeBox(shape, info)
    const gridSize = getGridSize()
    const isAspectRatioLocked = this.isAspectRatioLocked(shape)

    const { w: originalW, h: originalH } = resized.props as any
    const handle = info.handle
    const affectsLeft = handle === 'top_left' || handle === 'left' || handle === 'bottom_left'
    const affectsTop = handle === 'top_left' || handle === 'top' || handle === 'top_right'
    
    const snapAspectLockedSize = () => {
      const baseW = Math.max(1, shape.props.w)
      const baseH = Math.max(1, shape.props.h)
      const widthDelta = Math.abs(originalW - baseW)
      const heightDelta = Math.abs(originalH - baseH)
      const useWidth = widthDelta >= heightDelta

      const primarySize = useWidth ? originalW : originalH
      const primaryBase = useWidth ? baseW : baseH
      const snappedPrimary = snapToGrid(primarySize, gridSize)
      let scale = snappedPrimary / primaryBase
      const minScale = Math.max(
        TILING_CONSTANTS.minWidth / baseW,
        TILING_CONSTANTS.minHeight / baseH
      )
      if (!Number.isFinite(scale) || scale <= 0) {
        scale = 1
      }
      scale = Math.max(minScale, scale)
      return { w: baseW * scale, h: baseH * scale }
    }

    let w: number
    let h: number
    if (isAspectRatioLocked && shape.props.aspectRatio) {
      ;({ w, h } = snapAspectLockedSize())
    } else {
      w = Math.max(TILING_CONSTANTS.minWidth, snapToGrid(originalW, gridSize))
      h = Math.max(TILING_CONSTANTS.minHeight, snapToGrid(originalH, gridSize))
    }

    // Find containing slide and clamp dimensions
    const bounds = { x: resized.x, y: resized.y, w, h }
    const slide = findContainingSlide(this.editor, bounds)
    const { w: cappedW, h: cappedH } = clampDimensionsToSlide(
      w,
      h,
      slide,
      TILING_CONSTANTS.minWidth,
      TILING_CONSTANTS.minHeight
    )

    // If we snapped or clamped and the handle affects left/top, shift x/y so the opposite edge stays stable
    const deltaW = cappedW - originalW
    const deltaH = cappedH - originalH
    let adjustedX = resized.x
    let adjustedY = resized.y
    if (affectsLeft) {
      adjustedX = resized.x - deltaW
    }
    if (affectsTop) {
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

  onTranslate(initial: ArenaBlockShape, current: ArenaBlockShape) {
    const pageBounds = this.editor.getShapePageBounds(current)
    if (!pageBounds) return

    const bounds = { x: current.x, y: current.y, w: pageBounds.w, h: pageBounds.h }

    // Collision avoidance: find nearest free spot
    const collisionFree = computeNearestFreeBounds(bounds, {
      editor: this.editor,
      shapeId: current.id,
      gap: TILING_CONSTANTS.gap,
      gridSize: getGridSize(),
      maxSearchRings: 20,
    })

    // Slide containment after collision avoidance
    const slide = findContainingSlide(this.editor, collisionFree)
    const clamped = clampPositionToSlide(collisionFree, slide)

    // Only return update if position needs clamping/adjustment
    if (Math.abs(clamped.x - current.x) > 0.01 || Math.abs(clamped.y - current.y) > 0.01) {
      return {
        id: current.id,
        type: 'arena-block' as const,
        x: clamped.x,
        y: clamped.y,
      }
    }
  }

  onTranslateEnd(_initial: ArenaBlockShape, _current: ArenaBlockShape) {
    this.editor.setSelectedShapes([])
  }

  onResizeEnd(_initial: ArenaBlockShape, _current: ArenaBlockShape) {
    this.editor.setSelectedShapes([])
  }

  override component(shape: ArenaBlockShape) {
    const { w, h, blockId, spawnDragging, spawnIntro } = shape.props

    const editor = useEditor()
    const isSelected = editor.getSelectedShapeIds().includes(shape.id)
    const [isHovered, setIsHovered] = useState(false)

    const { focusState, handlePointerDown: handleFocusPointerDown } = useShapeFocus(shape.id, editor)
    const isFocused = focusState.activeShapeId === shape.id
    const shouldDeemphasize = focusState.activeShapeId !== null && !isFocused

    const numericId = Number(blockId)
    const me = useAccount(Account, {
      resolve: { root: true },
    })

    const cacheId = useMemo(() => {
      if (me === undefined || me === null) return undefined
      if (!me.$isLoaded) return undefined
      return me.root?.arenaCache?.$jazz.id
    }, [me])

    const cache = useCoState(ArenaCache, cacheId, { resolve: { blocks: true } })
    const loadedCache = cache?.$isLoaded ? (cache as LoadedArenaCache) : null
    const blockJazzId = useMemo(() => {
      if (!Number.isFinite(numericId)) return undefined
      if (!loadedCache?.blocks?.$isLoaded) return undefined
      const blockRef = loadedCache.blocks[String(numericId)]
      return blockRef?.$jazz.id
    }, [loadedCache, numericId])

    const block = useCoState(ArenaBlock, blockJazzId, { resolve: { user: true } })
    const loadedBlock = block?.$isLoaded ? (block as LoadedArenaBlock) : null

    const blockType = loadedBlock?.type ?? 'text'
    const title = loadedBlock?.title ?? ''
    const textContent = loadedBlock?.content ?? title
    const imageUrl = loadedBlock?.thumbUrl ?? loadedBlock?.displayUrl ?? loadedBlock?.largeUrl ?? loadedBlock?.originalFileUrl
    const linkUrl = loadedBlock?.originalFileUrl ?? loadedBlock?.displayUrl

    useEffect(() => {
      if (!loadedBlock) return

      if (blockType === 'text') {
        // Text blocks: unlock aspect ratio to allow box resizing
        if (shape.props.aspectRatio !== undefined) {
          editor.updateShape({
            id: shape.id,
            type: 'arena-block',
            props: { aspectRatio: undefined },
          })
        }
      } else {
        // Other blocks: enforce aspect ratio from data
        const aspect = loadedBlock.aspect
        if (aspect && aspect !== shape.props.aspectRatio) {
          editor.updateShape({
            id: shape.id,
            type: 'arena-block',
            props: { aspectRatio: aspect },
          })
        }
      }
    }, [editor, loadedBlock, blockType, shape.id, shape.props.aspectRatio])

    // Bring shape to front when selected
    useEffect(() => {
      if (isSelected) {
        editor.bringToFront([shape.id])
      }
    }, [isSelected, editor, shape.id])


    const textPadding = useMemo(() => getFluidPadding(), [])
    
    // Use fluid typography for cleaner scaling
    const fluidFontSize = useMemo(() => getFluidFontSize(8, 24, 64, 800), [])

    const decodedText = useMemo(() => {
      if (!textContent) return ''
      return decodeHtmlEntities(textContent)
    }, [textContent])

    const handlePointerDown = useCallback((e: ReactPointerEvent) => {
      if (handleFocusPointerDown(e)) return
    }, [handleFocusPointerDown])

    return (
      <HTMLContainer
        style={{
          pointerEvents: 'all',
          width: w,
          height: h,
          border: 'none',
          overflow: 'visible',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
        }}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => setIsHovered(false)}
        onPointerDown={handlePointerDown}
      >
        <motion.div
          animate={{
            opacity: shouldDeemphasize ? 0.22 : 1,
            filter: shouldDeemphasize ? 'blur(2px)' : 'blur(0px)',
          }}
          transition={{
            opacity: { duration: 0.18, ease: [0.2, 0, 0, 1] },
            filter: { duration: 0.22, ease: [0.2, 0, 0, 1] },
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: w,
            height: h,
            willChange: 'opacity, filter, transform',
            scale: spawnDragging ? 0.95 : (spawnIntro ? 1.02 : 1),
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: isFocused ? 'transparent' : (blockType === 'text' ? SHAPE_BACKGROUND : 'transparent'),
              borderRadius: CARD_BORDER_RADIUS,
              boxShadow: isFocused ? 'none' : (spawnDragging || isSelected ? ELEVATED_SHADOW : SHAPE_SHADOW),
              overflow: 'hidden',
              transition: 'background-color 220ms ease-out, box-shadow 250ms ease-out',
              display: 'flex',
              flexDirection: 'column',
            }}
            onPointerDown={(e) => {
              if (isInteractiveTarget(e.target)) {
                stopEventPropagation(e)
              }
            }}
          >
          {blockType === 'image' ? (
            <img
              src={imageUrl}
              alt={title}
              loading="lazy"
              decoding="async"
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: CARD_BORDER_RADIUS }}
              onDragStart={(e) => e.preventDefault()}
            />
          ) : blockType === 'text' ? (
            <div
              data-interactive="text"
              style={{
                width: '100%',
                height: '100%',
                flex: 1,
                containerType: 'size'
              }}
              //onWheelCapture={handleTextWheelCapture}
            >
              <ScrollFade
                fadePx={18}
                stopWheelPropagation
                style={{
                  padding: textPadding,
                  background: SHAPE_BACKGROUND,
                  color: 'rgba(0,0,0,.7)',
                  fontSize: fluidFontSize,
                  lineHeight: 1.5,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  flex: 1,
                  width: '100%',
                  height: '100%',
                  borderRadius: CARD_BORDER_RADIUS,
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  cursor: 'default',
                  containerType: 'size'
                }}
              >
                {decodedText || <span style={{ opacity: 0.4 }}>empty</span>}
              </ScrollFade>
            </div>
          ) : blockType === 'link' ? (
            <HoverContainer overlayUrl={linkUrl} overlayTitle={title}>
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={title}
                  loading="lazy"
                  decoding="async"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                    borderRadius: CARD_BORDER_RADIUS
                  }}
                  onDragStart={(e) => e.preventDefault()}
                />
              ) : null}
            </HoverContainer>
          ) : blockType === 'media' ? (
            <HoverContainer overlayUrl={linkUrl} overlayTitle={title}>
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={title}
                  loading="lazy"
                  decoding="async"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                    borderRadius: CARD_BORDER_RADIUS
                  }}
                  onDragStart={(e) => e.preventDefault()}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'rgba(0,0,0,.4)' }}>media</div>
              )}
            </HoverContainer>
          ) : blockType === 'pdf' ? (
            <HoverContainer overlayUrl={linkUrl} overlayTitle={title} overlayIcon="pdf">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={title}
                  loading="lazy"
                  decoding="async"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                    borderRadius: CARD_BORDER_RADIUS
                  }}
                  onDragStart={(e) => e.preventDefault()}
                />
              ) : (
                <div style={{
                  width: '100%',
                  height: '100%',
                  background: 'rgba(0,0,0,.05)',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'rgba(0,0,0,.4)',
                  fontSize: 14,
                  padding: 8,
                  textAlign: 'center',
                  borderRadius: CARD_BORDER_RADIUS
                }}>
                  <div>📄</div>
                  <div>PDF</div>
                </div>
              )}
            </HoverContainer>
          ) : null}
          </div>

          <MixBlendBorder
            width={isFocused ? 0 : (isHovered || isSelected ? 4 : 0)}
            borderRadius={CARD_BORDER_RADIUS}
          />
        </motion.div>
      </HTMLContainer>
    )
  }

  override indicator(shape: ArenaBlockShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />
  }
}
