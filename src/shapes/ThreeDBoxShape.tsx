import { BaseBoxShapeUtil, HTMLContainer, T, resizeBox, stopEventPropagation, createShapeId, transact } from 'tldraw'
import type { TLBaseShape } from 'tldraw'
import { useEffect, useRef, useState, useMemo, useCallback, useLayoutEffect } from 'react'
import type React from 'react'
import * as Popover from '@radix-ui/react-popover'
import { ArenaDeck } from '../arena/Deck'
import { ErrorBoundary } from '../arena/components/ErrorBoundary'
import { invalidateArenaChannel } from '../arena/api'
import { calculateReferenceDimensions, type ReferenceDimensions, type LayoutMode } from '../arena/layout'
import { CARD_BORDER_RADIUS, SHAPE_BORDER_RADIUS, SHAPE_SHADOW, PORTAL_BACKGROUND, TEXT_SECONDARY, TEXT_TERTIARY, ROUNDED_SQUARE_BORDER_RADIUS } from '../arena/constants'
import { useDeckDragOut } from '../arena/hooks/useDeckDragOut'
import { useChannelDragOut } from '../arena/hooks/useChannelDragOut'
import { ArenaUserChannelsIndex } from '../arena/ArenaUserChannelsIndex'
import { TabsLayout } from '../arena/components/layouts/TabsLayout'
import { VerticalTabsLayout } from '../arena/components/layouts/VerticalTabsLayout'
import { InteractiveUserCard } from '../arena/components/InteractiveUserCard'
import { useArenaChannel, useConnectedChannels, useArenaBlock } from '../arena/hooks/useArenaData'
import { useArenaSearch } from '../arena/hooks/useArenaSearch'
import { useSessionUserChannels, fuzzySearchChannels } from '../arena/userChannelsStore'
import type { Card, SearchResult } from '../arena/types'
import { SearchPopover } from '../arena/ArenaSearchResults'
import { ConnectionsPanel } from '../arena/ConnectionsPanel'
import { Avatar } from '../arena/icons'
import { isInteractiveTarget } from '../arena/dom'
import { LoadingPulse } from './LoadingPulse'
import { MixBlendBorder } from './MixBlendBorder'
import { getGridSize, snapToGrid, TILING_CONSTANTS } from '../arena/layout'
import { useAspectRatioCache } from '../arena/hooks/useAspectRatioCache'
import { computeResponsiveFont } from '../arena/typography'
import { useCollisionAvoidance, GhostOverlay } from '../arena/collisionAvoidance'

// Shared types for ThreeDBoxShape components

// Debug flag for layout mode display
const DEBUG_LAYOUT_MODE = false

// Reusable UserLabelDisplay component - matches ThreeDBoxShape label styling
export function UserLabelDisplay({
  userName,
  userAvatar,
  zoom = 1,
  variant = 'full', // 'full' shows avatar + name, 'compact' shows just avatar
  fontSizePx,
  fontWeight = 600,
  color = '#333',
  gapPx = 4,
  maxWidthPx,
  onClick,
  style,
}: {
  userName?: string
  userAvatar?: string
  zoom?: number
  variant?: 'full' | 'compact'
  fontSizePx?: number
  fontWeight?: number
  color?: string
  gapPx?: number
  maxWidthPx?: number
  onClick?: () => void
  style?: React.CSSProperties
}) {
  const displayName = userName || 'Profile'
  const avatarSize = variant === 'compact' ? 12 : Math.max(1, Math.floor((fontSizePx || 14) / zoom))

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: gapPx / zoom,
        minWidth: 0,
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
      onClick={onClick}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 0 }}>
        <Avatar src={userAvatar} size={avatarSize} />
      </span>
      {variant === 'full' && (
        <span style={{
          fontSize: fontSizePx ? `${fontSizePx}px` : undefined,
          fontWeight,
          color,
          textOverflow: 'ellipsis',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          minWidth: 0,
          maxWidth: maxWidthPx ? `${maxWidthPx}px` : undefined,
        }}>
          {displayName}
        </span>
      )}
    </span>
  )
}

// Stable wrapper for event handlers: keeps prop identity constant while calling latest impl
const useStableCallback = <T extends (...args: any[]) => any>(fn: T): T => {
  const ref = useRef(fn)
  useLayoutEffect(() => {
    ref.current = fn
  })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(((...args: any[]) => (ref.current as any)(...args)) as T, [])
}

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

export type ThreeDBoxMode = 'search' | 'channel' | 'user'


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
  const zoomAwareFontPx = baseFontPx / Math.min(z, 1.5)
  const labelHeight = zoomAwareFontPx * 1.5 + 6
  const labelOffset = 4 / Math.min(z, 1.5)
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
      onPointerDown={(e) => {
        // Allow events to bubble up for HTMLContainer to handle via isInteractiveTarget
        // Only stop propagation for elements that should be handled locally
      }}
      onPointerMove={stopEventPropagation}
      onPointerUp={stopEventPropagation}
      onWheel={(e) => { e.stopPropagation() }}
    >
      <SearchPopover
        open={isSelected && isEditingLabel}
        side="bottom"
        align="start"
        sideOffset={4}
        avoidCollisions={false}
        query={labelQuery}
        searching={false}
        error={null}
        results={results}
        highlightedIndex={highlightedIndex}
        onHoverIndex={setHighlightedIndex}
        onSelect={(r: any) => onSearchSelection(r)}
        containerRef={resultsContainerRef}
      >
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
            placeholder={'search arena'}
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
      </SearchPopover>
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
      data-interactive="search"
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
          position: 'relative', // anchor for dropdown
          fontWeight: 600,
          letterSpacing: '-0.0125em',
          color: TEXT_SECONDARY,
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
                {labelPrimary || 'search arena'}
              </span>
            )}
            {isSelected && authorName ? (
              <>
                <span style={{
                  fontSize: `${zoomAwareFontPx}px`,
                  color: TEXT_TERTIARY,
                  flexShrink: 0
                }}>by</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 / dimensions.zoom, minWidth: 0, overflow: 'hidden' }}>
                  <Avatar src={authorAvatar} size={labelIconPx} />
                  <span style={{
                    fontSize: `${zoomAwareFontPx}px`,
                    color: TEXT_TERTIARY,
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

// Hand-drawn border component - commented out
/*
function HandDrawnBorder({
  w, h, cornerRadius,
  borderSize, borderThinning, borderSmoothing, borderStreamline,
  borderSimulatePressure, borderFill, borderFillColor, borderStrokeColor
}: {
  w: number
  h: number
  cornerRadius: number
  borderSize: number
  borderThinning: number
  borderSmoothing: number
  borderStreamline: number
  borderSimulatePressure: boolean
  borderFill: boolean
  borderFillColor: string
  borderStrokeColor: string
}) {
  // Create a PathBuilder path for the rounded rectangle outline
  const path = new PathBuilder()
    .moveTo(cornerRadius, 0)
    .lineTo(w - cornerRadius, 0)
    .arcTo(cornerRadius, cornerRadius, false, true, 0, w, cornerRadius)
    .lineTo(w, h - cornerRadius)
    .arcTo(cornerRadius, cornerRadius, false, true, 0, w - cornerRadius, h)
    .lineTo(cornerRadius, h)
    .arcTo(cornerRadius, cornerRadius, false, true, 0, 0, h - cornerRadius)
    .lineTo(0, cornerRadius)
    .arcTo(cornerRadius, cornerRadius, false, true, 0, cornerRadius, 0)
    .close()

  // Extract points from geometry and apply hand-drawn effect
  const geometry = path.toGeometry()
  const borderPoints = geometry.getVertices({})

  // Convert Vec[] to the format expected by perfect-freehand (arrays of [x,y])
  const strokePoints = borderPoints.map(point => [point.x, point.y])

  // Apply perfect-freehand for authentic hand-drawn effect
  const strokeOutline = getStroke(strokePoints, {
    size: borderSize,
    thinning: borderThinning,
    smoothing: borderSmoothing,
    streamline: borderStreamline,
    simulatePressure: borderSimulatePressure,
    last: true
  })

  // Generate SVG path data from the stroke outline points
  const pathData = strokeOutline.length > 0
    ? `M ${strokeOutline.map(([x, y]) => `${x},${y}`).join(' L ')} Z`
    : ''

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 4, // Above face background (zIndex 3) but below content (zIndex 4)
        overflow: 'visible', // Prevent clipping of the border
      }}
    >
      <path
        d={pathData}
        fill={borderFill ? borderFillColor : 'none'}
        // stroke={borderStrokeColor}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
*/
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

  getDefaultProps(): ThreeDBoxShape['props'] {
    return {
      w: 200,
      h: 144,
      tilt: 1,
      shadow: true,
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

  onResize(shape: ThreeDBoxShape, info: any) {
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

  component(shape: ThreeDBoxShape) {
    const { w, h, tilt, shadow, cornerRadius, channel, userId, userName, userAvatar, deckAnchorId, deckAnchorFrac, deckRowX, deckColY, deckStackIndex } = shape.props

    // Compute responsive font size for search input (larger than default)
    const searchFont = useMemo(() =>
      computeResponsiveFont({ width: w, height: h, compact: false, minPx: 12, maxPx: 32, slopeK: 0.16 }),
      [w, h]
    )

    // Compute responsive padding for search container and input
    const searchPadding = useMemo(() => {
      const minDim = Math.max(1, Math.min(w, h))
      // Scale padding from 8px (small) to 16px (large) based on shape size
      const basePadding = Math.max(4, Math.min(16, minDim * 0.04))
      return {
        containerVertical: Math.round(basePadding * 1.2), // Slightly more vertical padding
        containerHorizontal: Math.round(basePadding),
        inputVertical: Math.round(basePadding * 0.6), // Less vertical padding on input
        inputLeft: Math.round(basePadding * 1.5), // More left padding for cursor space
      }
    }, [w, h])


    const [popped] = useState(false)
    const faceBackgroundRef = useRef<HTMLDivElement>(null)
    const contentRef = useRef<HTMLDivElement>(null)
    const shadowRef = useRef<HTMLDivElement>(null)
    const borderRef = useRef<HTMLDivElement>(null)
    const [isHovered, setIsHovered] = useState(false)



    // Local panel state management
    const [panelOpen, setPanelOpen] = useState(false)
    const [deckErrorKey, setDeckErrorKey] = useState(0)

    useEffect(() => {
      const faceBackground = faceBackgroundRef.current
      const shade = shadowRef.current
      const border = borderRef.current
      if (!faceBackground || !shade || !border) return

      // Apply fixed 0-degree tilt to visual elements (shadow, border, background) - tilt disabled
      const tiltTransform = 'rotateX(0deg) translateY(0px) translateZ(0px)'
      faceBackground.style.transform = tiltTransform
      border.style.transform = tiltTransform
      shade.style.opacity = `0` // shadow disabled
    }, [shadow])

    const editor = this.editor
    // Perspective settings derived from viewport & shape bounds like popup example
    const vpb = editor.getViewportPageBounds()
    const spb = editor.getShapePageBounds(shape)!
    const perspectiveOrigin = useMemo(() => {
      const px = vpb.midX - spb.midX + spb.w / 2
      const py = vpb.midY - spb.midY + spb.h / 2
      return `${px}px ${py}px`
    }, [vpb.midX, vpb.midY, spb.midX, spb.midY, spb.w, spb.h])
    const perspective = useMemo(() => `${Math.max(vpb.w, vpb.h)}px`, [vpb.w, vpb.h])

    const [isEditingLabel, setIsEditingLabel] = useState(false)
    const [labelQuery, setLabelQuery] = useState(channel || '')
    const inputRef = useRef<HTMLInputElement>(null)
    const searchInputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null)

    const hasTarget = (!!channel && channel.trim() !== '') || !!userId
    const mode: 'search' | 'channel' | 'user' = !hasTarget ? 'search' : (channel ? 'channel' : 'user')
    const activeQuery = (mode === 'search' || isEditingLabel) ? labelQuery : ''

    // Get cached user channels (no auto-fetch)
    const { channels: cachedChannels } = useSessionUserChannels({ autoFetch: false })

    // Fuzzy search cached channels
    const filteredCachedChannels = useMemo(() => {
      if (!activeQuery.trim()) return cachedChannels
      return fuzzySearchChannels(cachedChannels, activeQuery)
    }, [cachedChannels, activeQuery])

    // API search runs in parallel
    const { loading: searching, error: searchError, results: apiResults } = useArenaSearch(activeQuery)

    // Deduplicate API results against cached channels
    const dedupedApiResults = useMemo(() => {
      if (!apiResults.length || !cachedChannels.length) return apiResults
      const cachedChannelSlugs = new Set(cachedChannels.map(ch => ch.slug))
      return apiResults.filter(result =>
        result.kind === 'channel' ? !cachedChannelSlugs.has((result as any).slug) : true
      )
    }, [apiResults, cachedChannels])

    // Convert filtered cached channels to SearchResult format
    const cachedChannelsAsResults = useMemo(() => {
      return filteredCachedChannels.map(channel => ({
        kind: 'channel' as const,
        id: channel.id,
        title: channel.title,
        slug: channel.slug,
        author: channel.author,
        description: undefined, // UserChannelListItem doesn't have description
        length: channel.length,
        updatedAt: channel.updatedAt,
        status: channel.status,
        open: channel.open
      }))
    }, [filteredCachedChannels])

    // Combine results: cached channels first, then deduped API results
    const results = useMemo(() => {
      return [...cachedChannelsAsResults, ...dedupedApiResults]
    }, [cachedChannelsAsResults, dedupedApiResults])

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

    // Bring shape to front when selected
    useEffect(() => {
      if (isSelected) {
        editor.bringToFront([shape.id])
      }
    }, [isSelected, editor, shape.id])

    const { loading, error, cards, author, title, createdAt, updatedAt } = useArenaChannel(channel)
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
    const baseFontPx = 14
    const zoomAwareFontPx = baseFontPx / Math.min(z, 1.5)
    const labelHeight = zoomAwareFontPx * 1.2 - 8
    const labelOffset = -20 / Math.min(z, 1.5)
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

    // Memoize initialPersist to prevent prop churn during zoom/pan
    const memoizedInitialPersist = useMemo(() => ({
      anchorId: deckAnchorId,
      anchorFrac: deckAnchorFrac,
      rowX: deckRowX,
      colY: deckColY,
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

    // Create stable versions of wrapped handlers
    const wrappedOnUserChanPointerDownStable = useStableCallback(wrappedOnUserChanPointerDown)
    const wrappedOnUserChanPointerMoveStable = useStableCallback(wrappedOnUserChanPointerMove)
    const wrappedOnUserChanPointerUpStable = useStableCallback(wrappedOnUserChanPointerUp)

    const { getAspectRatio, ensureAspectRatio } = useAspectRatioCache()

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
            case 'pdf':
              props = { blockId: String(card.id), kind: 'pdf', title: card.title, imageUrl: (card as any).thumbnailUrl, url: (card as any).url }
              break
            default:
              return null
          }
          const off = ctx.pointerOffsetPage

          // Derive spawn size from cached/measured aspect ratio instead of the row's square tile
          const blockId = String((card as any).id)
          // Kick off async ensure (non-blocking)
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


    // Predict ArenaDeck layout to coordinate label visibility (hide when mini)
    const predictedLayoutMode = useMemo(() => {
      return calculateReferenceDimensions(w, h).layoutMode
    }, [w, h])

    const hideLabelAboveShape = predictedLayoutMode === 'mini' || predictedLayoutMode === 'tabs' || predictedLayoutMode === 'htabs'

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

    return (
      <HTMLContainer
        style={{
          pointerEvents: 'all',
          width: w,
          height: h,
          perspective,
          perspectiveOrigin,
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
        {(channel || userId) && !hideLabelAboveShape ? (
          <div
            style={{
              position: 'absolute',
              top: -(labelHeight + labelOffset),
              left: - 2,
              width: w,
              height: labelHeight,
              pointerEvents: 'all',
              zIndex: 8,
            }}
          >
            <div
              style={{
                fontFamily: "'Alte Haas Grotesk', system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif",
                fontSize: `${zoomAwareFontPx}px`,
                lineHeight: 1.1,
                left: 8,
                position: 'relative', // anchor for dropdown
                fontWeight: 600,
                letterSpacing: '-0.0125em',
                color: TEXT_SECONDARY,
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
                  editor.setSelectedShapes([shape.id])
                }
              }}
              onDoubleClick={(e) => {
                stopEventPropagation(e)
                e.preventDefault()
                if (!isSelected) return
                setIsEditingLabel(true)
                setTimeout(() => inputRef.current?.focus(), 0)
              }}
            >
              {isEditingLabel ? (
                <SearchPopover
                  open={isSelected && isEditingLabel}
                  side="bottom"
                  align="start"
                  sideOffset={4}
                  avoidCollisions={false}
                  query={labelQuery}
                  searching={false}
                  error={null}
                  results={results}
                  highlightedIndex={highlightedIndex}
                  onHoverIndex={setHighlightedIndex}
                  onSelect={(r: SearchResult) => applySearchSelection(r)}
                  containerRef={resultsContainerRef}
                >
                  <input
                    data-interactive="input"
                    ref={inputRef}
                    value={labelQuery}
                    onChange={(e) => setLabelQuery(e.target.value)}
                    placeholder={(channel || userId) ? 'Change…' : 'search arena'}
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
                </SearchPopover>
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
                  onPointerDown={(e) => {
                    if (isInteractiveTarget(e.target)) {
                      stopEventPropagation(e)
                    }
                  }}
                  onPointerMove={(e) => {
                    // Allow hover pointermove to bubble for smooth cursor updates; only stop during active drags
                    if (e.buttons > 0 && isInteractiveTarget(e.target)) {
                      stopEventPropagation(e)
                    }
                  }}
                  onPointerUp={(e) => {
                    if (isInteractiveTarget(e.target)) {
                      stopEventPropagation(e)
                    }
                  }}
                  onDoubleClick={(e) => {
                    stopEventPropagation(e)
                    e.preventDefault()
                    if (!isSelected) return
                    setIsEditingLabel(true)
                    setTimeout(() => inputRef.current?.focus(), 0)
                  }}
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
                      {labelPrimary || 'search arena'}
                    </span>
                  )}
                  {isSelected && authorName ? (
                    <>
                      <span style={{
                        fontSize: `${zoomAwareFontPx}px`,
                        color: TEXT_TERTIARY,
                        flexShrink: 0
                      }}>by </span>
                      <span
                        data-interactive="button"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 / z, minWidth: 0, overflow: 'hidden', cursor: 'pointer', pointerEvents: 'auto' }}
                        data-author-row={true}
                        data-user-id={author?.id ? String(author.id) : undefined}
                        data-user-username={author?.username || undefined}
                        data-user-fullname={author?.full_name || undefined}
                        data-user-avatar={author?.avatar || undefined}
                        onPointerDown={(e) => {
                          stopEventPropagation(e)
                          // Don't select user if meta key is pressed (used for tiling spawn)
                          if (!e.metaKey && author?.id) {
                            handleUserSelect(author.id, author.username || author.full_name || '', author?.avatar || undefined)
                          }
                        }}
                      >
                        <Avatar src={authorAvatar} size={labelIconPx} />
                        <span style={{
                          fontSize: `${zoomAwareFontPx}px`,
                          color: TEXT_TERTIARY,
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
        {/* Shadow for 3D effect
        <div
          ref={shadowRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            backgroundColor: 'rgba(0,0,0,.5)',
            borderRadius: `${cornerRadius ?? 0}px`,
            filter: 'blur(2px)',
            zIndex: 1,
          }}
        /> */}
        {/* Border effect - positioned at same level as shadow/face for proper tilt */}
        <MixBlendBorder
          ref={borderRef}
          isHovered={isHovered}
          panelOpen={panelOpen}
          borderRadius={cornerRadius ?? 0}
          transformOrigin="top center"
          zIndex={5}
          subtleNormal={true}
        />
        {/* Hand-drawn border - commented out */}
        {/* <HandDrawnBorder
          w={w}
          h={h}
          cornerRadius={cornerRadius ?? 0}
          borderSize={shape.props.borderSize ?? 4.3}
          borderThinning={shape.props.borderThinning ?? 0.6}
          borderSmoothing={shape.props.borderSmoothing ?? 0}
          borderStreamline={shape.props.borderStreamline ?? 0.5}
          borderSimulatePressure={shape.props.borderSimulatePressure ?? true}
          borderFill={shape.props.borderFill ?? true}
          borderFillColor={shape.props.borderFillColor ?? PORTAL_BACKGROUND}
          borderStrokeColor={shape.props.borderStrokeColor ?? '#dedede'}
        /> */}

        {/* Draw ghost overlay behind the main shape */}
        <GhostOverlay
          ghostCandidate={ghostCandidate}
          currentBounds={editor.getShapePageBounds(shape) ?? null}
          borderRadius={cornerRadius ?? 0}
          visible={isSelected && isTransforming}
        />
        {/* Face background - 3D transformed visual layer */}
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
            transformOrigin: 'top center',
            willChange: 'transform',
            backfaceVisibility: 'hidden',
            zIndex: 3,
          }}
        />
        {/* Content layer - flat, no transforms */}
        <div
          ref={contentRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'stretch',
            justifyContent: 'stretch',
            padding: 0,
            overflow: 'visible', // Allow borders to extend beyond container
            borderRadius: `${cornerRadius ?? 0}px`,
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif',
            color: '#333',
            fontSize: 16,
            boxSizing: 'border-box',
            zIndex: 4,
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
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onContextMenuCapture={(e) => {
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
          {/* Realtime ghost will be drawn outside the clipped face container below */}
          {isEditingLabel && (!channel && !userId) ? (
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
                padding: `${searchPadding.containerVertical}px ${searchPadding.containerHorizontal}px ${searchPadding.containerVertical}px ${searchPadding.containerHorizontal}px`
              }}
              onPointerDown={(e) => {
                // Allow events to bubble up for HTMLContainer to handle via isInteractiveTarget
                // Only stop propagation for elements that should be handled locally
              }}
              onPointerUp={stopEventPropagation}
              onWheel={(e) => { e.stopPropagation() }}
            >
              <SearchPopover
                open={isSelected && isEditingLabel}
                side="bottom"
                align="start"
                sideOffset={4}
                avoidCollisions={false}
                query={labelQuery}
                searching={searching}
                error={searchError}
                results={results}
                highlightedIndex={highlightedIndex}
                onHoverIndex={setHighlightedIndex}
                onSelect={(r: SearchResult) => applySearchSelection(r)}
                containerRef={resultsContainerRef}
              >
                <textarea
                  data-interactive="input"
                  ref={searchInputRef as any}
                  value={labelQuery}
                  rows={1}
                  onChange={(e) => setLabelQuery(e.target.value)}
                  placeholder={'search arena'}
                  onPointerDown={(e) => stopEventPropagation(e)}
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
                    fontSize: `${searchFont.fontSizePx}px`,
                    fontWeight: 700,
                    letterSpacing: '-0.015em',
                    color: hasResults ? 'var(--color-text)' : 'rgba(0,0,0,.45)',
                    border: 'none',
                    borderRadius: 0,
                    padding: `${searchPadding.inputVertical}px ${searchPadding.inputLeft}px ${searchPadding.inputVertical}px ${searchPadding.inputLeft}px`,
                    background: 'transparent',
                    width: '100%',
                    boxSizing: 'border-box',
                    outline: 'none',
                    display: 'block',
                    resize: 'none',
                    overflow: 'hidden',
                    lineHeight: searchFont.lineHeight,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                />
              </SearchPopover>
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
                  resetKeys={[deckErrorKey]}
                  onError={(err) => {
                    try {
                      // eslint-disable-next-line no-console
                      // ArenaDeck error, invalidating cache and scheduling remount - no logging
                      if (channel) invalidateArenaChannel(channel)
                      // Schedule remount with fresh state after brief delay
                      setTimeout(() => {
                        setDeckErrorKey(prev => prev + 1)
                      }, 50)
                    } catch {}
                  }}
                  onReset={() => {
                    // ErrorBoundary reset - no logging needed
                  }}
                >
                  <ArenaDeck
                    key={`deck-${channel}-${deckErrorKey}`}
                    cards={cards}
                    width={w}
                    height={h}
                    channelTitle={title || channel}
                    referenceDimensions={referenceDimensions}
                    onCardPointerDown={onCardPointerDownStable}
                    onCardPointerMove={onCardPointerMoveStable}
                    onCardPointerUp={onCardPointerUpStable}
                    initialPersist={memoizedInitialPersist}
                    onPersist={handleDeckPersistStable}
                    selectedCardId={selectedCardId ?? undefined}
                    onSelectCard={handleDeckSelectCardStable}
                    onSelectedCardRectChange={handleSelectedCardRectChangeStable}
                  />
                </ErrorBoundary>
              )}
            </div>
          ) : userId ? (
            predictedLayoutMode === 'mini' ? (
              <InteractiveUserCard
                userName={userName}
                userAvatar={userAvatar}
                width={w}
                height={h}
              />
            ) : predictedLayoutMode === 'tabs' ? (
              <TabsLayout
                tabHeight={28}
                paddingTabsTB={8}
                paddingTabsLR={12}
                tabGap={8}
                containerWidth={w}
                rowRef={null as any}
                lastUserActivityAtRef={null as any}
                onWheelCapture={(e) => { e.stopPropagation() }}
                isUserContent={true}
              >
                <UserLabelDisplay
                  userName={userName}
                  userAvatar={userAvatar}
                  zoom={z}
                  variant="full"
                  fontSizePx={12}
                  fontWeight={700}
                  color="#333"
                  gapPx={8}
                  maxWidthPx={w - 24} // Account for padding
                  onClick={() => {
                    // User selection interaction can be added here if needed
                  }}
                />
              </TabsLayout>
            ) : predictedLayoutMode === 'htabs' ? (
              <VerticalTabsLayout
                userName={userName}
                userAvatar={userAvatar}
              />
            ) : (
              <InteractiveUserCard
                userName={userName}
                userAvatar={userAvatar}
                width={w}
                height={h}
              />
            )
          ) : null}
        </div>

        {/* Panel for shape selection */}
        {isSelected && !isTransforming && !isPointerPressed && !!channel && selectedCardId == null && editor.getSelectedShapeIds().length === 1 ? (
          <ConnectionsPanel
            z={z}
            x={w + gapW + (1 / z)}
            y={(8 / z)}
            widthPx={260}
            maxHeightPx={400}
            title={title || channel}
            author={author ? { id: (author as any).id, username: (author as any).username, full_name: (author as any).full_name, avatar: (author as any).avatar } : undefined}
            createdAt={createdAt}
            updatedAt={updatedAt}
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
            maxHeightPx={400}
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


