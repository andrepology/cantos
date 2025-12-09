import { HTMLContainer, Rectangle2d, ShapeUtil, T, resizeBox, resizeScaled, stopEventPropagation, useEditor, createShapeId, transact } from 'tldraw'
import type { TLBaseShape, TLResizeInfo } from 'tldraw'
import { getGridSize, snapToGrid, TILING_CONSTANTS } from '../arena/layout'
import { decodeHtmlEntities } from '../arena/dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WheelEvent as ReactWheelEvent } from 'react'
import { useArenaBlock } from '../arena/hooks/useArenaData'
import { useAspectRatioCache } from '../arena/hooks/useAspectRatioCache'
import { computeResponsiveFont, computePackedFont, computeAsymmetricTextPadding } from '../arena/typography'
import { ConnectionsPanel } from '../arena/ConnectionsPanel'
import { useSessionUserChannels } from '../arena/userChannelsStore'
import type { ConnectedChannel } from '../arena/types'
import { CARD_BORDER_RADIUS, SHAPE_SHADOW, ELEVATED_SHADOW, SHAPE_BACKGROUND } from '../arena/constants'
import { OverflowCarouselText } from '../arena/OverflowCarouselText'
import { MixBlendBorder, type MixBlendBorderHandle } from './MixBlendBorder'
import { ConnectPopover } from './components/ConnectPopover'
import { useConnectionManager } from '../arena/hooks/useConnectionManager'
import {
  findContainingSlide,
  clampPositionToSlide,
  clampDimensionsToSlide,
  SLIDE_CONTAINMENT_MARGIN,
} from './slideContainment'
import { computeNearestFreeBounds } from '../arena/collisionAvoidance'


export type ArenaBlockShape = TLBaseShape<
  'arena-block',
  {
    w: number
    h: number
    scale?: number
    blockId: string
    kind: 'image' | 'text' | 'link' | 'media' | 'pdf'
    title?: string
    imageUrl?: string
    url?: string
    embedHtml?: string
    hidden?: boolean
    aspectRatio?: number
    spawnDragging?: boolean
    spawnIntro?: boolean
  }
>

export class ArenaBlockShapeUtil extends ShapeUtil<ArenaBlockShape> {
  static override type = 'arena-block' as const

  // Configure-driven resize behavior
  override options: { resizeMode: 'box' | 'scale' } = { resizeMode: 'box' }

  static override props = {
    w: T.number,
    h: T.number,
    scale: T.number.optional(),
    blockId: T.string,
    kind: T.string,
    title: T.string.optional(),
    imageUrl: T.string.optional(),
    url: T.string.optional(),
    embedHtml: T.string.optional(),
    hidden: T.boolean.optional(),
    aspectRatio: T.number.optional(),
    spawnDragging: T.boolean.optional(),
    spawnIntro: T.boolean.optional(),
  }

  override getDefaultProps(): ArenaBlockShape['props'] {
    return {
      w: 240,
      h: 240,
      scale: 1,
      blockId: '',
      kind: 'text',
      title: '',
    }
  }

  override getGeometry(shape: ArenaBlockShape) {
    const scale = shape.props.scale ?? 1
    return new Rectangle2d({ width: shape.props.w * scale, height: shape.props.h * scale, isFilled: true })
  }

  override isAspectRatioLocked(shape: ArenaBlockShape) {
    if (this.options.resizeMode === 'scale') {
      // In scale mode, lock aspect ratio for all blocks except text blocks
      return shape.props.kind !== 'text'
    }
    // Lock aspect ratio for media blocks that have aspect ratios loaded
    return (shape.props.kind === 'image' || shape.props.kind === 'media' || shape.props.kind === 'link' || shape.props.kind === 'pdf') && !!shape.props.aspectRatio
  }

  override onResize(shape: ArenaBlockShape, info: TLResizeInfo<ArenaBlockShape>) {
    if (this.options.resizeMode === 'scale' && shape.props.kind !== 'text') {
      const updated = resizeScaled(shape as any, info as any) as any
      const baseW = Math.max(1, shape.props.w)
      const baseH = Math.max(1, shape.props.h)
      const minScale = Math.max(
        TILING_CONSTANTS.minWidth / baseW,
        TILING_CONSTANTS.minHeight / baseH
      )
      const candidateScale = updated?.props?.scale
      const prevScale = shape.props.scale ?? 1
      const finiteCandidate = Number.isFinite(candidateScale) && candidateScale > 0 ? candidateScale : prevScale
      const nextScale = Math.max(minScale, finiteCandidate)
      return {
        id: shape.id,
        type: 'arena-block',
        ...updated,
        props: {
          ...(updated?.props ?? {}),
          scale: nextScale,
        },
      }
    }

    // Box (width/height) resizing with grid snapping and optional aspect locking
    const resized = resizeBox(shape, info)
    const gridSize = getGridSize()
    const isAspectRatioLocked = this.isAspectRatioLocked(shape)

    let { w, h } = resized.props as any
    w = snapToGrid(w, gridSize)
    h = snapToGrid(h, gridSize)

    if (isAspectRatioLocked && shape.props.aspectRatio) {
      const aspectRatio = shape.props.aspectRatio
      if (w < TILING_CONSTANTS.minWidth) {
        w = TILING_CONSTANTS.minWidth
        h = Math.max(TILING_CONSTANTS.minHeight, snapToGrid(w / aspectRatio, gridSize))
      }
      if (h < TILING_CONSTANTS.minHeight) {
        h = TILING_CONSTANTS.minHeight
        w = Math.max(TILING_CONSTANTS.minWidth, snapToGrid(h * aspectRatio, gridSize))
      }
    } else {
      w = Math.max(TILING_CONSTANTS.minWidth, w)
      h = Math.max(TILING_CONSTANTS.minHeight, h)
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

    // If we clamped and the handle affects left/top, shift x/y so the opposite edge stays stable
    let adjustedX = resized.x
    let adjustedY = resized.y
    if (info.handle === 'top_left' || info.handle === 'left' || info.handle === 'bottom_left') {
      adjustedX = resized.x + (w - cappedW)
    }
    if (info.handle === 'top_left' || info.handle === 'top' || info.handle === 'top_right') {
      adjustedY = resized.y + (h - cappedH)
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
    const { w, h, kind, title, imageUrl, url, embedHtml, hidden, blockId, scale = 1 } = shape.props

    const editor = useEditor()

    // Use shared aspect ratio cache
    const { getAspectRatio, ensureAspectRatio } = useAspectRatioCache()
    const isSelected = editor.getSelectedShapeIds().includes(shape.id)
    const inputsAny = (editor as any).inputs
    const isDragging = !!inputsAny?.isDragging
    const isResizing = !!inputsAny?.isResizing
    const isTransforming = isDragging || isResizing
    const isPointerPressed = !!inputsAny?.isPressed || !!inputsAny?.isPointerDown
    const z = editor.getZoomLevel() || 1
    const panelPx = 260
    const panelMaxHeightPx = 400
    const gapPx = 1
    const gapW = gapPx / z


    // Local panel state management
    const [panelOpen, setPanelOpen] = useState(false)


    const textRef = useRef<HTMLDivElement | null>(null)

    // Text editing state
    const [isEditing, setIsEditing] = useState(false)
    const editableRef = useRef<HTMLDivElement | null>(null)

    // Border hover state managed imperatively
    const borderRef = useRef<MixBlendBorderHandle>(null)

    // Auto-enter edit mode for new blocks (empty title) - disabled
    useEffect(() => {
      // Text editing temporarily disabled
    }, []) // Only on mount

    // Initialize and focus contentEditable when entering edit mode
    useEffect(() => {
      if (isEditing && editableRef.current) {
        // Set initial content only once when entering edit mode
        if (editableRef.current.textContent !== title) {
          editableRef.current.textContent = title || ''
        }
        editableRef.current.focus()
      }
    }, [isEditing, title])

    // Close panel when shape is deselected, during transformations, or when editing
    useEffect(() => {
      if (!isSelected || isTransforming || isEditing) {
        setPanelOpen(false)
      }
    }, [isSelected, isTransforming, isEditing])

    // Bring shape to front when selected
    useEffect(() => {
      if (isSelected) {
        editor.bringToFront([shape.id])
      }
    }, [isSelected, editor, shape.id])

    // Lazily fetch block details when selected only
    const numericId = Number(blockId)
    const shouldFetchDetails = isSelected && !isTransforming && Number.isFinite(numericId)
    const { loading: detailsLoading, error: detailsError, details } = useArenaBlock(Number.isFinite(numericId) ? numericId : undefined, shouldFetchDetails)

    // Ensure aspect ratio is cached and update shape props
    useEffect(() => {
      if (shouldFetchDetails && (kind === 'image' || kind === 'media' || kind === 'link' || kind === 'pdf')) {
        ensureAspectRatio(
          blockId,
          () => {
            if (kind === 'image' || kind === 'media' || kind === 'pdf') return imageUrl
            if (kind === 'link') return imageUrl
            return undefined
          },
          () => null // Rely on image loading for aspect ratio detection
        )
      }
    }, [blockId, kind, imageUrl, shouldFetchDetails, ensureAspectRatio])

    // Update shape aspectRatio prop when we get it from cache
    const currentAspectRatio = getAspectRatio(blockId)
    useEffect(() => {
      if (currentAspectRatio && currentAspectRatio !== shape.props.aspectRatio) {
        editor.updateShape({
          id: shape.id,
          type: 'arena-block',
          props: { aspectRatio: currentAspectRatio }
        })
      }
    }, [currentAspectRatio, shape.props.aspectRatio, shape.id, editor])


    const memoizedConnections = useMemo(() => {
      return (details?.connections ?? []).map((c: ConnectedChannel) => ({
        id: c.id,
        title: c.title || c.slug,
        slug: c.slug,
        author: c.author?.full_name || c.author?.username,
        blockCount: c.length,
        connectionId: c.connectionId, // Pass through for disconnect support
      }))
    }, [details?.connections])

    // User channels for connect popover
    const { channels: userChannels, loading: channelsLoading } = useSessionUserChannels({ autoFetch: false })

    // Connection management hook
    const connectionManager = useConnectionManager({
      source: numericId ? { type: 'block', id: numericId } : null,
      existingConnections: details?.connections ?? [],
      userChannels,
      isActive: isSelected,
    })

    // Close connect popover when main panel opens
    useEffect(() => {
      if (panelOpen && connectionManager.showConnectPopover) {
        connectionManager.handleConnectToggle()
      }
    }, [panelOpen, connectionManager.showConnectPopover, connectionManager.handleConnectToggle])

    const handleTextWheelCapture = useCallback((e: ReactWheelEvent<HTMLDivElement>) => {
      if (e.ctrlKey) return
      e.stopPropagation()
    }, [])

    // Text editing handlers
    const handleTextClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      // Text editing temporarily disabled
    }, [])

    const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
      // ContentEditable manages its own content - we don't need to update state here
      // This prevents cursor jumping by not triggering re-renders during typing
    }, [])

    const handleBlur = useCallback(() => {
      setIsEditing(false)
      
      // Save to shape props when exiting edit mode
      if (editableRef.current) {
        const finalContent = editableRef.current.textContent || ''
        editor.updateShape({
          id: shape.id,
          type: 'arena-block',
          props: { title: finalContent }
        })
      }
    }, [editor, shape.id])

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
      stopEventPropagation(e)

      if (e.key === 'Escape') {
        e.preventDefault()
        editableRef.current?.blur() // Triggers handleBlur
      }
    }, [])

    const handleSelectChannel = useCallback(
      (slug: string) => {
        if (!slug) return
        const newId = createShapeId()
        const gridSize = getGridSize()
        const gap = snapToGrid(8, gridSize)
        const newW = snapToGrid(shape.props.w, gridSize)
        const newH = snapToGrid(shape.props.h, gridSize)
        const x0 = snapToGrid(shape.x + newW + gap, gridSize)
        const y0 = snapToGrid(shape.y, gridSize)
        transact(() => {
          editor.createShapes([
            {
              id: newId,
              type: 'portal',
              x: x0,
              y: y0,
              props: { w: newW, h: newH, channel: slug },
            } as any,
          ])
          editor.setSelectedShapes([newId])
        })
      },
      [editor, shape]
    )

    const handleChannelToggle = useCallback((channelId: number) => {
      connectionManager.handleChannelToggle(channelId)
    }, [connectionManager])

    const sw = w * scale
    const sh = h * scale
    const textTypography = useMemo(() => computeResponsiveFont({ width: sw, height: sh }), [sw, sh])

    // Compute asymmetric padding for text blocks (scales with card dimensions)
    const textPadding = useMemo(() => computeAsymmetricTextPadding(sw, sh), [sw, sh])

    // For text blocks with substantial content (20+ words), compute packed font to maximize density
    // Short text falls back to responsive font to avoid billboard effect
    const packedFont = useMemo(() => {
      if (kind !== 'text' || !title || title.trim().length === 0) return null
      return computePackedFont({
        text: title,
        width: sw,
        height: sh,
        minFontSize: 6,
        maxFontSize: 32,
        // padding auto-scales based on card dimensions
        // lineHeight now dynamically adjusts based on font size (typographic best practice)
      })
    }, [kind, title, sw, sh])

    return (
      <HTMLContainer
        style={{
          pointerEvents: 'all',
          width: sw,
          height: sh,
          border: 'none',
          overflow: 'visible',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          visibility: hidden ? 'hidden' : 'visible',
        }}
        onClick={(e) => {
          // Text editing temporarily disabled: allow container click to select shape
          e.stopPropagation()
          e.preventDefault()
          editor.setSelectedShapes([shape.id])
        }}
        onPointerDown={(e) => {
          if (kind !== 'text') return
          // Text editing temporarily disabled: do not intercept pointer events for text
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          // Set selection to this shape
          editor.setSelectedShapes([shape.id])
          // Always open panel since this shape is now the only selected one
          setPanelOpen(true)
        }}
        onMouseEnter={() => borderRef.current?.setHovered(true)}
        onMouseLeave={() => borderRef.current?.setHovered(false)}
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
            transform: (shape.props as any).spawnIntro ? 'scale(1.0) translateZ(0)' : ((shape.props as any).spawnDragging ? 'scale(0.95) translateZ(0)' : 'scale(1.0)'),
            transformOrigin: 'center',
            willChange: ((shape.props as any).spawnIntro || (shape.props as any).spawnDragging) ? 'transform' : 'auto',
            boxShadow: (shape.props as any).spawnDragging ? '0 12px 28px rgba(0,0,0,0.18)' : (isSelected ? ELEVATED_SHADOW : SHAPE_SHADOW),
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
          {kind === 'image' ? (
            <img
              src={imageUrl}
              alt={title}
              loading="lazy"
              decoding="async"
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: CARD_BORDER_RADIUS }}
              onDragStart={(e) => e.preventDefault()}
            />
          ) : kind === 'text' ? (
            isEditing ? (
              <div
                ref={editableRef}
                contentEditable
                suppressContentEditableWarning
                data-interactive="text-editor"
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
                  userSelect: 'text',
                  WebkitUserSelect: 'text',
                  outline: 'none', // Remove default focus outline
                  cursor: 'text',
                }}
                onInput={handleInput}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                onPointerDown={stopEventPropagation}
                onClick={stopEventPropagation}
                onWheelCapture={handleTextWheelCapture}
              />
              
            ) : (
              <div
                data-interactive="text"
                ref={textRef}
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
                  userSelect: panelOpen ? 'text' : 'none',
                  WebkitUserSelect: panelOpen ? 'text' : 'none' as any,
                  cursor: 'text',
                }}
                onClick={handleTextClick}
                onWheelCapture={handleTextWheelCapture}
              >
                {title ? decodeHtmlEntities(title) : <span style={{ opacity: 0.4 }}>type here</span>}
              </div>
            )
          ) : kind === 'link' ? (
            <div
              style={{ width: '100%', height: '100%', position: 'relative', borderRadius: CARD_BORDER_RADIUS }}
              onMouseEnter={(e) => {
                const hoverEl = e.currentTarget.querySelector('[data-interactive="link-hover"]') as HTMLElement
                if (hoverEl && url) {
                  hoverEl.style.opacity = '1'
                  hoverEl.style.background = 'rgba(255, 255, 255, 0.95)'
                  hoverEl.style.borderColor = 'rgba(229, 229, 229, 1)'
                }
              }}
              onMouseLeave={(e) => {
                const hoverEl = e.currentTarget.querySelector('[data-interactive="link-hover"]') as HTMLElement
                if (hoverEl && url) {
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
              {url ? (
                <a
                  data-interactive="link-hover"
                  href={url}
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
                    window.open(url, '_blank', 'noopener,noreferrer')
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
                    {title ?? url ?? ''}
                  </span>
                </a>
              ) : null}
            </div>
          ) : kind === 'media' ? (
            <div
              style={{ width: '100%', height: '100%', position: 'relative', borderRadius: CARD_BORDER_RADIUS }}
              onMouseEnter={(e) => {
                const hoverEl = e.currentTarget.querySelector('[data-interactive="media-hover"]') as HTMLElement
                if (hoverEl && url) {
                  hoverEl.style.opacity = '1'
                  hoverEl.style.background = 'rgba(255, 255, 255, 0.95)'
                  hoverEl.style.borderColor = 'rgba(229, 229, 229, 1)'
                }
              }}
              onMouseLeave={(e) => {
                const hoverEl = e.currentTarget.querySelector('[data-interactive="media-hover"]') as HTMLElement
                if (hoverEl && url) {
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
              {url ? (
                <a
                  data-interactive="media-hover"
                  href={url}
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
                    window.open(url, '_blank', 'noopener,noreferrer')
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
                    text={title ?? url ?? ''}
                    textStyle={{ flex: 1 }}
                  />
                </a>
              ) : null}
            </div>
          ) : kind === 'pdf' ? (
            <div
              style={{ width: '100%', height: '100%', position: 'relative', borderRadius: CARD_BORDER_RADIUS }}
              onMouseEnter={(e) => {
                const hoverEl = e.currentTarget.querySelector('[data-interactive="pdf-hover"]') as HTMLElement
                if (hoverEl && url) {
                  hoverEl.style.opacity = '1'
                  hoverEl.style.background = 'rgba(255, 255, 255, 0.95)'
                  hoverEl.style.borderColor = 'rgba(229, 229, 229, 1)'
                }
              }}
              onMouseLeave={(e) => {
                const hoverEl = e.currentTarget.querySelector('[data-interactive="pdf-hover"]') as HTMLElement
                if (hoverEl && url) {
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
              {url ? (
                <a
                  data-interactive="pdf-hover"
                  href={url}
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
                    window.open(url, '_blank', 'noopener,noreferrer')
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
            ref={borderRef}
            panelOpen={panelOpen}
            borderRadius={CARD_BORDER_RADIUS}
            subtleNormal={false}
          />
        </div>

        {/* Panel for shape selection */}
        {isSelected && !isTransforming && !isPointerPressed && !isEditing && Number.isFinite(numericId) && editor.getSelectedShapeIds().length === 1 ? (
          <ConnectionsPanel
            z={z}
            x={sw + gapW + (12 / z)}
            y={(8 / z)}
            widthPx={panelPx}
            maxHeightPx={panelMaxHeightPx}
            title={details?.title || title}
            author={details?.user ? { id: (details.user as any).id, username: (details.user as any).username, full_name: (details.user as any).full_name, avatar: (details.user as any).avatar } : undefined}
            createdAt={details?.createdAt}
            updatedAt={details?.updatedAt}
            blockCount={undefined}
            loading={detailsLoading}
            error={detailsError}
            connections={memoizedConnections}
            hasMore={details?.hasMoreConnections}
            onSelectChannel={handleSelectChannel}
            editor={editor}
            defaultDimensions={{ w: sw, h: sh }}
            isOpen={panelOpen}
            setOpen={setPanelOpen}
            showBlocksField={false}
            selectedChannelIds={connectionManager.selectedChannelIds}
            onChannelToggle={handleChannelToggle}
            showConnectPopover={connectionManager.showConnectPopover}
            onConnectToggle={connectionManager.handleConnectToggle}
          />
        ) : null}

        {/* Connect to Channels Popover */}
        {connectionManager.showConnectPopover && (
          <ConnectPopover
            {...connectionManager.popoverProps}
            channelsLoading={channelsLoading}
            position={{
              x: sw + 8 + 12/z, // Right edge of shape + gap
              y: 36 + 8 // Below plus button + small gap
            }}
            z={z}
          />
        )}

      </HTMLContainer>
    )
  }

  override indicator(shape: ArenaBlockShape) {
    const scale = shape.props.scale ?? 1
    return <rect width={shape.props.w * scale} height={shape.props.h * scale} rx={8} />
  }
}



