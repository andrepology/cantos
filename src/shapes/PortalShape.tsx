import { BaseBoxShapeUtil, HTMLContainer, T, resizeBox, stopEventPropagation, createShapeId, transact } from 'tldraw'
import type { TLBaseShape } from 'tldraw'
import { useEffect, useRef, useState, useMemo, useCallback, useLayoutEffect } from 'react'
import type React from 'react'
import { SHAPE_BORDER_RADIUS, SHAPE_SHADOW, PORTAL_BACKGROUND } from '../arena/constants'
import { useDeckDragOut } from '../arena/hooks/useDeckDragOut'
import { useChannelDragOut } from '../arena/hooks/useChannelDragOut'
import { useArenaChannel, useConnectedChannels, useArenaBlock, useArenaUserChannels } from '../arena/hooks/useArenaData'
import type { Card, SearchResult } from '../arena/types'
import { isInteractiveTarget } from '../arena/dom'
import { MixBlendBorder } from './MixBlendBorder'
import { getGridSize, snapToGrid, TILING_CONSTANTS } from '../arena/layout'
import { useAspectRatioCache } from '../arena/hooks/useAspectRatioCache'
import { useCollisionAvoidance, GhostOverlay } from '../arena/collisionAvoidance'
import { usePortalDimensions } from './hooks/usePortalDimensions'
import { PortalLabelSection } from './components/PortalLabelSection'
import { PortalContent } from './components/PortalContent'
import { PortalPanels } from './components/PortalPanels'

// =============================================================================
// SHARED COMPONENTS
// =============================================================================

// Debug flag for layout mode display
const DEBUG_LAYOUT_MODE = false


// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

// Stable wrapper for event handlers: keeps prop identity constant while calling latest impl
const useStableCallback = <T extends (...args: any[]) => any>(fn: T): T => {
  const ref = useRef(fn)
  useLayoutEffect(() => {
    ref.current = fn
  })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(((...args: any[]) => (ref.current as any)(...args)) as T, [])
}

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface PortalShape extends TLBaseShape<
  'portal',
  {
    w: number
    h: number
    cornerRadius?: number
    channel?: string
    userId?: number
    userName?: string
    userAvatar?: string
    // Channel preview metadata (not persisted, only for previews)
    title?: string
    authorName?: string
    updatedAt?: string
    blockCount?: number
    // Persisted deck view state (flattened for schema simplicity)
    deckAnchorId?: string
    deckAnchorFrac?: number
    deckRowX?: number
    deckColY?: number
    deckStackIndex?: number
  }
> {}

// Re-export PortalMode from hook for backwards compatibility
export type { PortalMode } from './hooks/usePortalDimensions'


// =============================================================================
// THREE D BOX SHAPE UTIL CLASS
// =============================================================================

export class PortalShapeUtil extends BaseBoxShapeUtil<PortalShape> {
  static override type = 'portal' as const

  static override props = {
    w: T.number,
    h: T.number,
    cornerRadius: T.number.optional(),
    channel: T.string.optional(),
    userId: T.number.optional(),
    userName: T.string.optional(),
    userAvatar: T.string.optional(),
    // Channel preview metadata (not persisted, only for previews)
    title: T.string.optional(),
    authorName: T.string.optional(),
    updatedAt: T.string.optional(),
    blockCount: T.number.optional(),
    deckAnchorId: T.string.optional(),
    deckAnchorFrac: T.number.optional(),
    deckRowX: T.number.optional(),
    deckColY: T.number.optional(),
    deckStackIndex: T.number.optional(),
  }

  getDefaultProps(): PortalShape['props'] {
    return {
      w: 200,
      h: 144,
      cornerRadius: SHAPE_BORDER_RADIUS,
      channel: '',
      userId: undefined,
      userName: undefined,
      userAvatar: undefined,
      // Channel preview metadata defaults
      title: undefined,
      authorName: undefined,
      updatedAt: undefined,
      blockCount: undefined,
    }
  }

  onResize(shape: PortalShape, info: any) {
    const resized = resizeBox(shape, info)
    const gridSize = getGridSize()

    return {
      ...resized,
      props: {
        ...resized.props,
        w: Math.max(TILING_CONSTANTS.minWidth, snapToGrid(resized.props.w, gridSize)),
        h: Math.max(TILING_CONSTANTS.minHeight, snapToGrid(resized.props.h, gridSize)),
      }
    }
  }

  component(shape: PortalShape) {
    // ==========================================
    // SETUP & CONFIGURATION
    // ==========================================
    const { w, h, cornerRadius, channel, userId, userName, userAvatar, deckAnchorId, deckAnchorFrac, deckRowX, deckColY, deckStackIndex } = shape.props

    const editor = this.editor
    const z = editor.getZoomLevel() || 1

    // Calculate all dimensions and modes using centralized hook
    const dimensions = usePortalDimensions(w, h, z, channel, userId)
    const {
      searchFont,
      searchPadding,
      zoomAwareFontPx,
      labelHeight,
      labelOffset,
      labelIconPx,
      sideGapPx,
      gapW,
      mode,
      hideLabelAboveShape,
      referenceDimensions,
    } = dimensions

    // ==========================================
    // REFS & STATE
    // ==========================================

    // Refs
    const faceBackgroundRef = useRef<HTMLDivElement>(null)
    const contentRef = useRef<HTMLDivElement>(null)
    const borderRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    // Local state
    const [isHovered, setIsHovered] = useState(false)
    const [panelOpen, setPanelOpen] = useState(false)
    const [deckErrorKey, setDeckErrorKey] = useState(0)
    const [isEditingLabel, setIsEditingLabel] = useState(false)

    // ==========================================
    // EDITOR STATE
    // ==========================================
    const isSelected = editor.getSelectedShapeIds().includes(shape.id)
    const inputsAny = (editor as any).inputs
    const isDragging = !!inputsAny?.isDragging
    const isResizing = !!inputsAny?.isResizing
    const isTransforming = isDragging || isResizing
    const isPointerPressed = !!inputsAny?.isPressed || !!inputsAny?.isPointerDown

    // ==========================================
    // DATA FETCHING
    // ==========================================
    const { loading, error, cards, author, title, createdAt, updatedAt } = useArenaChannel(channel)
    const { loading: chLoading, error: chError, connections } = useConnectedChannels(channel, isSelected && !isTransforming && !!channel)
    const { loading: userChannelsLoading, error: userChannelsError, channels: userChannels } = useArenaUserChannels(userId, userName)

    // ==========================================
    // CARD SELECTION STATE
    // ==========================================
    // Local selection of a card inside the deck
    const [selectedCardId, setSelectedCardId] = useState<number | null>(null)
    const [selectedCardRect, setSelectedCardRect] = useState<{ left: number; top: number; right: number; bottom: number } | null>(null)
    const selectedCard: Card | undefined = useMemo(() => {
      if (selectedCardId == null) return undefined
      return (cards || []).find((c: any) => (c as any).id === selectedCardId)
    }, [selectedCardId, cards])
    const selectedIsChannel = (selectedCard as any)?.type === 'channel'
    const selectedBlockNumericId = useMemo(() => {
      if (!selectedCard || selectedIsChannel) return undefined
      const n = Number((selectedCard as any).id)
      return Number.isFinite(n) ? n : undefined
    }, [selectedCard, selectedIsChannel])
    const { loading: selDetailsLoading, error: selDetailsError, details: selDetails } = useArenaBlock(selectedBlockNumericId, !!selectedBlockNumericId && !isTransforming)

    // ==========================================
    // PERSISTENCE
    // ==========================================
    const deckPersistQueuedRef = useRef<{ anchorId?: string; anchorFrac?: number; rowX: number; colY: number; stackIndex?: number } | null>(null)
    const deckPersistRafRef = useRef<number | null>(null)

    useEffect(() => {
      return () => {
        if (deckPersistRafRef.current != null) {
          cancelAnimationFrame(deckPersistRafRef.current)
          deckPersistRafRef.current = null
        }
      }
    }, [])

    const updateShapeProps = useCallback(
      (partial: Partial<PortalShape['props']>) => {
        transact(() => {
          const latest = editor.getShape(shape.id) as PortalShape | null
          const baseProps = latest?.props ?? shape.props
          editor.updateShape({
            id: shape.id,
            type: 'portal',
            props: { ...baseProps, ...partial },
          })
        })
      },
      [editor, shape.id, shape.props]
    )

    const handleDeckPersist = useCallback((state: { anchorId?: string; anchorFrac?: number; rowX: number; colY: number; stackIndex?: number }) => {
      deckPersistQueuedRef.current = state
      if (deckPersistRafRef.current != null) return
      deckPersistRafRef.current = requestAnimationFrame(() => {
        deckPersistRafRef.current = null
        const queued = deckPersistQueuedRef.current
        if (!queued) return
        deckPersistQueuedRef.current = null
        updateShapeProps({
          deckAnchorId: queued.anchorId,
          deckAnchorFrac: queued.anchorFrac,
          deckRowX: queued.rowX,
          deckColY: queued.colY,
          deckStackIndex: queued.stackIndex,
        })
      })
    }, [updateShapeProps])

    // ==========================================
    // EVENT HANDLERS
    // ==========================================
    const handleChannelSelect = useCallback((slug: string) => {
      // If we were dragging, don't treat this as a click
      if (lastInteractionWasDragRef.current) return
      if (!slug) return
      updateShapeProps({ channel: slug, userId: undefined, userName: undefined, userAvatar: undefined })
    }, [updateShapeProps])

    const handleUserSelect = useCallback((userId: number, userName: string, userAvatar?: string) => {
      // If we were dragging, don't treat this as a click
      if (lastInteractionWasDragRef.current) return
      if (!userId) return
      updateShapeProps({ channel: '', userId, userName, userAvatar })
    }, [updateShapeProps])

    const handleDeckSelectCard = useCallback(
      (card: Card, rect: { left: number; top: number; right: number; bottom: number }) => {
        const id = (card as any).id as number
        if (selectedCardId === id) {
          setSelectedCardId(null)
          setSelectedCardRect(null)
          return
        }
        setSelectedCardId(id)
        setSelectedCardRect(rect)
        if (isSelected) editor.setSelectedShapes([])
      },
      [selectedCardId, isSelected, editor]
    )

    const handleSelectedCardRectChange = useCallback((rect: { left: number; top: number; right: number; bottom: number } | null) => {
      setSelectedCardRect(rect)
    }, [])

    // ==========================================
    // COMPUTED VALUES
    // ==========================================
    // Memoize initialPersist to prevent prop churn during zoom/pan
    const memoizedInitialPersist = useMemo(() => ({
      anchorId: deckAnchorId,
      anchorFrac: deckAnchorFrac,
      rowX: deckRowX,
      ...(deckColY !== undefined && { colY: deckColY }),
      stackIndex: deckStackIndex,
    }), [deckAnchorId, deckAnchorFrac, deckRowX, deckColY, deckStackIndex])

    const panelConnections = useMemo(() => {
      return (connections || []).map((c: any) => ({
        id: c.id,
        title: c.title || c.slug,
        slug: c.slug,
        author: c.author?.full_name || c.author?.username,
        blockCount: c.length,
      }))
    }, [connections])

    const cardConnections = useMemo(() => {
      return (selDetails?.connections ?? []).map((c: any) => ({
        id: c.id,
        title: c.title || c.slug,
        slug: c.slug,
        author: c.user?.full_name || c.user?.username,
        blockCount: c.length,
      }))
    }, [selDetails])

    // ==========================================
    // EFFECTS
    // ==========================================
    // Close panel and clear selection when shape is deselected or during transformations
    useEffect(() => {
      if (!isSelected || isTransforming) {
        setPanelOpen(false)
        setSelectedCardId(null)
        setSelectedCardRect(null)
      }
    }, [isSelected, isTransforming])

    // Global outside-click to clear an active card selection
    useEffect(() => {
      if (selectedCardId == null) return
      const handleGlobalPointerDown = (e: PointerEvent) => {
        try {
          const el = e.target as HTMLElement | null
          if (el && typeof (el as any).closest === 'function') {
            // If the click is inside any deck card, ignore
            const insideCard = !!(el as any).closest('[data-interactive="card"]')
            if (insideCard) return
          }
          setSelectedCardId(null)
          setSelectedCardRect(null)
        } catch {}
      }
      document.addEventListener('pointerdown', handleGlobalPointerDown, true)
      return () => {
        document.removeEventListener('pointerdown', handleGlobalPointerDown, true)
      }
    }, [selectedCardId])

    // Autofocus search input on creation when no channel/user is set and shape is selected
    const didAutoEditRef = useRef(false)
    useEffect(() => {
      if (mode === 'search' && isSelected) {
        if (!didAutoEditRef.current) {
          didAutoEditRef.current = true
          setIsEditingLabel(true)
        }
      } else {
        didAutoEditRef.current = false
        // Reset editing state when shape becomes unselected
        if (!isSelected) {
          setIsEditingLabel(false)
        }
      }
    }, [isSelected, mode])

    // ==========================================
    // SEARCH HANDLING
    // ==========================================
    const applySearchSelection = useCallback((result: SearchResult | null) => {
      if (!result) {
        setIsEditingLabel(false)
        return
      }
      if (result.kind === 'channel') {
        const slug = (result as any).slug
        editor.updateShape({ id: shape.id, type: 'portal', props: { ...shape.props, channel: slug, userId: undefined, userName: undefined, userAvatar: undefined } })
        setIsEditingLabel(false)
      } else {
        editor.updateShape({ id: shape.id, type: 'portal', props: { ...shape.props, channel: '', userId: (result as any).id, userName: (result as any).username, userAvatar: (result as any).avatar ?? undefined } })
        setIsEditingLabel(false)
      }
    }, [editor, shape.id, shape.props])

    // ==========================================
    // DRAG & INTERACTION
    // ==========================================
    // Drag-out from HTML deck → controlled by reusable hook
    // Drag math is handled by useDeckDragOut; no local refs needed

    const screenToPagePoint = useCallback((clientX: number, clientY: number) => {
      const anyEditor = editor as any
      if (typeof anyEditor.screenToPage === 'function') return anyEditor.screenToPage({ x: clientX, y: clientY })
      if (typeof anyEditor.viewportScreenToPage === 'function') return anyEditor.viewportScreenToPage({ x: clientX, y: clientY })
      const inputs = (editor as any).inputs
      if (inputs?.currentPagePoint) return inputs.currentPagePoint
      const v = editor.getViewportPageBounds()
      return { x: v.midX, y: v.midY }
    }, [editor])

    // Drag-to-spawn channels using reusable hook
    const lastInteractionWasDragRef = useRef(false)
    const clearDragFlagRafRef = useRef<number | null>(null)

    const { onChannelPointerDown: onUserChanPointerDown, onChannelPointerMove: onUserChanPointerMove, onChannelPointerUp: onUserChanPointerUp } = useChannelDragOut({
      editor,
      screenToPagePoint,
      defaultDimensions: { w, h },
      onDragStart: () => {
        lastInteractionWasDragRef.current = true
      },
    })

    // Create stable wrapper functions to match ArenaUserChannelsIndex interface
    const wrappedOnUserChanPointerDownStable = useStableCallback((info: { slug: string; id: number; title: string }, e: React.PointerEvent) => {
      stopEventPropagation(e)
      onUserChanPointerDown(info.slug, e)
    })

    const wrappedOnUserChanPointerMoveStable = useStableCallback((info: { slug: string; id: number; title: string }, e: React.PointerEvent) => {
      stopEventPropagation(e)
      onUserChanPointerMove(info.slug, e)
    })

    const wrappedOnUserChanPointerUpStable = useStableCallback((info: { slug: string; id: number; title: string }, e: React.PointerEvent) => {
      stopEventPropagation(e)
      onUserChanPointerUp(info.slug, e)
      // Clear the drag flag on next frame to allow click handlers to check it first
      if (clearDragFlagRafRef.current != null) cancelAnimationFrame(clearDragFlagRafRef.current)
      clearDragFlagRafRef.current = requestAnimationFrame(() => {
        clearDragFlagRafRef.current = null
        lastInteractionWasDragRef.current = false
      })
    })

    // Cleanup RAF on unmount
    useEffect(() => {
      return () => {
        if (clearDragFlagRafRef.current != null) {
          cancelAnimationFrame(clearDragFlagRafRef.current)
          clearDragFlagRafRef.current = null
        }
      }
    }, [])

    const { getAspectRatio, ensureAspectRatio } = useAspectRatioCache()

    // Helper function to spawn a channel shape
    const spawnChannelShape = useCallback((card: Card, page: { x: number; y: number }, ctx: any) => {
      const zoom = ctx.zoom
      const size = ctx.cardSize || { w: 240, h: 240 }
      const gridSize = getGridSize()
      const id = createShapeId()
      const slugOrTerm = (card as any).slug || String(card.id)
      const off = ctx.pointerOffsetPage
      const w = snapToGrid(Math.max(1, size.w / zoom), gridSize)
      const h = snapToGrid(Math.max(1, size.h / zoom), gridSize)
      const x0 = snapToGrid(page.x - (off?.x ?? w / 2), gridSize)
      const y0 = snapToGrid(page.y - (off?.y ?? h / 2), gridSize)
      transact(() => {
        editor.createShapes([{ id, type: 'portal', x: x0, y: y0, props: { w, h, channel: slugOrTerm } } as any])
        editor.setSelectedShapes([id])
      })
      return id
    }, [editor])

    // Helper function to spawn a block shape
    const spawnBlockShape = useCallback((card: Card, page: { x: number; y: number }, ctx: any) => {
      const zoom = ctx.zoom
      const size = ctx.cardSize || { w: 240, h: 240 }
      const gridSize = getGridSize()
      const id = createShapeId()
      
      // Map Card → ArenaBlockShape props
      let props: any
      switch (card.type) {
        case 'image':
          props = { blockId: String(card.id), kind: 'image', title: card.title, imageUrl: (card as any).url }
          break
        case 'text':
          props = { blockId: String(card.id), kind: 'text', title: (card as any).content }
          break
        case 'link':
          props = { blockId: String(card.id), kind: 'link', title: card.title, imageUrl: (card as any).imageUrl, url: (card as any).url }
          break
        case 'media':
          props = { blockId: String(card.id), kind: 'media', title: card.title, imageUrl: (card as any).thumbnailUrl, url: (card as any).originalUrl, embedHtml: (card as any).embedHtml }
          break
        case 'pdf':
          props = { blockId: String(card.id), kind: 'pdf', title: card.title, imageUrl: (card as any).thumbnailUrl, url: (card as any).url }
          break
        default:
          return null
      }

      const off = ctx.pointerOffsetPage
      const blockId = String((card as any).id)
      
      // Kick off async aspect ratio measurement (non-blocking)
      try {
        ensureAspectRatio(
          blockId,
          () => {
            if ((card as any).type === 'image') return (card as any).url
            if ((card as any).type === 'media') return (card as any).thumbnailUrl
            if ((card as any).type === 'link') return (card as any).imageUrl
            if ((card as any).type === 'pdf') return (card as any).thumbnailUrl
            return undefined
          },
          () => {
            if ((card as any).type === 'media') return 16 / 9
            return null
          }
        )
      } catch {}

      // Prefer measuredAspect captured at pointer down -> then cache -> then fallback
      const ratio = (ctx as any).measuredAspect || getAspectRatio(blockId) || (((card as any).type === 'media') ? 16 / 9 : null)

      // Choose constraining dimension: for landscape use width, for portrait use height
      const constrainingDim = ratio && ratio >= 1 ? size.w / zoom : size.h / zoom
      const tileSide = snapToGrid(Math.max(1, constrainingDim), gridSize)
      let w = tileSide
      let h = tileSide
      if (ratio && Number.isFinite(ratio) && ratio > 0) {
        if (ratio >= 1) {
          // Landscape: fit width to tile side, scale height by ratio
          w = tileSide
          h = snapToGrid(Math.max(1, Math.round(tileSide / Math.max(0.0001, ratio))), gridSize)
        } else {
          // Portrait: fit height to tile side, scale width by ratio
          h = tileSide
          w = snapToGrid(Math.max(1, Math.round(tileSide * ratio)), gridSize)
        }
      }
      const x0 = snapToGrid(page.x - (off?.x ?? w / 2), gridSize)
      const y0 = snapToGrid(page.y - (off?.y ?? h / 2), gridSize)
      props = { ...props, w, h, aspectRatio: ratio && Number.isFinite(ratio) && ratio > 0 ? ratio : undefined }
      transact(() => {
        editor.createShapes([{ id, type: 'arena-block', x: x0, y: y0, props } as any])
        editor.setSelectedShapes([id])
      })
      return id
    }, [editor, getAspectRatio, ensureAspectRatio])

    const drag = useDeckDragOut({
      editor,
      thresholdPx: 6,
      screenToPagePoint,
      spawnFromCard: (card, page, ctx) => {
        if (card.type === 'channel') {
          return spawnChannelShape(card, page, ctx)
        } else {
          return spawnBlockShape(card, page, ctx)
        }
      },
      updatePosition: (id, page, ctx) => {
        const size = ctx.cardSize || { w: 240, h: 240 }
        const zoom = ctx.zoom
        const gridSize = getGridSize()
        const w = snapToGrid(Math.max(1, size.w / zoom), gridSize)
        const h = snapToGrid(Math.max(1, size.h / zoom), gridSize)
        const shape = editor.getShape(id as any)
        if (!shape) return
        const off = ctx.pointerOffsetPage
        const x0 = snapToGrid(page.x - (off?.x ?? w / 2), gridSize)
        const y0 = snapToGrid(page.y - (off?.y ?? h / 2), gridSize)
        editor.updateShapes([{ id: id as any, type: (shape as any).type as any, x: x0, y: y0 } as any])
      },
      onStartDragFromSelectedCard: (card) => {
        if (selectedCardId === (card as any).id) {
          setSelectedCardId(null)
          setSelectedCardRect(null)
        }
      },
    })

    // Create stable callback versions of handlers to prevent prop churn
    const onCardPointerDownStable = useStableCallback(drag.onCardPointerDown)
    const onCardPointerMoveStable = useStableCallback(drag.onCardPointerMove)
    const onCardPointerUpStable = useStableCallback(drag.onCardPointerUp)
    const handleDeckSelectCardStable = useStableCallback(handleDeckSelectCard)
    const handleSelectedCardRectChangeStable = useStableCallback(handleSelectedCardRectChange)
    const handleDeckPersistStable = useStableCallback(handleDeckPersist)

    // ==========================================
    // COLLISION AVOIDANCE
    // ==========================================
    // Get predictedLayoutMode from dimensions for DEBUG display
    const predictedLayoutMode = dimensions.predictedLayoutMode

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
        applyEndOfGestureCorrection(currentBounds)
      }
    }, [isSelected, isTransforming, editor, shape, applyEndOfGestureCorrection])

    // ==========================================
    // RENDER
    // ==========================================
    return (
      <HTMLContainer
        style={{
          pointerEvents: 'all',
          width: w,
          height: h,
          overflow: 'visible',
        }}
        onPointerDown={(e) => {
          // If user interacts with an interactive element, block canvas handling.
          if (isInteractiveTarget(e.target)) {
            stopEventPropagation(e)
            return
          }
          // Otherwise allow bubbling so the editor can select/drag the shape.
        }}
        onPointerUp={(e) => {
          // Only stop propagation for interactive elements
          if (isInteractiveTarget(e.target)) {
            stopEventPropagation(e)
          }
        }}
        onDoubleClick={(e) => {
          stopEventPropagation(e)
        }}
      >
        {DEBUG_LAYOUT_MODE && (
          <div
            style={{
              position: 'absolute',
              top: -24,
              left: 0,
              width: w,
              height: 20,
              pointerEvents: 'none',
              fontSize: '10px',
              fontFamily: 'monospace',
              color: 'rgba(255,0,0,0.8)',
              background: 'rgba(255,255,255,0.9)',
              border: '1px solid rgba(255,0,0,0.3)',
              borderRadius: '2px',
              padding: '2px 4px',
              zIndex: 1000,
            }}
          >
            {Math.round(w)}×{Math.round(h)} | {predictedLayoutMode}
          </div>
        )}
        <PortalLabelSection
          visible={(!!channel || !!userId) && !hideLabelAboveShape}
          labelHeight={labelHeight}
          labelOffset={labelOffset}
          w={w}
          z={z}
          channel={channel}
          userId={userId}
          userName={userName}
          userAvatar={userAvatar}
          title={title}
          author={author}
          isSelected={isSelected}
          isEditingLabel={isEditingLabel}
          setIsEditingLabel={setIsEditingLabel}
          onSearchSelection={applySearchSelection}
          handleUserSelect={handleUserSelect}
          zoomAwareFontPx={zoomAwareFontPx}
          labelIconPx={labelIconPx}
          editor={editor}
          shapeId={shape.id}
          inputRef={inputRef}
        />
        {/* Border effect */}
        <MixBlendBorder
          ref={borderRef}
          isHovered={isHovered}
          panelOpen={panelOpen}
          borderRadius={cornerRadius ?? 0}
          transformOrigin="top center"
          zIndex={5}
          subtleNormal={true}
        />

        {/* Draw ghost overlay behind the main shape */}
        <GhostOverlay
          ghostCandidate={ghostCandidate}
          currentBounds={editor.getShapePageBounds(shape) ?? null}
          borderRadius={cornerRadius ?? 0}
          visible={isSelected && isTransforming}
        />
        {/* Face background */}
        <div
          ref={faceBackgroundRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            background: PORTAL_BACKGROUND,
            boxShadow: `${
              SHAPE_SHADOW
            }${
              panelOpen
                ? ', 0 8px 20px rgba(0,0,0,.1)'
                : ''
            }`,
            borderRadius: `${cornerRadius ?? 0}px`,
            boxSizing: 'border-box',
            zIndex: 3,
          }}
        />
        {/* Content layer - flat, no transforms */}
        <PortalContent
          mode={mode}
          predictedLayoutMode={dimensions.predictedLayoutMode}
          w={w}
          h={h}
          cornerRadius={cornerRadius ?? 0}
          searchFont={searchFont}
          searchPadding={searchPadding}
          channel={channel}
          loading={loading}
          error={error}
          cards={cards}
          title={title}
          deckErrorKey={deckErrorKey}
          setDeckErrorKey={setDeckErrorKey}
          referenceDimensions={referenceDimensions}
          userId={userId}
          userName={userName}
          userAvatar={userAvatar}
          userChannelsLoading={userChannelsLoading}
          userChannelsError={userChannelsError}
          userChannels={userChannels}
          isEditingLabel={isEditingLabel}
          onSearchSelection={applySearchSelection}
          selectedCardId={selectedCardId}
          onCardPointerDown={onCardPointerDownStable}
          onCardPointerMove={onCardPointerMoveStable}
          onCardPointerUp={onCardPointerUpStable}
          onSelectCard={handleDeckSelectCardStable}
          onSelectedCardRectChange={handleSelectedCardRectChangeStable}
          onDeckPersist={handleDeckPersistStable}
          memoizedInitialPersist={memoizedInitialPersist}
          onChannelSelect={handleChannelSelect}
          onUserChannelPointerDown={wrappedOnUserChanPointerDownStable}
          onUserChannelPointerMove={wrappedOnUserChanPointerMoveStable}
          onUserChannelPointerUp={wrappedOnUserChanPointerUpStable}
          isSelected={isSelected}
          editor={editor}
          shapeId={shape.id}
          contentRef={contentRef}
          faceBackgroundRef={faceBackgroundRef}
          borderRef={borderRef}
          isHovered={isHovered}
          setIsHovered={setIsHovered}
          panelOpen={panelOpen}
          setPanelOpen={setPanelOpen}
          setSelectedCardId={setSelectedCardId}
          setSelectedCardRect={setSelectedCardRect}
        />

        {/* Panels for shape and card selection */}
        <PortalPanels
          z={z}
          w={w}
          h={h}
          sideGapPx={sideGapPx}
          gapW={gapW}
          editor={editor}
          panelOpen={panelOpen}
          setPanelOpen={setPanelOpen}
          isSelected={isSelected}
          isTransforming={isTransforming}
          isPointerPressed={isPointerPressed}
          isSingleShapeSelected={editor.getSelectedShapeIds().length === 1}
          channel={channel}
          title={title}
          author={author}
          createdAt={createdAt}
          updatedAt={updatedAt}
          cards={cards}
          loading={loading}
          error={error}
          chLoading={chLoading}
          chError={chError}
          panelConnections={panelConnections}
          selectedCardId={selectedCardId}
          selectedCard={selectedCard}
          selectedCardRect={selectedCardRect}
          selectedBlockNumericId={selectedBlockNumericId}
          selDetails={selDetails}
          selDetailsLoading={selDetailsLoading}
          selDetailsError={selDetailsError}
          cardConnections={cardConnections}
          onSelectChannel={handleChannelSelect}
          shapeId={shape.id}
          shapeProps={shape.props}
        />

      </HTMLContainer>
    )
  }

  // ==========================================
  // INDICATOR
  // ==========================================
  indicator(shape: PortalShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={shape.props.cornerRadius ?? 0} />
  }
}


