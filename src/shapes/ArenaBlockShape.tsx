import { HTMLContainer, Rectangle2d, ShapeUtil, T, resizeBox, resizeScaled, stopEventPropagation, useEditor, createShapeId, transact } from 'tldraw'
import type { TLBaseShape, TLResizeInfo } from 'tldraw'
import { getGridSize, snapToGrid, TILING_CONSTANTS } from '../arena/layout'
import { shouldDragOnWhitespaceInText, decodeHtmlEntities, isOverTextAtPoint } from '../arena/dom'
import { memo, useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react'
import type { WheelEvent as ReactWheelEvent } from 'react'
import { useArenaBlock } from '../arena/hooks/useArenaData'
import { useAspectRatioCache } from '../arena/hooks/useAspectRatioCache'
import { computeResponsiveFont, computePackedFont, computeAsymmetricTextPadding } from '../arena/typography'
import { ConnectionsPanel } from '../arena/ConnectionsPanel'
import { ArenaUserChannelsIndex } from '../arena/ArenaUserChannelsIndex'
import { useSessionUserChannels, fuzzySearchChannels } from '../arena/userChannelsStore'
import type { ConnectedChannel, UserChannelListItem } from '../arena/types'
import { useCollisionAvoidance, GhostOverlay } from '../arena/collisionAvoidance'
import { CARD_BORDER_RADIUS, SHAPE_SHADOW, SHAPE_BACKGROUND } from '../arena/constants'
import { OverflowCarouselText } from '../arena/OverflowCarouselText'
import { MixBlendBorder } from './MixBlendBorder'

// Connect Popover Component
function ConnectPopover({
  searchQuery,
  setSearchQuery,
  filteredChannels,
  channelsLoading,
  selectedChannelIds,
  onChannelToggle,
  shapeBounds,
  z
}: {
  searchQuery: string
  setSearchQuery: (query: string) => void
  filteredChannels: UserChannelListItem[]
  channelsLoading: boolean
  selectedChannelIds: Set<number>
  onChannelToggle: (channelId: number) => void
  shapeBounds: { x: number; y: number; w: number; h: number }
  z: number
}) {
  // Fixed size regardless of zoom (like ConnectionsPanel)
  const popoverWidth = 280
  const popoverHeight = 320

  // Position below the plus button (which is at y + 36)
  const popoverX = shapeBounds.w + 8 + 12/z // Right edge of shape + gap
  const popoverY = 36 + 8 // Below plus button + small gap

  // Auto-focus the input when popover opens
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  return (
    <div
      data-interactive="connect-popover"
      style={{
        position: 'absolute',
        left: popoverX,
        top: popoverY,
        width: popoverWidth,
        height: popoverHeight,
        overflow: 'hidden',
        background: '#ffffff',
        borderRadius: 8,
        boxShadow: `0 12px 32px rgba(0,0,0,.12), 0 3px 8px rgba(0,0,0,.06), inset 0 0 0 1px rgba(0,0,0,.06)`,
        zIndex: 1001, // Above connections panel
        pointerEvents: 'auto',
      }}
      onPointerDown={stopEventPropagation}
      onPointerMove={(e) => {
        if (e.buttons > 0) {
          stopEventPropagation(e)
        }
      }}
      onPointerUp={stopEventPropagation}
    >
      {/* Search input - large, faint, behind rows */}
      <input
        ref={inputRef}
        type="text"
        placeholder=""
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={stopEventPropagation}
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          width: 'calc(100% - 16px)',
          fontSize: 32,
          fontWeight: 700,
          color: 'rgba(0,0,0,0.3)',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          pointerEvents: 'auto',
          zIndex: 2,
          fontFamily: 'inherit',
          animation: searchQuery ? 'none' : 'fadeInOut 3s ease-in-out infinite'
        }}
        onPointerDown={stopEventPropagation}
        onClick={stopEventPropagation}
      />

      {/* Placeholder text when empty */}
      {!searchQuery && (
        <div style={{
          position: 'absolute',
          top: 8,
          left: 8,
          fontSize: 32,
          fontWeight: 300,
          color: 'rgba(0,0,0,0.08)',
          pointerEvents: 'none',
          zIndex: 1,
          userSelect: 'none',
          animation: 'fadeInOut 2s ease-in-out infinite'
        }}>
          type to search
        </div>
      )}

      <style>{`
        @keyframes fadeInOut {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
      `}</style>

      {/* Use ArenaUserChannelsIndex with checkbox enabled - it handles its own virtualization */}
      <ArenaUserChannelsIndex
        loading={channelsLoading}
        error={null}
        channels={filteredChannels}
        width={popoverWidth}
        height={320 - 60}  // Subtract space for input area
        padding={12}
        compact={false}
        showCheckbox={true}
        selectedChannelIds={selectedChannelIds}
        onChannelToggle={onChannelToggle}
      />
    </div>
  )
}


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

    return {
      ...resized,
      props: {
        ...resized.props,
        w,
        h,
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
    const [isHovered, setIsHovered] = useState(false)
    const [selectedChannelIds, setSelectedChannelIds] = useState<Set<number>>(new Set())

    // Connect popover state
    const [showConnectPopover, setShowConnectPopover] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')

  // Close connect popover when main panel opens
  useEffect(() => {
    if (panelOpen) {
      setShowConnectPopover(false)
    }
  }, [panelOpen])

  // Close connect popover when shape is deselected
  useEffect(() => {
    if (!isSelected) {
      setShowConnectPopover(false)
    }
  }, [isSelected])

  // Close connect popover when clicking outside of it
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (showConnectPopover && !(e.target as Element).closest('[data-interactive="connect-popover"]') && !(e.target as Element).closest('[data-interactive="connect-button"]')) {
      setShowConnectPopover(false)
    }
  }, [showConnectPopover])


    const textRef = useRef<HTMLDivElement | null>(null)

    // Text editing state
    const [isEditing, setIsEditing] = useState(false)
    const editableRef = useRef<HTMLDivElement | null>(null)

    // Auto-enter edit mode for new blocks (empty title)
    useEffect(() => {
      if (kind === 'text' && (!title || title.trim() === '')) {
        setIsEditing(true)
      }
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

    // Bring shape to front when panel opens or selected
    useEffect(() => {
      if (panelOpen) {
        editor.bringToFront([shape.id])
      }
    }, [panelOpen, editor, shape.id])

    // Collision avoidance system
    const { computeGhostCandidate, applyEndOfGestureCorrection } = useCollisionAvoidance({
      editor,
      shapeId: shape.id,
      gap: TILING_CONSTANTS.gap,
      gridSize: getGridSize(),
    })

    // Ghost candidate while transforming
    const ghostCandidate = useMemo(() => {
      if (!isSelected || !isTransforming) return null
      const bounds = editor.getShapePageBounds(shape)
      if (!bounds) return null
      const currentBounds = { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }
      return computeGhostCandidate(currentBounds)
    }, [editor, shape, isSelected, isTransforming, computeGhostCandidate])

    // End-of-gesture correction (translate/resize)
    const wasTransformingRef = useRef(false)
    useEffect(() => {
      if (!isSelected) {
        wasTransformingRef.current = false
        return
      }
      if (isTransforming) {
        wasTransformingRef.current = true
        return
      }
      // Transitioned from transforming -> not transforming
      if (wasTransformingRef.current) {
        wasTransformingRef.current = false
        const bounds = editor.getShapePageBounds(shape)
        if (!bounds) return
        const currentBounds = { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }
        applyEndOfGestureCorrection(currentBounds) // Disabled collision avoidance grid snapping
      }
    }, [isSelected, isTransforming, editor, shape, applyEndOfGestureCorrection])

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
      }))
    }, [details?.connections])

    // User channels for connect popover
    const { channels: userChannels, loading: channelsLoading } = useSessionUserChannels({ autoFetch: false })

    // Filtered channels for connect popover
    const filteredChannels = useMemo(() =>
      fuzzySearchChannels(userChannels, searchQuery),
      [userChannels, searchQuery]
    )

    const handleTextWheelCapture = useCallback((e: ReactWheelEvent<HTMLDivElement>) => {
      if (e.ctrlKey) return
      e.stopPropagation()
    }, [])

    // Text editing handlers
    const handleTextClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      if (isEditing) return // Already editing

      const hasContent = title && title.trim() !== ''

      // Check if clicking on whitespace/padding (allow drag) vs text content (enter edit)
      const isClickingWhitespace = shouldDragOnWhitespaceInText(e.target, e.clientX, e.clientY, textRef.current)
      
      if (isClickingWhitespace) {
        // Clicking on padding - allow drag, don't enter edit mode
        return
      }

      // Check if over actual text content
      const overText = isOverTextAtPoint(e.clientX, e.clientY)
      
      // If no content and not over text, we're clicking on empty space - enter edit mode anyway
      // If has content but not over text, allow selection/drag
      if (!overText && hasContent) {
        // Clicking on empty space in a block with content - don't enter edit
        return
      }

      e.stopPropagation() // Prevent shape selection when entering edit mode
      e.preventDefault()

      // Ensure shape is selected before entering edit mode
      if (!isSelected) {
        editor.setSelectedShapes([shape.id])
      }

      setIsEditing(true)

      // Position caret at click location after contentEditable is ready
      setTimeout(() => {
        if (!editableRef.current) return

        // Get range from click point (Chromium) or position (Firefox)
        const range = document.caretRangeFromPoint?.(e.clientX, e.clientY) ||
                      (document as any).caretPositionFromPoint?.(e.clientX, e.clientY)

        if (range) {
          const selection = window.getSelection()
          selection?.removeAllRanges()

          if ('getClientRects' in range) {
            // Range (Chromium)
            selection?.addRange(range)
          } else {
            // CaretPosition (Firefox) - create range from position
            const newRange = document.createRange()
            newRange.setStart(range.offsetNode, range.offset)
            newRange.setEnd(range.offsetNode, range.offset)
            selection?.addRange(newRange)
          }
        }

        editableRef.current.focus()
      }, 0)
    }, [isEditing, isSelected, editor, shape.id, title])

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
      setSelectedChannelIds(prev => {
        const next = new Set(prev)
        if (next.has(channelId)) {
          next.delete(channelId)
        } else {
          next.add(channelId)
        }
        return next
      })
    }, [])

    const handleConnectToggle = useCallback(() => {
      setShowConnectPopover(prev => !prev)
    }, [])

    const handleConnectChannelToggle = useCallback((channelId: number) => {
      setSelectedChannelIds(prev => {
        const next = new Set(prev)
        if (next.has(channelId)) {
          next.delete(channelId)
        } else {
          next.add(channelId)
        }
        return next
      })
    }, [])

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
          boxShadow: SHAPE_SHADOW,
          border: 'none',
          borderRadius: CARD_BORDER_RADIUS,
          transition: 'box-shadow 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          overflow: 'visible',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          visibility: hidden ? 'hidden' : 'visible',
        }}
        onClick={(e) => {
          // First handle container click (connect popover)
          if (showConnectPopover && !(e.target as Element).closest('[data-interactive="connect-popover"]') && !(e.target as Element).closest('[data-interactive="connect-button"]')) {
            setShowConnectPopover(false)
          }

          // Then handle text-specific click logic
          if (kind === 'text') {
            // Check if user is currently selecting text
            const selection = window.getSelection()
            const hasSelection = selection && selection.toString().length > 0
            if (hasSelection) {
              return
            }

            // If clicking on text in view mode, let the text's click handler run
            if (!isEditing) {
              const target = e.target as HTMLElement
              const isTextClick = target.closest('[data-interactive="text"]') !== null
              if (isTextClick) {
                // Don't stop propagation - let handleTextClick run
                return
              }
            }
          }
          e.stopPropagation()
          e.preventDefault()
          editor.setSelectedShapes([shape.id])
        }}
        onPointerDown={(e) => {
          if (kind !== 'text') return

          // When editing, always prevent canvas interactions
          if (isEditing) {
            e.stopPropagation()
            return
          }

          const textEl = textRef.current
          const isClickingWhitespace = shouldDragOnWhitespaceInText(e.target, e.clientX, e.clientY, textEl)

          // Check if focus mode is active (panel is open)
          const hasOpenPanel = document.querySelector('[data-interactive="connections-panel"]') !== null

          if (hasOpenPanel) {
            // In focus mode: only allow dragging on whitespace to preserve text selection
            if (!isClickingWhitespace) {
              e.stopPropagation()
            }
          } else {
            // In normal mode: prevent drag on text content to enable click-to-edit
            const hasContent = title && title.trim() !== ''
            const overText = isOverTextAtPoint(e.clientX, e.clientY)

            // Stop propagation (prevent drag) if:
            // - Clicking on text content, OR
            // - Clicking on empty block (no content and not on padding)
            if (!isClickingWhitespace && (overText || !hasContent)) {
              e.stopPropagation()
            }
            // Otherwise allow drag (on padding or empty space in populated block)
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          // Set selection to this shape
          editor.setSelectedShapes([shape.id])
          // Always open panel since this shape is now the only selected one
          setPanelOpen(true)
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            borderRadius: CARD_BORDER_RADIUS,
            overflow: 'hidden',
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

        {/* Mix-blend-mode border effect */}
        <MixBlendBorder
          isHovered={isHovered}
          panelOpen={panelOpen}
          borderRadius={CARD_BORDER_RADIUS}
          subtleNormal={false}
        />

        {/* Draw ghost overlay behind the main shape */}
        <GhostOverlay
          ghostCandidate={ghostCandidate}
          currentBounds={editor.getShapePageBounds(shape) ?? null}
          borderRadius={CARD_BORDER_RADIUS}
          visible={isSelected && isTransforming}
        />

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
            selectedChannelIds={selectedChannelIds}
            onChannelToggle={handleChannelToggle}
            showConnectPopover={showConnectPopover}
            onConnectToggle={handleConnectToggle}
          />
        ) : null}

        {/* Connect to Channels Popover */}
        {showConnectPopover && (
          <ConnectPopover
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            filteredChannels={filteredChannels}
            channelsLoading={channelsLoading}
            selectedChannelIds={selectedChannelIds}
            onChannelToggle={handleConnectChannelToggle}
            shapeBounds={{ x: shape.x, y: shape.y, w: sw, h: sh }}
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



