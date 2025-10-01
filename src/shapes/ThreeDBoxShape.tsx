import { BaseBoxShapeUtil, HTMLContainer, T, stopEventPropagation, createShapeId, transact } from 'tldraw'
import type { TLBaseShape } from 'tldraw'
import { useEffect, useRef, useState, useMemo, useCallback, useLayoutEffect, useDeferredValue } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { ArenaDeck } from '../arena/Deck'
import { ErrorBoundary } from '../arena/components/ErrorBoundary'
import { invalidateArenaChannel } from '../arena/api'
import { calculateReferenceDimensions, type ReferenceDimensions, type LayoutMode } from '../arena/layout'
import { useDeckDragOut } from '../arena/hooks/useDeckDragOut'
import { useChannelDragOut } from '../arena/hooks/useChannelDragOut'
import { ArenaUserChannelsIndex } from '../arena/ArenaUserChannelsIndex'
import { useArenaChannel, useArenaSearch, useConnectedChannels, useArenaBlock } from '../arena/hooks/useArenaChannel'
import type { Card, SearchResult } from '../arena/types'
import { ArenaSearchPanel } from '../arena/ArenaSearchResults'
import { ConnectionsPanel } from '../arena/ConnectionsPanel'
import { Avatar } from '../arena/icons'
import { isInteractiveTarget } from '../arena/dom'
import { LoadingPulse } from './LoadingPulse'
import { getGridSize, snapToGrid } from '../arena/layout'

// Shared types for ThreeDBoxShape components

// Debug flag for layout mode display
const DEBUG_LAYOUT_MODE = false

export interface ThreeDBoxShape extends TLBaseShape<
  '3d-box',
  {
    w: number
    h: number
    tilt?: number
    shadow?: boolean
    cornerRadius?: number
    channel?: string
    userId?: number
    userName?: string
    userAvatar?: string
    // Persisted deck view state (flattened for schema simplicity)
    deckAnchorId?: string
    deckAnchorFrac?: number
    deckRowX?: number
    deckColY?: number
    deckStackIndex?: number
  }
> {}

export type ThreeDBoxMode = 'search' | 'channel' | 'user'

export interface ThreeDBoxVisualProps {
  w: number
  h: number
  tilt?: number
  shadow?: boolean
  cornerRadius?: number
  editor: any // TLDraw editor instance
  isSelected: boolean
  popped?: boolean
}

export interface ThreeDBoxDimensions {
  width: number
  height: number
  zoom: number
  baseFontPx: number
  zoomAwareFontPx: number
  labelHeight: number
  labelOffset: number
  sideGapPx: number
  gapW: number
  labelIconPx: number
  profileIconPx: number
}

export interface ThreeDBoxContentProps {
  mode: ThreeDBoxMode
  channel?: string
  userId?: number
  userName?: string
  userAvatar?: string
  title?: string
  authorName?: string
  authorAvatar?: string
  labelPrimary: string
}

export interface ThreeDBoxSearchProps {
  labelQuery: string
  setLabelQuery: (query: string) => void
  isEditingLabel: boolean
  setIsEditingLabel: (editing: boolean) => void
  highlightedIndex: number
  setHighlightedIndex: (index: number) => void
  results: any[]
  hasResults: boolean
  onSearchSelection: (result: any) => void
  mode: ThreeDBoxMode
  isSelected: boolean
  editor: any
}

export interface ThreeDBoxCardSelection {
  selectedCardId: number | null
  setSelectedCardId: (id: number | null) => void
  selectedCardRect: { left: number; top: number; right: number; bottom: number } | null
  setSelectedCardRect: (rect: { left: number; top: number; right: number; bottom: number } | null) => void
  selectedCard: any
  selectedBlockNumericId?: number
}

export interface ThreeDBoxDragOutProps {
  editor: any
  shape: ThreeDBoxShape
  selectedCardId: number | null
  setSelectedCardId: (id: number | null) => void
  setSelectedCardRect: (rect: { left: number; top: number; right: number; bottom: number } | null) => void
}

// Utility functions for ThreeDBoxShape components
export function calculateThreeDBoxDimensions(w: number, h: number, z: number): ThreeDBoxDimensions {
  const sideGapPx = 8
  const gapW = sideGapPx / z
  const baseFontPx = 12
  const zoomAwareFontPx = baseFontPx / z
  const labelHeight = zoomAwareFontPx * 1.5 + 6
  const labelOffset = 4 / z
  const labelIconPx = Math.max(1, Math.floor(zoomAwareFontPx))
  const profileIconPx = labelIconPx

  return {
    width: w,
    height: h,
    zoom: z,
    baseFontPx,
    zoomAwareFontPx,
    labelHeight,
    labelOffset,
    sideGapPx,
    gapW,
    labelIconPx,
    profileIconPx,
  }
}

export function determineThreeDBoxMode(channel?: string, userId?: number): ThreeDBoxMode {
  const hasTarget = (!!channel && channel.trim() !== '') || !!userId
  return !hasTarget ? 'search' : (channel ? 'channel' : 'user')
}

// ThreeDBoxRenderer - Handles 3D visual effects and perspective container
export function ThreeDBoxRenderer({
  w,
  h,
  tilt,
  shadow,
  cornerRadius,
  editor,
  isSelected,
  children,
  popped = true,
}: ThreeDBoxVisualProps & { children: React.ReactNode }) {
  const faceRef = useRef<HTMLDivElement>(null)
  const shadowRef = useRef<HTMLDivElement>(null)

  // 3D transform effect
  useEffect(() => {
    const face = faceRef.current
    const shade = shadowRef.current
    if (!face || !shade) return

    if (popped) {
      face.style.transform = `rotateX(0deg) translateY(0px) translateZ(0px)`
      shade.style.opacity = shadow ? `0.35` : `0`
    } else {
      face.style.transform = `rotateX(${Math.max(10, Math.min(60, tilt ?? 20))}deg)`
      shade.style.opacity = shadow ? `0.5` : `0`
    }
  }, [popped, tilt, shadow])

  // Perspective settings derived from viewport & shape bounds
  const vpb = editor.getViewportPageBounds()
  const spb = editor.getShapePageBounds({ id: 'temp', type: '3d-box', x: 0, y: 0, props: { w, h } } as any)
  const px = vpb.midX - spb.midX + spb.w / 2
  const py = vpb.midY - spb.midY + spb.h / 2

  return (
    <HTMLContainer
      style={{
        pointerEvents: 'all',
        width: w,
        height: h,
        perspective: `${Math.max(vpb.w, vpb.h)}px`,
        perspectiveOrigin: `${px}px ${py}px`,
        overflow: 'visible',
      }}
      onDoubleClick={(e) => {
        stopEventPropagation(e)
      }}
    >
      <div
        ref={shadowRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          transition: 'all .5s',
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          backgroundColor: 'rgba(0,0,0,.5)',
          borderRadius: `${cornerRadius ?? 0}px`,
        }}
      />
      <div
        ref={faceRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'auto',
          transition: 'all .5s',
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'stretch',
          padding: 0,
          overflow: 'hidden',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif',
          color: '#333',
          fontSize: 16,
          background: `#fff`,
          border: '1px solid rgba(0,0,0,.05)',
          boxShadow: isSelected ? '0 4px 12px rgba(0,0,0,.04)' : 'none',
          borderRadius: `${cornerRadius ?? 0}px`,
          transformOrigin: 'top center',
        }}
      >
        {children}
      </div>
    </HTMLContainer>
  )
}

// SearchInterface - Handles search input, autocomplete, and results display
export function SearchInterface({
  labelQuery,
  setLabelQuery,
  isEditingLabel,
  setIsEditingLabel,
  highlightedIndex,
  setHighlightedIndex,
  results,
  hasResults,
  onSearchSelection,
  mode,
  isSelected,
  editor,
  variant = 'label', // 'label' or 'content' for different styling
}: ThreeDBoxSearchProps & { variant?: 'label' | 'content' }) {
  const inputRef = useRef<any>(null)
  const resultsContainerRef = useRef<HTMLDivElement>(null)

  // Reset highlight as query / results change
  useEffect(() => {
    setHighlightedIndex(results.length > 0 ? 0 : -1)
  }, [labelQuery, results.length, setHighlightedIndex])

  // Keep highlighted row in view
  useEffect(() => {
    const container = resultsContainerRef.current
    if (!container) return
    const el = container.querySelector(`[data-index="${highlightedIndex}"]`)
    if (el && 'scrollIntoView' in el) {
      ;(el as HTMLElement).scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex])

  // Autofocus search input on creation when no channel/user is set and shape is selected
  const didAutoEditRef = useRef(false)
  useEffect(() => {
    if (didAutoEditRef.current) return
    if (mode === 'search' && isSelected && variant === 'content') {
      didAutoEditRef.current = true
      setIsEditingLabel(true)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [isSelected, mode, variant, setIsEditingLabel])

  // Auto-resize when using the content variant (textarea)
  useLayoutEffect(() => {
    if (variant !== 'content') return
    const el = inputRef.current as HTMLTextAreaElement | null
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [labelQuery, variant])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (results.length === 0) return
      const newIndex = highlightedIndex < 0 ? 0 : (highlightedIndex + 1) % results.length
      setHighlightedIndex(newIndex)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (results.length === 0) return
      const newIndex = highlightedIndex <= 0 ? results.length - 1 : highlightedIndex - 1
      setHighlightedIndex(newIndex)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const chosen = highlightedIndex >= 0 && highlightedIndex < results.length ? results[highlightedIndex] : null
      onSearchSelection(chosen)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setIsEditingLabel(false)
    }
  }

  if (!isEditingLabel) {
    return null
  }

  const isLabelVariant = variant === 'label'

  return (
    <div
      data-interactive="search"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: isLabelVariant ? '0' : '12px 10px 10px 10px',
      }}
      onPointerDown={(e) => stopEventPropagation(e)}
      onPointerMove={(e) => stopEventPropagation(e)}
      onPointerUp={(e) => stopEventPropagation(e)}
      onWheel={(e) => { e.stopPropagation() }}
    >
      <Popover.Root open={isSelected && isEditingLabel && hasResults}>
        <Popover.Anchor asChild>
          {isLabelVariant ? (
            <input
              data-interactive="input"
              ref={inputRef}
              value={labelQuery}
              onChange={(e) => setLabelQuery(e.target.value)}
              placeholder={'Change…'}
              onPointerDown={(e) => stopEventPropagation(e)}
              onPointerMove={(e) => stopEventPropagation(e)}
              onPointerUp={(e) => stopEventPropagation(e)}
              onFocus={() => { if (!isSelected) editor.setSelectedShapes(['shape-id']) }}
              onWheel={(e) => { e.stopPropagation() }}
              onKeyDown={handleKeyDown}
              style={{
                fontFamily: 'inherit',
                fontSize: 'inherit',
                fontWeight: 600,
                letterSpacing: '-0.0125em',
                color: hasResults ? 'var(--color-text)' : 'rgba(0,0,0,.45)',
                border: 'none',
                borderRadius: 0,
                padding: '2px 4px',
                background: 'transparent',
                width: 'auto',
                minWidth: 60,
                boxSizing: 'content-box',
                outline: 'none',
                display: 'flex',
                alignItems: 'center',
              }}
            />
          ) : (
            <textarea
              data-interactive="input"
              ref={inputRef}
              value={labelQuery}
              rows={1}
              onChange={(e) => setLabelQuery(e.target.value)}
              placeholder={'Search Are.na'}
              onPointerDown={(e) => stopEventPropagation(e)}
              onPointerMove={(e) => stopEventPropagation(e)}
              onPointerUp={(e) => stopEventPropagation(e)}
              onFocus={() => { if (!isSelected) editor.setSelectedShapes(['shape-id']) }}
              onWheel={(e) => { e.stopPropagation() }}
              onKeyDown={handleKeyDown}
              style={{
                fontFamily: 'inherit',
                fontSize: '22px',
                fontWeight: 700,
                letterSpacing: '-0.015em',
                color: hasResults ? 'var(--color-text)' : 'rgba(0,0,0,.45)',
                border: 'none',
                borderRadius: 0,
                padding: '6px 0 6px 12px',
                background: 'transparent',
                width: '100%',
                boxSizing: 'border-box',
                outline: 'none',
                resize: 'none',
                overflow: 'hidden',
                lineHeight: 1.25,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            />
          )}
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            forceMount
            side="bottom"
            align="start"
            sideOffset={4}
            avoidCollisions={false}
            onOpenAutoFocus={(e) => e.preventDefault()}
            style={{
              width: 220,
              maxHeight: 220,
              background: '#fff',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              border: '1px solid #e6e6e6',
              borderRadius: 4,
              zIndex: 3000,
              overflow: 'hidden',
            }}
            onPointerDown={(e) => stopEventPropagation(e as any)}
            onPointerMove={(e) => stopEventPropagation(e as any)}
            onPointerUp={(e) => stopEventPropagation(e as any)}
            onWheel={(e) => {
              if ((e as any).ctrlKey) {
                ;(e as any).preventDefault()
              } else {
                ;(e as any).stopPropagation()
              }
            }}
          >
            <div style={{ maxHeight: 220, overflow: 'auto' }}>
              <ArenaSearchPanel
                query={labelQuery}
                searching={false}
                error={null}
                results={results}
                highlightedIndex={highlightedIndex}
                onHoverIndex={setHighlightedIndex}
                onSelect={(r: any) => onSearchSelection(r)}
                containerRef={resultsContainerRef}
              />
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}

// LabelDisplay - Handles channel/user label display with editing capability
export function LabelDisplay({
  mode,
  channel,
  userId,
  userName,
  userAvatar,
  title,
  authorName,
  authorAvatar,
  labelPrimary,
  dimensions,
  isSelected,
  isEditingLabel,
  setIsEditingLabel,
  labelQuery,
  children, // SearchInterface when editing
}: ThreeDBoxContentProps & {
  dimensions: ThreeDBoxDimensions
  isSelected: boolean
  isEditingLabel: boolean
  setIsEditingLabel: (editing: boolean) => void
  labelQuery: string
  children?: React.ReactNode
}) {
  const { zoomAwareFontPx, labelHeight, labelOffset, labelIconPx, profileIconPx } = dimensions

  if (!channel && !userId) {
    return null
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: -(labelHeight + labelOffset),
        left: 0,
        width: dimensions.width,
        height: labelHeight,
        pointerEvents: 'all',
      }}
    >
      <div
        style={{
          fontFamily: "'Alte Haas Grotesk', system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif",
          fontSize: `${zoomAwareFontPx}px`,
          lineHeight: 1.1,
          left: 8,
          opacity: 0.6,
          position: 'relative', // anchor for dropdown
          fontWeight: 600,
          letterSpacing: '-0.0125em',
          color: 'var(--color-text)',
          padding: 6,
          textAlign: 'left',
          verticalAlign: 'top',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 8 / dimensions.zoom,
          userSelect: isSelected ? 'auto' : 'none',
          pointerEvents: 'auto',
          outline: 'none',
          border: 'none',
          background: 'transparent',
        }}
        onClick={(e) => {
          stopEventPropagation(e)
          if (!isSelected) {
            // This would need to be passed in from parent
            // editor.setSelectedShapes([shape])
          }
        }}
        onDoubleClick={(e) => {
          stopEventPropagation(e)
          if (!isSelected) return
          setIsEditingLabel(true)
          // setTimeout(() => inputRef.current?.focus(), 0) - handled by SearchInterface
        }}
      >
        {isEditingLabel ? (
          children
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4 / dimensions.zoom,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              minWidth: 0,
              flex: 1,
            }}
            onPointerDown={(e) => stopEventPropagation(e)}
            onPointerMove={(e) => stopEventPropagation(e)}
            onPointerUp={(e) => stopEventPropagation(e)}
          >
            {userId ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 / dimensions.zoom, minWidth: 0, overflow: 'hidden' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 0 }}>
                  <Avatar src={userAvatar} size={profileIconPx} />
                </span>
                <span style={{
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}>
                   {labelPrimary || 'Profile'}
                </span>
              </span>
            ) : (
              <span style={{
                textOverflow: 'ellipsis',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}>
                {labelPrimary || 'Search Are.na'}
              </span>
            )}
            {isSelected && authorName ? (
              <>
                <span style={{
                  fontSize: `${zoomAwareFontPx}px`,
                  opacity: 0.6,
                  flexShrink: 0
                }}>by</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 / dimensions.zoom, minWidth: 0, overflow: 'hidden' }}>
                  <Avatar src={authorAvatar} size={labelIconPx} />
                  <span style={{
                    fontSize: `${zoomAwareFontPx}px`,
                    opacity: 0.6,
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}>{authorName}</span>
                </span>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

export class ThreeDBoxShapeUtil extends BaseBoxShapeUtil<ThreeDBoxShape> {
  static override type = '3d-box' as const

  static override props = {
    w: T.number,
    h: T.number,
    tilt: T.number.optional(),
    shadow: T.boolean.optional(),
    cornerRadius: T.number.optional(),
    channel: T.string.optional(),
    userId: T.number.optional(),
    userName: T.string.optional(),
    userAvatar: T.string.optional(),
    deckAnchorId: T.string.optional(),
    deckAnchorFrac: T.number.optional(),
    deckRowX: T.number.optional(),
    deckColY: T.number.optional(),
    deckStackIndex: T.number.optional(),
  }

  getDefaultProps(): ThreeDBoxShape['props'] {
    return {
      w: 200,
      h: 140,
      tilt: 8,
      shadow: true,
      cornerRadius: 8,
      channel: '',
      userId: undefined,
      userName: undefined,
      userAvatar: undefined,
    }
  }

  component(shape: ThreeDBoxShape) {
    const { w, h, tilt, shadow, cornerRadius, channel, userId, userName, userAvatar, deckAnchorId, deckAnchorFrac, deckRowX, deckColY, deckStackIndex } = shape.props

    const [popped] = useState(true)
    const faceRef = useRef<HTMLDivElement>(null)
    const shadowRef = useRef<HTMLDivElement>(null)

    // Local panel state management
    const [panelOpen, setPanelOpen] = useState(false)

    useEffect(() => {
      const face = faceRef.current
      const shade = shadowRef.current
      if (!face || !shade) return

      // Follow the popup example's transform/transition approach closely
      if (popped) {
        face.style.transform = `rotateX(0deg) translateY(0px) translateZ(0px)`
        shade.style.opacity = shadow ? `0.35` : `0`
      } else {
        face.style.transform = `rotateX(${Math.max(10, Math.min(60, tilt ?? 20))}deg)`
        shade.style.opacity = shadow ? `0.5` : `0`
      }
    }, [popped, tilt, shadow])

    const editor = this.editor
    // Perspective settings derived from viewport & shape bounds like popup example
    const vpb = editor.getViewportPageBounds()
    const spb = editor.getShapePageBounds(shape)!
    const px = vpb.midX - spb.midX + spb.w / 2
    const py = vpb.midY - spb.midY + spb.h / 2

    const [isEditingLabel, setIsEditingLabel] = useState(false)
    const [labelQuery, setLabelQuery] = useState(channel || '')
    const inputRef = useRef<HTMLInputElement>(null)
    const searchInputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null)
    const hasTarget = (!!channel && channel.trim() !== '') || !!userId
    const mode: 'search' | 'channel' | 'user' = !hasTarget ? 'search' : (channel ? 'channel' : 'user')
    const activeQuery = (mode === 'search' || isEditingLabel) ? labelQuery : ''
    const deferredQuery = useDeferredValue(activeQuery)
    const { loading: searching, error: searchError, results } = useArenaSearch(deferredQuery)
    const hasResults = results.length > 0
    const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)
    const resultsContainerRef = useRef<HTMLDivElement>(null)
    // Selection / transform state used by multiple sections
    const isSelected = editor.getSelectedShapeIds().includes(shape.id)
    const inputsAny = (editor as any).inputs
    const isDragging = !!inputsAny?.isDragging
    const isResizing = !!inputsAny?.isResizing
    const isTransforming = isDragging || isResizing
    const isPointerPressed = !!inputsAny?.isPressed || !!inputsAny?.isPointerDown

    // Close panel when shape is deselected or during transformations
    useEffect(() => {
      if (!isSelected || isTransforming) {
        setPanelOpen(false)
      }
    }, [isSelected, isTransforming])

    // Bring shape to front when panel opens
    useEffect(() => {
      if (panelOpen) {
        editor.bringToFront([shape.id])
      }
    }, [panelOpen, editor, shape.id])

    const { loading, error, cards, author, title } = useArenaChannel(channel)
    const { loading: chLoading, error: chError, connections } = useConnectedChannels(channel, isSelected && !isTransforming && !!channel)
    const z = editor.getZoomLevel() || 1

    // Calculate reference dimensions for coordination with other shapes
    // When this shape shows channel/user content, calculate canonical dimensions for coordination
    const referenceDimensions: ReferenceDimensions | undefined = useMemo(() => {
      if (!channel && !userId) return undefined // Search mode - no coordination needed

      // Calculate canonical dimensions using 'stack' mode as the reference
      // This provides deterministic coordination: all shapes with same w/h calculate same dimensions
      return calculateReferenceDimensions(w, h, 'stack')
    }, [channel, userId, w, h])
    const sideGapPx = 8
    const gapW = sideGapPx / z
    const baseFontPx = 12
    const zoomAwareFontPx = baseFontPx / z
    const labelHeight = zoomAwareFontPx * 1.2 + 6
    const labelOffset = 4 / z
    const authorName = author?.full_name || author?.username || ''
    const authorAvatar = (author as any)?.avatar || ''
    const labelPrimary = useMemo(() => (userId ? userName || '' : title || channel || ''), [userId, userName, title, channel])
    const labelIconPx = useMemo(() => Math.max(1, Math.floor(zoomAwareFontPx)), [zoomAwareFontPx])
    const profileIconPx = labelIconPx
    // const authorAvatar = author?.avatar || ''

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
      (partial: Partial<ThreeDBoxShape['props']>) => {
        transact(() => {
          const latest = editor.getShape(shape.id) as ThreeDBoxShape | null
          const baseProps = latest?.props ?? shape.props
          editor.updateShape({
            id: shape.id,
            type: '3d-box',
            props: { ...baseProps, ...partial },
          })
        })
      },
      [editor, shape.id, shape.props]
    )

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

    // Clear inner selection when shape deselects or transforms
    useEffect(() => {
      if (!isSelected || isTransforming) {
        setSelectedCardId(null)
        setSelectedCardRect(null)
      }
    }, [isSelected, isTransforming])

    // Autofocus search input on creation when no channel/user is set and shape is selected
    const didAutoEditRef = useRef(false)
    useEffect(() => {
      if (didAutoEditRef.current) return
      if (mode === 'search' && isSelected) {
        didAutoEditRef.current = true
        setIsEditingLabel(true)
        setTimeout(() => searchInputRef.current?.focus(), 0)
      }
    }, [isSelected, mode])

    // Auto-resize the search textarea to fit content width/height
    useLayoutEffect(() => {
      if (mode !== 'search') return
      const el = searchInputRef.current as HTMLTextAreaElement | null
      if (!el || el.tagName !== 'TEXTAREA') return
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }, [labelQuery, mode])

    // Reset highlight as query / results change
    useEffect(() => {
      setHighlightedIndex(results.length > 0 ? 0 : -1)
    }, [labelQuery, results.length])

    // Keep highlighted row in view
    useEffect(() => {
      const container = resultsContainerRef.current
      if (!container) return
      const el = container.querySelector(`[data-index="${highlightedIndex}"]`)
      if (el && 'scrollIntoView' in el) {
        ;(el as HTMLElement).scrollIntoView({ block: 'nearest' })
      }
    }, [highlightedIndex])

    function applySearchSelection(result: SearchResult | null) {
      if (!result) {
        const term = labelQuery.trim()
        if (!term) return
        editor.updateShape({ id: shape.id, type: '3d-box', props: { ...shape.props, channel: term, userId: undefined, userName: undefined } })
        setIsEditingLabel(false)
        return
      }
      if (result.kind === 'channel') {
        const slug = (result as any).slug
        setLabelQuery(slug)
        editor.updateShape({ id: shape.id, type: '3d-box', props: { ...shape.props, channel: slug, userId: undefined, userName: undefined } })
        setIsEditingLabel(false)
      } else {
        editor.updateShape({ id: shape.id, type: '3d-box', props: { ...shape.props, channel: '', userId: (result as any).id, userName: (result as any).username, userAvatar: (result as any).avatar ?? undefined } })
        setIsEditingLabel(false)
      }
    }

    

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

    const { onChannelPointerDown: onUserChanPointerDown, onChannelPointerMove: onUserChanPointerMove, onChannelPointerUp: onUserChanPointerUp } = useChannelDragOut({
      editor,
      screenToPagePoint,
      defaultDimensions: { w, h },
      onDragStart: () => {
        lastInteractionWasDragRef.current = true
      },
    })

    // Create wrapper functions to match ArenaUserChannelsIndex interface
    const wrappedOnUserChanPointerDown = useCallback((info: { slug: string; id: number; title: string }, e: React.PointerEvent) => {
      stopEventPropagation(e)
      onUserChanPointerDown(info.slug, e)
    }, [onUserChanPointerDown])

    const wrappedOnUserChanPointerMove = useCallback((info: { slug: string; id: number; title: string }, e: React.PointerEvent) => {
      stopEventPropagation(e)
      onUserChanPointerMove(info.slug, e)
    }, [onUserChanPointerMove])

    const wrappedOnUserChanPointerUp = useCallback((info: { slug: string; id: number; title: string }, e: React.PointerEvent) => {
      stopEventPropagation(e)
      onUserChanPointerUp(info.slug, e)
      // Clear the drag flag after a short delay to allow click handlers to check it
      setTimeout(() => {
        lastInteractionWasDragRef.current = false
      }, 100)
    }, [onUserChanPointerUp])

    const drag = useDeckDragOut({
      editor,
      thresholdPx: 6,
      screenToPagePoint,
      spawnFromCard: (card, page, ctx) => {
        const zoom = ctx.zoom
        const size = ctx.cardSize || { w: 240, h: 240 }
        const gridSize = getGridSize()
        const id = createShapeId()
        if (card.type === 'channel') {
          const slugOrTerm = (card as any).slug || String(card.id)
          const off = ctx.pointerOffsetPage
          const w = snapToGrid(Math.max(1, size.w / zoom), gridSize)
          const h = snapToGrid(Math.max(1, size.h / zoom), gridSize)
          const x0 = snapToGrid(page.x - (off?.x ?? w / 2), gridSize)
          const y0 = snapToGrid(page.y - (off?.y ?? h / 2), gridSize)
          transact(() => {
            editor.createShapes([{ id, type: '3d-box', x: x0, y: y0, props: { w, h, channel: slugOrTerm } } as any])
            editor.setSelectedShapes([id])
          })
          return id
        } else {
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
            default:
              return null
          }
          const off = ctx.pointerOffsetPage
          const w = snapToGrid(Math.max(1, size.w / zoom), gridSize)
          const h = snapToGrid(Math.max(1, size.h / zoom), gridSize)
          const x0 = snapToGrid(page.x - (off?.x ?? w / 2), gridSize)
          const y0 = snapToGrid(page.y - (off?.y ?? h / 2), gridSize)
          props = { ...props, w, h }
          transact(() => {
            editor.createShapes([{ id, type: 'arena-block', x: x0, y: y0, props } as any])
            editor.setSelectedShapes([id])
          })
          return id
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


    // Predict ArenaDeck layout to coordinate label visibility (hide when mini)
    const predictedLayoutMode = useMemo(() => {
      return calculateReferenceDimensions(w, h).layoutMode
    }, [w, h])
    const hideLabelAboveShape = predictedLayoutMode === 'mini' || predictedLayoutMode === 'tabs' || predictedLayoutMode === 'htabs'

    return (
      <HTMLContainer
        style={{
          pointerEvents: 'all',
          width: w,
          height: h,
          perspective: `${Math.max(vpb.w, vpb.h)}px`,
          perspectiveOrigin: `${px}px ${py}px`,
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
        onPointerMove={stopEventPropagation}
        onPointerUp={stopEventPropagation}
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
        {(channel || userId) && !hideLabelAboveShape ? (
          <div
            style={{
              position: 'absolute',
              top: -(labelHeight + labelOffset),
              left: 0,
              width: w,
              height: labelHeight,
              pointerEvents: 'all',
            }}
          >
            <div
              style={{
                fontFamily: "'Alte Haas Grotesk', system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif",
                fontSize: `${zoomAwareFontPx}px`,
                lineHeight: 1.1,
                left: 8,
                opacity: 0.6,
                position: 'relative', // anchor for dropdown
                fontWeight: 600,
                letterSpacing: '-0.0125em',
                color: 'var(--color-text)',
                padding: 6,
                textAlign: 'left',
                verticalAlign: 'top',
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: 8 / z,
                userSelect: isSelected ? 'auto' : 'none',
                pointerEvents: 'auto',
                outline: 'none',
                border: 'none',
                background: 'transparent',
              }}
              onClick={(e) => {
                stopEventPropagation(e)
                if (!isSelected) {
                  editor.setSelectedShapes([shape])
                }
              }}
              onDoubleClick={(e) => {
                stopEventPropagation(e)
                if (!isSelected) return
                setIsEditingLabel(true)
                setTimeout(() => inputRef.current?.focus(), 0)
              }}
            >
              {isEditingLabel ? (
                <Popover.Root open={isSelected && isEditingLabel && hasResults}>
                  <Popover.Anchor asChild>
                  <input
                    data-interactive="input"
                      ref={inputRef}
                      value={labelQuery}
                      onChange={(e) => setLabelQuery(e.target.value)}
                      placeholder={(channel || userId) ? 'Change…' : 'Search Are.na'}
                      onPointerDown={(e) => stopEventPropagation(e)}
                      onPointerMove={(e) => stopEventPropagation(e)}
                      onPointerUp={(e) => stopEventPropagation(e)}
                    onFocus={() => { if (!isSelected) editor.setSelectedShapes([shape.id]) }}
                      onWheel={(e) => {
                        // allow native scrolling inside inputs; just avoid bubbling to the canvas
                        e.stopPropagation()
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault()
                          if (results.length === 0) return
                          const newIndex = highlightedIndex < 0 ? 0 : (highlightedIndex + 1) % results.length
                          setHighlightedIndex(newIndex)
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault()
                          if (results.length === 0) return
                          const newIndex = highlightedIndex <= 0 ? results.length - 1 : highlightedIndex - 1
                          setHighlightedIndex(newIndex)
                        } else if (e.key === 'Enter') {
                          e.preventDefault()
                          const chosen = highlightedIndex >= 0 && highlightedIndex < results.length ? results[highlightedIndex] : null
                          applySearchSelection(chosen)
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          setIsEditingLabel(false)
                        }
                      }}
                      style={{
                        fontFamily: 'inherit',
                        fontSize: `${zoomAwareFontPx}px`,
                        fontWeight: 600,
                        letterSpacing: '-0.0125em',
                        color: hasResults ? 'var(--color-text)' : 'rgba(0,0,0,.45)',
                        border: 'none',
                        borderRadius: 0,
                        padding: `${2 / z}px ${4 / z}px`,
                        background: 'transparent',
                        width: 'auto',
                        minWidth: 60,
                        outline: 'none',
                      }}
                    />
                  </Popover.Anchor>
                  <Popover.Portal>
                  <Popover.Content forceMount
                    side="bottom"
                    align="start"
                    sideOffset={4}
                    avoidCollisions={false}
                    onOpenAutoFocus={(e) => e.preventDefault()}
                    style={{
                      width: 220,
                      maxHeight: 220,
                      background: '#fff',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      border: '1px solid #e6e6e6',
                      borderRadius: 4,
                      zIndex: 3000,
                      overflow: 'hidden',
                    }}
                    onPointerDown={(e) => stopEventPropagation(e)}
                    onPointerMove={(e) => stopEventPropagation(e)}
                    onPointerUp={(e) => stopEventPropagation(e)}
                    onWheel={(e) => {
                      if ((e as any).ctrlKey) {
                        ;(e as any).preventDefault()
                      } else {
                        ;(e as any).stopPropagation()
                      }
                    }}
                  >
                    <div style={{ maxHeight: 220, overflow: 'auto' }}>
                      <ArenaSearchPanel
                        query={labelQuery}
                        searching={false}
                        error={null}
                        results={results}
                        highlightedIndex={highlightedIndex}
                        onHoverIndex={setHighlightedIndex}
                        onSelect={(r: SearchResult) => applySearchSelection(r)}
                        containerRef={resultsContainerRef}
                      />
                    </div>
                  </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4 / z,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    minWidth: 0,
                    flex: 1,
                  }}
                  onPointerDown={(e) => stopEventPropagation(e)}
                  onPointerMove={(e) => stopEventPropagation(e)}
                  onPointerUp={(e) => stopEventPropagation(e)}
                >
                  {userId ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 / z, minWidth: 0, overflow: 'hidden' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 0 }}>
                        <Avatar src={userAvatar} size={profileIconPx} />
                      </span>
                      <span style={{ 
                        textOverflow: 'ellipsis', 
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        minWidth: 0,
                      }}>
                        {labelPrimary || 'Profile'}
                      </span>
                    </span>
                  ) : (
                    <span style={{ 
                      textOverflow: 'ellipsis', 
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      minWidth: 0,
                    }}>
                      {labelPrimary || 'Search Are.na'}
                    </span>
                  )}
                  {isSelected && authorName ? (
                    <>
                      <span style={{
                        fontSize: `${zoomAwareFontPx}px`,
                        opacity: 0.6,
                        flexShrink: 0
                      }}>by</span>
                      <span
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 / z, minWidth: 0, overflow: 'hidden', cursor: 'pointer' }}
                        onClick={(e) => {
                          stopEventPropagation(e)
                          if (author?.id) {
                            handleUserSelect(author.id, author.username || author.full_name || '', author?.avatar || undefined)
                          }
                        }}
                      >
                        <Avatar src={authorAvatar} size={labelIconPx} />
                        <span style={{
                          fontSize: `${zoomAwareFontPx}px`,
                          opacity: 0.6,
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          minWidth: 0,
                        }}>{authorName}</span>
                      </span>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ) : null}
        <div
          ref={shadowRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            transition: 'all .5s',
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            backgroundColor: 'rgba(0,0,0,.5)',
            borderRadius: `${cornerRadius ?? 0}px`,
          }}
        />
        <div
          ref={faceRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'auto',
            transition: 'all .5s',
            display: 'flex',
            alignItems: 'stretch',
            justifyContent: 'stretch',
            padding: 0,
            overflow: 'hidden',
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif',
            color: '#333',
            fontSize: 16,
            background: `#fff`,
            border: '1px solid rgba(0,0,0,.05)',
            boxShadow: isSelected ? '0 4px 12px rgba(0,0,0,.04)' : 'none',
            borderRadius: `${cornerRadius ?? 0}px`,
            transformOrigin: 'top center',
          }}
          onPointerDown={(e) => {
            // If user interacts with an interactive element, block canvas handling.
            if (isInteractiveTarget(e.target)) {
              stopEventPropagation(e)
              return
            }
            // If a deck card is currently selected and the click is outside any card,
            // clear the local card selection. Clicking on cards themselves is handled
            // inside ArenaDeck and won't reach here due to stopEventPropagation there.
            try {
              const targetEl = e.target as HTMLElement
              const insideCard = !!targetEl?.closest?.('[data-interactive="card"]')
              if (!insideCard && selectedCardId != null) {
                setSelectedCardId(null)
                setSelectedCardRect(null)
              }
            } catch {}
            // Otherwise allow bubbling so the editor can select/drag the shape.
            if (!isSelected) {
              editor.setSelectedShapes([shape.id])
            }
          }}
          onContextMenu={(e) => {
            // Handle right-click to set selection and open connections panel
            stopEventPropagation(e)
            e.preventDefault()
            // Set selection to this shape
            editor.setSelectedShapes([shape.id])
            // Always open panel since this shape is now the only selected one
            setPanelOpen(true)
          }}
          onWheel={(e) => {
            // When the user pinches on the deck, we want to prevent the browser from zooming.
            // We also want to allow the user to scroll the deck's content without panning the canvas.
            if (e.ctrlKey) {
              e.preventDefault()
            } else {
              e.stopPropagation()
            }
          }}
        >
          {isEditingLabel && (!channel && !userId) ? (
            <div
              data-interactive="search"
              style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 10px 10px 10px' }}
              onPointerDown={(e) => stopEventPropagation(e)}
              onPointerMove={(e) => stopEventPropagation(e)}
              onPointerUp={(e) => stopEventPropagation(e)}
              onWheel={(e) => { e.stopPropagation() }}
            >
              <Popover.Root open={isSelected && isEditingLabel && hasResults}>
                <Popover.Anchor asChild>
                  <textarea
                    data-interactive="input"
                    ref={searchInputRef as any}
                    value={labelQuery}
                    rows={1}
                    onChange={(e) => setLabelQuery(e.target.value)}
                    placeholder={'Search Are.na'}
                    onPointerDown={(e) => stopEventPropagation(e)}
                    onPointerMove={(e) => stopEventPropagation(e)}
                    onPointerUp={(e) => stopEventPropagation(e)}
                    onFocus={() => { if (!isSelected) editor.setSelectedShapes([shape.id]) }}
                    onWheel={(e) => {
                      // allow native scrolling inside inputs; just avoid bubbling to the canvas
                      e.stopPropagation()
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        if (results.length === 0) return
                        const newIndex = highlightedIndex < 0 ? 0 : (highlightedIndex + 1) % results.length
                        setHighlightedIndex(newIndex)
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        if (results.length === 0) return
                        const newIndex = highlightedIndex <= 0 ? results.length - 1 : highlightedIndex - 1
                        setHighlightedIndex(newIndex)
                      } else if (e.key === 'Enter') {
                        e.preventDefault()
                        const chosen = highlightedIndex >= 0 && highlightedIndex < results.length ? results[highlightedIndex] : null
                        applySearchSelection(chosen)
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        setIsEditingLabel(false)
                      }
                    }}
                    style={{
                      fontFamily: 'inherit',
                      fontSize: '22px',
                      fontWeight: 700,
                      letterSpacing: '-0.015em',
                      color: hasResults ? 'var(--color-text)' : 'rgba(0,0,0,.45)',
                      border: 'none',
                      borderRadius: 0,
                      padding: '6px 0 6px 12px',
                      background: '#fff',
                      width: '100%',
                      boxSizing: 'border-box',
                      outline: 'none',
                      display: 'block',
                      resize: 'none',
                      overflow: 'hidden',
                      lineHeight: 1.25,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  />
                </Popover.Anchor>
                <Popover.Portal>
                  <Popover.Content forceMount
                    side="bottom"
                    align="start"
                    sideOffset={4}
                    avoidCollisions={false}
                    onOpenAutoFocus={(e) => e.preventDefault()}
                    style={{
                      width: 220,
                      maxHeight: 220,
                      background: '#fff',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      border: '1px solid #e6e6e6',
                      borderRadius: 4,
                      zIndex: 3000,
                      overflow: 'hidden',
                    }}
                    onPointerDown={(e) => stopEventPropagation(e as any)}
                    onPointerMove={(e) => stopEventPropagation(e as any)}
                    onPointerUp={(e) => stopEventPropagation(e as any)}
                    onWheel={(e) => {
                      if ((e as any).ctrlKey) {
                        ;(e as any).preventDefault()
                      } else {
                        ;(e as any).stopPropagation()
                      }
                    }}
                  >
                    <div style={{ maxHeight: 220, overflow: 'auto' }}>
                      <ArenaSearchPanel
                        query={labelQuery}
                        searching={searching}
                        error={searchError}
                        results={results}
                        highlightedIndex={highlightedIndex}
                        onHoverIndex={setHighlightedIndex}
                        onSelect={(r: SearchResult) => applySearchSelection(r)}
                        containerRef={resultsContainerRef}
                      />
                    </div>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>
          ) : channel ? (
            <div
              style={{ width: '100%', height: '100%' }}
            >
              {loading ? (
                <LoadingPulse />
              ) : error ? (
                <div style={{ color: 'rgba(0,0,0,.5)', fontSize: 12 }}>error: {error}</div>
              ) : (
                <ErrorBoundary
                  onError={(err) => {
                    try {
                      // eslint-disable-next-line no-console
                      console.error('[ThreeDBox] ArenaDeck error, reloading channel', err)
                      if (channel) invalidateArenaChannel(channel)
                      // Force remount by updating a key on the container; use time-based key
                      // This container is managed by React, so setting state here would be ideal,
                      // but we can rely on channel change/remount via invalidate + re-render.
                    } catch {}
                  }}
                >
                  <ArenaDeck
                    cards={cards}
                    width={w}
                    height={h}
                    channelTitle={title || channel}
                    referenceDimensions={referenceDimensions}
                    onCardPointerDown={drag.onCardPointerDown}
                    onCardPointerMove={drag.onCardPointerMove}
                    onCardPointerUp={drag.onCardPointerUp}
                    initialPersist={{ anchorId: deckAnchorId, anchorFrac: deckAnchorFrac, rowX: deckRowX, colY: deckColY, stackIndex: deckStackIndex }}
                    onPersist={handleDeckPersist}
                    selectedCardId={selectedCardId ?? undefined}
                    onSelectCard={handleDeckSelectCard}
                    onSelectedCardRectChange={handleSelectedCardRectChange}
                  />
                </ErrorBoundary>
              )}
            </div>
          ) : userId ? (
            predictedLayoutMode === 'mini' ? (
              <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    position: 'relative',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    background: 'rgba(0,0,0,.06)',
                    userSelect: 'none',
                  }}
                  title={userName || 'Profile'}
                >
                  {userAvatar ? (
                    <img src={userAvatar} alt={userName || 'avatar'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
                      <span style={{ fontSize: 22, fontWeight: 800, color: 'rgba(0,0,0,.6)' }}>
                        {(userName || 'P').slice(0, 1).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'grid',
                      placeItems: 'center',
                      padding: '0 8px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: '-0.01em',
                        color: '#fff',
                        textAlign: 'center',
                        textShadow: '0 1px 2px rgba(0,0,0,.45)',
                        lineHeight: 1.1,
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {userName || 'Profile'}
                    </span>
                  </div>
                </div>
              </div>
            ) : predictedLayoutMode === 'tabs' ? (
              <div
                style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: '8px 12px', overflow: 'hidden' }}
                onWheel={(e) => { e.stopPropagation() }}
              >
                <div
                  style={{
                    flex: '0 0 auto',
                    height: 28,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                 
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 0 }}>
                    <Avatar src={userAvatar} size={12} />
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#333', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: Math.max(60, w - 80) }}>
                    {userName || 'Profile'}
                  </span>
                </div>
              </div>
            ) : (
              <ArenaUserChannelsIndex
                userId={userId}
                userName={userName}
                width={w}
                height={h}
                onSelectChannel={handleChannelSelect}
                onChannelPointerDown={wrappedOnUserChanPointerDown}
                onChannelPointerMove={wrappedOnUserChanPointerMove}
                onChannelPointerUp={wrappedOnUserChanPointerUp}
              />
            )
          ) : null}
        </div>

        {/* Panel for shape selection */}
        {isSelected && !isTransforming && !isPointerPressed && !!channel && selectedCardId == null && editor.getSelectedShapeIds().length === 1 ? (
          <ConnectionsPanel
            z={z}
            x={w + gapW + (12 / z)}
            y={(8 / z)}
            widthPx={260}
            maxHeightPx={320}
            title={title || channel}
            author={author ? { id: (author as any).id, username: (author as any).username, full_name: (author as any).full_name, avatar: (author as any).avatar } : undefined}
            createdAt={undefined}
            updatedAt={undefined}
            blockCount={cards?.length}
            loading={loading || chLoading}
            error={error || chError}
            connections={panelConnections}
            hasMore={false}
            onSelectChannel={(slug) => {
              if (!slug) return
              transact(() => {
                editor.updateShape({
                  id: shape.id,
                  type: '3d-box',
                  props: { ...shape.props, channel: slug, userId: undefined, userName: undefined },
                })
              })
            }}
            editor={editor}
            defaultDimensions={{ w, h }}
            isOpen={panelOpen}
            setOpen={setPanelOpen}
          />
        ) : null}

        {/* Panel for card selection */}
        {selectedCardId != null && selectedCard && selectedCardRect && !isTransforming && !isPointerPressed ? (
          <ConnectionsPanel
            z={z}
            x={(selectedCardRect.right + sideGapPx + 16) / z}
            y={(selectedCardRect.top + 12) / z}
            widthPx={260}
            maxHeightPx={320}
            title={(selectedCard as any).title || (selectedCard as any).slug || ''}
            author={selDetails?.user ? { id: (selDetails.user as any).id, username: (selDetails.user as any).username, full_name: (selDetails.user as any).full_name, avatar: (selDetails.user as any).avatar } : undefined}
            createdAt={selDetails?.createdAt}
            updatedAt={selDetails?.updatedAt}
            blockCount={undefined}
            loading={!!selectedBlockNumericId && selDetailsLoading}
            error={selDetailsError}
            connections={cardConnections}
            hasMore={selDetails?.hasMoreConnections}
            onSelectChannel={handleChannelSelect}
            editor={editor}
            defaultDimensions={{ w, h }}
            isOpen={panelOpen}
            setOpen={setPanelOpen}
          />
        ) : null}
      </HTMLContainer>
    )
  }

  indicator(shape: ThreeDBoxShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={shape.props.cornerRadius ?? 0} />
  }
}


