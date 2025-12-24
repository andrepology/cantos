import { HTMLContainer, Rectangle2d, ShapeUtil, T, resizeBox, useEditor } from 'tldraw'
import type { TLBaseShape, TLResizeInfo } from 'tldraw'
import { getGridSize, snapToGrid, TILING_CONSTANTS } from '../arena/layout'
import { decodeHtmlEntities } from '../arena/dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WheelEvent as ReactWheelEvent } from 'react'
import { computeResponsiveFont, computePackedFont, computeAsymmetricTextPadding } from '../arena/typography'
import { CARD_BORDER_RADIUS, SHAPE_SHADOW, ELEVATED_SHADOW, SHAPE_BACKGROUND } from '../arena/constants'
import { OverflowCarouselText } from '../arena/OverflowCarouselText'
import { MixBlendBorder } from './MixBlendBorder'
import {
  findContainingSlide,
  clampPositionToSlide,
  clampDimensionsToSlide,
} from './slideContainment'
import { computeNearestFreeBounds } from '../arena/collisionAvoidance'
import { useAccount, useCoState } from 'jazz-tools/react'
import { Account, ArenaBlock, ArenaCache, type LoadedArenaBlock, type LoadedArenaCache } from '../jazz/schema'


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

  override component(shape: ArenaBlockShape) {
    const { w, h, blockId } = shape.props

    const editor = useEditor()
    const isSelected = editor.getSelectedShapeIds().includes(shape.id)
    const [isHovered, setIsHovered] = useState(false)

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
      const aspect = loadedBlock?.aspect
      if (!aspect || aspect === shape.props.aspectRatio) return
      editor.updateShape({
        id: shape.id,
        type: 'arena-block',
        props: { aspectRatio: aspect },
      })
    }, [editor, loadedBlock?.aspect, shape.id, shape.props.aspectRatio])

    // Bring shape to front when selected
    useEffect(() => {
      if (isSelected) {
        editor.bringToFront([shape.id])
      }
    }, [isSelected, editor, shape.id])

    const handleTextWheelCapture = useCallback((e: ReactWheelEvent<HTMLDivElement>) => {
      if (e.ctrlKey) return
      e.stopPropagation()
    }, [])

    const textTypography = useMemo(() => computeResponsiveFont({ width: w, height: h }), [w, h])
    const textPadding = useMemo(() => computeAsymmetricTextPadding(w, h), [w, h])
    const packedFont = useMemo(() => {
      if (blockType !== 'text' || !textContent || textContent.trim().length === 0) return null
      return computePackedFont({
        text: textContent,
        width: w,
        height: h,
        minFontSize: 6,
        maxFontSize: 32,
      })
    }, [blockType, textContent, w, h])

    const decodedText = useMemo(() => {
      if (!textContent) return ''
      return decodeHtmlEntities(textContent)
    }, [textContent])

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
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          editor.setSelectedShapes([shape.id])
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Spawn-drag visual wrapper that scales/shadows the entire shape content */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            borderRadius: CARD_BORDER_RADIUS,
            transition: 'box-shadow 0.2s ease, transform 0.15s ease',
            transform: shape.props.spawnIntro ? 'scale(1.0) translateZ(0)' : (shape.props.spawnDragging ? 'scale(0.95) translateZ(0)' : 'scale(1.0)'),
            transformOrigin: 'center',
            willChange: (shape.props.spawnIntro || shape.props.spawnDragging) ? 'transform' : 'auto',
            boxShadow: shape.props.spawnDragging ? '0 12px 28px rgba(0,0,0,0.18)' : (isSelected ? ELEVATED_SHADOW : SHAPE_SHADOW),
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              borderRadius: CARD_BORDER_RADIUS,
              overflow: 'visible',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
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
                padding: textPadding,
                background: SHAPE_BACKGROUND,
                color: 'rgba(0,0,0,.7)',
                fontSize: packedFont ? packedFont.fontSizePx : textTypography.fontSizePx,
                lineHeight: packedFont ? packedFont.lineHeight : textTypography.lineHeight,
                overflow: packedFont?.overflow ? 'auto' : 'hidden',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                flex: 1,
                borderRadius: CARD_BORDER_RADIUS,
                userSelect: 'none',
                WebkitUserSelect: 'none',
                cursor: 'default',
              }}
              onWheelCapture={handleTextWheelCapture}
            >
              {decodedText || <span style={{ opacity: 0.4 }}>empty</span>}
            </div>
          ) : blockType === 'link' ? (
            <div
              style={{ width: '100%', height: '100%', position: 'relative', borderRadius: CARD_BORDER_RADIUS }}
              onMouseEnter={(e) => {
                const hoverEl = e.currentTarget.querySelector('[data-interactive="link-hover"]') as HTMLElement
                if (hoverEl && linkUrl) {
                  hoverEl.style.opacity = '1'
                  hoverEl.style.background = 'rgba(255, 255, 255, 0.95)'
                  hoverEl.style.borderColor = 'rgba(229, 229, 229, 1)'
                }
              }}
              onMouseLeave={(e) => {
                const hoverEl = e.currentTarget.querySelector('[data-interactive="link-hover"]') as HTMLElement
                if (hoverEl && linkUrl) {
                  hoverEl.style.opacity = '0'
                  hoverEl.style.background = 'rgba(255, 255, 255, 0.9)'
                  hoverEl.style.borderColor = '#e5e5e5'
                }
              }}
            >
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
              {linkUrl ? (
                <a
                  data-interactive="link-hover"
                  href={linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    position: 'absolute',
                    bottom: 8,
                    left: 8,
                    right: 8,
                    height: 32,
                    background: 'rgba(255, 255, 255, 0.9)',
                    border: '1px solid #e5e5e5',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 8px',
                    cursor: 'pointer',
                    fontSize: 11,
                    color: 'rgba(0,0,0,.6)',
                    gap: 6,
                    opacity: 0,
                    transition: 'all 0.2s ease',
                    pointerEvents: 'auto',
                    textDecoration: 'none'
                  }}
                  onDragStart={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    window.open(linkUrl, '_blank', 'noopener,noreferrer')
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation()
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                  </svg>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {title ?? linkUrl ?? ''}
                  </span>
                </a>
              ) : null}
            </div>
          ) : blockType === 'media' ? (
            <div
              style={{ width: '100%', height: '100%', position: 'relative', borderRadius: CARD_BORDER_RADIUS }}
              onMouseEnter={(e) => {
                const hoverEl = e.currentTarget.querySelector('[data-interactive="media-hover"]') as HTMLElement
                if (hoverEl && linkUrl) {
                  hoverEl.style.opacity = '1'
                  hoverEl.style.background = 'rgba(255, 255, 255, 0.95)'
                  hoverEl.style.borderColor = 'rgba(229, 229, 229, 1)'
                }
              }}
              onMouseLeave={(e) => {
                const hoverEl = e.currentTarget.querySelector('[data-interactive="media-hover"]') as HTMLElement
                if (hoverEl && linkUrl) {
                  hoverEl.style.opacity = '0'
                  hoverEl.style.background = 'rgba(255, 255, 255, 0.9)'
                  hoverEl.style.borderColor = '#e5e5e5'
                }
              }}
            >
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
              {linkUrl ? (
                <a
                  data-interactive="media-hover"
                  href={linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    position: 'absolute',
                    bottom: 8,
                    left: 8,
                    right: 8,
                    height: 32,
                    background: 'rgba(255, 255, 255, 0.9)',
                    border: '1px solid #e5e5e5',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 8px',
                    cursor: 'pointer',
                    fontSize: 11,
                    color: 'rgba(0,0,0,.6)',
                    gap: 6,
                    opacity: 0,
                    transition: 'all 0.2s ease',
                    pointerEvents: 'auto',
                    textDecoration: 'none'
                  }}
                  onDragStart={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    window.open(linkUrl, '_blank', 'noopener,noreferrer')
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation()
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polygon points="10,8 16,12 10,16 10,8"></polygon>
                  </svg>
                  <OverflowCarouselText
                    text={title ?? linkUrl ?? ''}
                    textStyle={{ flex: 1 }}
                  />
                </a>
              ) : null}
            </div>
          ) : blockType === 'pdf' ? (
            <div
              style={{ width: '100%', height: '100%', position: 'relative', borderRadius: CARD_BORDER_RADIUS }}
              onMouseEnter={(e) => {
                const hoverEl = e.currentTarget.querySelector('[data-interactive="pdf-hover"]') as HTMLElement
                if (hoverEl && linkUrl) {
                  hoverEl.style.opacity = '1'
                  hoverEl.style.background = 'rgba(255, 255, 255, 0.95)'
                  hoverEl.style.borderColor = 'rgba(229, 229, 229, 1)'
                }
              }}
              onMouseLeave={(e) => {
                const hoverEl = e.currentTarget.querySelector('[data-interactive="pdf-hover"]') as HTMLElement
                if (hoverEl && linkUrl) {
                  hoverEl.style.opacity = '0'
                  hoverEl.style.background = 'rgba(255, 255, 255, 0.9)'
                  hoverEl.style.borderColor = '#e5e5e5'
                }
              }}
            >
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
              {linkUrl ? (
                <a
                  data-interactive="pdf-hover"
                  href={linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    position: 'absolute',
                    bottom: 8,
                    left: 8,
                    right: 8,
                    height: 32,
                    background: 'rgba(255, 255, 255, 0.9)',
                    border: '1px solid #e5e5e5',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 8px',
                    cursor: 'pointer',
                    fontSize: 11,
                    color: 'rgba(0,0,0,.6)',
                    gap: 6,
                    opacity: 0,
                    transition: 'all 0.2s ease',
                    pointerEvents: 'auto',
                    textDecoration: 'none'
                  }}
                  onDragStart={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    window.open(linkUrl, '_blank', 'noopener,noreferrer')
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation()
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14,2 14,8 20,8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10,9 9,9 8,9"></polyline>
                  </svg>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {title}
                  </span>
                </a>
              ) : null}
            </div>
          ) : null}
          </div>

          {/* Mix-blend-mode border effect (inside wrapper so it scales too) */}
          <MixBlendBorder
            width={(isHovered || isSelected) ? 4 : 0}
            borderRadius={CARD_BORDER_RADIUS}
          />
        </div>
      </HTMLContainer>
    )
  }

  override indicator(shape: ArenaBlockShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />
  }
}
