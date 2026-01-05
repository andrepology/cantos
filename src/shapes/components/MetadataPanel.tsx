import { useMemo, memo, useCallback, useState, useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { AnimatePresence, motion, type Transition } from 'motion/react'
import { useEditor, type TLShapeId } from 'tldraw'
import { useChannelMetadata } from '../../arena/hooks/useChannelMetadata'
import { useBlockMetadata } from '../../arena/hooks/useBlockMetadata'
import { OverflowCarouselText } from '../../arena/OverflowCarouselText'
import { DESIGN_TOKENS, SHAPE_BORDER_RADIUS, SHAPE_SHADOW, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_TERTIARY, CARD_BORDER_RADIUS, LABEL_FONT_FAMILY } from '../../arena/constants'
import { usePressFeedback } from '../../hooks/usePressFeedback'
import { usePortalSpawnDrag } from '../../arena/hooks/usePortalSpawnDrag'
import { ScrollFade } from './ScrollFade'
import { PressableListItem } from './PressableListItem'
import type { PortalAuthor, PortalSource } from '../../arena/search/portalSearchTypes'
import { Avatar } from '../../arena/icons'
import { useScreenToPagePoint } from '../../arena/hooks/useScreenToPage'

import { useAuthorMetadata } from '../../arena/hooks/useAuthorMetadata'
import { measureTextWidth } from '../../utils/textMeasurement'

export type ConnectionItem = {
  id: number
  title: string
  slug?: string
  author?: string
  length?: number
}

type MetadataPanelSelection =
  | { blockId: number }
  | { shapeId: TLShapeId; source: PortalSource; focusedCardId?: number }

interface MetadataPanelProps {
  selection: MetadataPanelSelection
  headerPosition: { left: number; top: number; width: number; height: number }
  connectionsPosition: { left: number; top: number; width: number; minHeight: number }
}

interface PanelMetadata {
  connections: ConnectionItem[]
  author: PortalAuthor | null
  createdAt?: string | null
  updatedAt?: string | null
  addedAt?: string | null
  // Author specific stats
  channelCount?: number
  followerCount?: number
  followingCount?: number
  loading?: boolean
}

const PANEL_WIDTH = 256 // Panel width (screen px)
const EMPTY_CONNECTIONS: ConnectionItem[] = []

// Outer "Positioner" - Only tracks position, re-renders on camera movement
// This is intentionally NOT memoized because position changes every frame
function MetadataPanelPositioner({
  position,
  children,
}: {
  position: { left: number; top: number; width: number; minHeight?: number; height?: number }
  children: ReactNode
}) {
  return (
    <div
      data-focus-ui="true"
      style={{
        position: 'fixed',
        left: position.left,
        top: position.top,
        width: position.width,
        minHeight: position.minHeight,
        height: position.height,
        pointerEvents: 'none',
        zIndex: 1001,
      }}
    >
      {children}
    </div>
  )
}

// Inner "Content" - Memoized to avoid re-rendering expensive hooks/lists when only position changes
const MetadataPanelContent = memo(function MetadataPanelContent({
  selection,
  headerPosition,
  connectionsPosition,
}: {
  selection: MetadataPanelSelection
  headerPosition: { left: number; top: number; width: number; height: number }
  connectionsPosition: { left: number; top: number; width: number; minHeight: number }
}) {
  const editor = useEditor()
  const isBlockSelection = 'blockId' in selection
  const blockFocusId = isBlockSelection ? selection.blockId : selection.focusedCardId
  const isBlockFocused = blockFocusId != null
  const source = isBlockSelection ? undefined : selection.source
  const shapeId = isBlockSelection ? undefined : selection.shapeId

  // Keep font size constant on screen
  const scaledFontSize = 13

  // Extract channel slug and author ID for metadata hooks
  const channelSlug = source && source.kind === 'channel' ? source.slug : undefined
  const authorId = source && source.kind === 'author' ? source.id : undefined

  // Fetch metadata from Jazz cache (or null if not found)
  // These hooks only run when Content re-renders, which only happens when source/focus changes
  const channelMetadata = useChannelMetadata(channelSlug)
  const authorMetadata = useAuthorMetadata(authorId)
  // O(1) lookup via global blocks registry - no channel slug needed
  const blockMetadata = useBlockMetadata(blockFocusId)

  // Get metadata - memoized to avoid recreating objects on every render
  const metadata = useMemo<PanelMetadata>(() => {
    // If we have a focused block, it always takes precedence
    if (isBlockFocused) {
      return {
        connections: blockMetadata?.connections ?? EMPTY_CONNECTIONS,
        author: blockMetadata?.author ? {
          id: blockMetadata.author.id,
          fullName: blockMetadata.author.name,
          avatarThumb: blockMetadata.author.avatarThumb
        } : null,
        addedAt: blockMetadata?.addedAt ?? undefined,
        loading: blockMetadata?.loading ?? false,
      }
    }

    // Otherwise show metadata for the active source (channel or author)
    if (source?.kind === 'author') {
      return {
        connections: EMPTY_CONNECTIONS, // We drop connections for author view as requested
        author: {
          id: source.id,
          fullName: authorMetadata?.fullName || source.fullName,
          avatarThumb: authorMetadata?.avatarThumb || source.avatarThumb
        },
        channelCount: authorMetadata?.channelCount,
        followerCount: authorMetadata?.followerCount,
        followingCount: authorMetadata?.followingCount,
        loading: authorMetadata?.loading ?? false,
      }
    }

    // Default to channel metadata
    return {
      connections: channelMetadata?.connections ?? EMPTY_CONNECTIONS,
      author: channelMetadata?.author ? {
        id: channelMetadata.author.id,
        fullName: channelMetadata.author.name,
        avatarThumb: channelMetadata.author.avatarThumb
      } : null,
      createdAt: channelMetadata?.createdAt,
      updatedAt: channelMetadata?.updatedAt,
      loading: channelMetadata?.loading ?? false,
    }
  }, [isBlockFocused, source, channelMetadata, blockMetadata, authorMetadata])

  const screenToPagePoint = useScreenToPagePoint()
  const [collapsedConnectionId, setCollapsedConnectionId] = useState<number | null>(null)
  const clearCollapsedConnection = useCallback(() => setCollapsedConnectionId(null), [])
  const handleConnectionSpawned = useCallback((conn: ConnectionItem) => {
    setCollapsedConnectionId(conn.id)
  }, [])

  const getConnectionSpawnPayload = useCallback((conn: ConnectionItem) => {
    if (!conn.slug) return null
    return { kind: 'channel' as const, slug: conn.slug, title: conn.title }
  }, [])

  const portalSpawnDimensions = useMemo(() => ({ w: 180, h: 180 }), [])

  // Unified click handler for author/connection chips
  const handleSpawnClick = useCallback((payload: { kind: 'channel'; slug: string; title?: string } | { kind: 'author'; userId: number; userName: string; userAvatar?: string }) => {
    if (!shapeId) return
    const currentShape = editor.getShape(shapeId)
    if (!currentShape || currentShape.type !== 'tactile-portal') return

    const sourceUpdate = payload.kind === 'channel'
      ? { kind: 'channel' as const, slug: payload.slug, title: payload.title }
      : { kind: 'author' as const, id: payload.userId, fullName: payload.userName, avatarThumb: payload.userAvatar }

    editor.updateShape({
      id: shapeId,
      type: 'tactile-portal',
      props: {
        source: sourceUpdate,
        scrollOffset: 0,
        focusedCardId: undefined,
      },
    })
  }, [editor, shapeId])

  const {
    ghostState,
    handlePointerDown: handleConnectionPointerDown,
    handlePointerMove: handleConnectionPointerMove,
    handlePointerUp: handleConnectionPointerUp,
  } = usePortalSpawnDrag<ConnectionItem>({
    thresholdPx: 12,
    screenToPagePoint,
    getSpawnPayload: getConnectionSpawnPayload,
    defaultDimensions: portalSpawnDimensions,
    selectSpawnedShape: false,
    onClick: handleSpawnClick,
    onSpawned: handleConnectionSpawned,
    onSessionEnd: clearCollapsedConnection,
  })

  const getAuthorSpawnPayload = useCallback((author: PortalAuthor) => {
    return { 
      kind: 'author' as const, 
      userId: author.id, 
      userName: author.fullName || '', 
      userAvatar: author.avatarThumb 
    }
  }, [])

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
    onClick: handleSpawnClick,
  })

  const panelTransition: Transition = {
    duration: 0.300,
    ease: [0.25, 0.46, 0.45, 0.94],
  }
  const dateLabels = useMemo(() => {
    const formatDateLabel = (rawDate?: string | null) => {
      if (!rawDate) return null
      const date = new Date(rawDate)
      if (Number.isNaN(date.getTime())) return null
      const now = new Date()
      const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
      const month = date.toLocaleDateString('en-US', { month: 'short' })
      const day = date.getDate()
      const year = date.toLocaleDateString('en-US', { year: '2-digit' })
      return date >= oneYearAgo ? `${month} ${day}` : `${month} '${year}`
    }

    const created = formatDateLabel(isBlockFocused ? metadata.addedAt : metadata.createdAt)
    const edited = formatDateLabel(metadata.updatedAt)
    return { created, edited }
  }, [isBlockFocused, metadata.addedAt, metadata.createdAt, metadata.updatedAt])

  return (
    <>
      <MetadataPanelPositioner position={headerPosition}>
        <motion.div
          initial={{ opacity: 0, y: 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98 }}
          transition={panelTransition}
          style={{
            pointerEvents: 'none',
            transformOrigin: 'top left',
            paddingLeft: 0,
            paddingTop: 8,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'visible',
            willChange: 'transform, opacity',
          }}
        >
          <MetadataHeader
            author={metadata.author}
            loading={metadata.loading}
            createdLabel={dateLabels.created}
            editedLabel={dateLabels.edited}
            onAuthorPointerDown={handleAuthorPointerDown}
            onAuthorPointerMove={handleAuthorPointerMove}
            onAuthorPointerUp={handleAuthorPointerUp}
          />
        </motion.div>
      </MetadataPanelPositioner>

      <MetadataPanelPositioner position={connectionsPosition}>
        <motion.div
          initial={{ opacity: 0, y: 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98 }}
          transition={panelTransition}
          style={{
            pointerEvents: 'none',
            transformOrigin: 'top left',
            paddingLeft: 0,
            paddingTop: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            overflow: 'visible',
            willChange: 'transform, opacity',
          }}
        >
          <ConnectionsList
            connections={metadata.connections}
            loading={metadata.loading}
            fontSize={scaledFontSize}
            onConnectionPointerDown={handleConnectionPointerDown}
            onConnectionPointerMove={handleConnectionPointerMove}
            onConnectionPointerUp={handleConnectionPointerUp}
            collapsedConnectionId={collapsedConnectionId}
          />
        </motion.div>
      </MetadataPanelPositioner>
    </>
  )
})

// Public API - Combines positioner and content
export const MetadataPanel = memo(function MetadataPanel({ 
  selection,
  headerPosition,
  connectionsPosition,
}: MetadataPanelProps) {
  return (
    <MetadataPanelContent 
      selection={selection}
      headerPosition={headerPosition}
      connectionsPosition={connectionsPosition}
    />
  )
})

// Metadata Header Sub-component
interface MetadataHeaderProps {
  author: PortalAuthor | null
  loading?: boolean
  createdLabel: string | null
  editedLabel: string | null
  onAuthorPointerDown?: (author: PortalAuthor, e: React.PointerEvent) => void
  onAuthorPointerMove?: (author: PortalAuthor, e: React.PointerEvent) => void
  onAuthorPointerUp?: (author: PortalAuthor, e: React.PointerEvent) => void
}

const MetadataHeader = memo(function MetadataHeader({
  author,
  loading,
  createdLabel,
  editedLabel,
  onAuthorPointerDown,
  onAuthorPointerMove,
  onAuthorPointerUp,
}: MetadataHeaderProps) {
  const authorName = author?.fullName ?? (loading ? 'Loading...' : 'Unknown')
  const headerFontSize = 14
  const headerIconSize = 12
  const headerLetterSpacing = '0.0125em'
  const [showEdited, setShowEdited] = useState(false)
  const headerRef = useRef<HTMLDivElement>(null)
  const [headerWidth, setHeaderWidth] = useState(0)

  useEffect(() => {
    if (!createdLabel || !editedLabel) return
    const intervalId = window.setInterval(() => {
      setShowEdited((prev) => !prev)
    }, 4000)
    return () => window.clearInterval(intervalId)
  }, [createdLabel, editedLabel])

  useEffect(() => {
    if (!headerRef.current) return
    const ro = new ResizeObserver((entries) => {
      setHeaderWidth(entries[0].contentRect.width)
    })
    ro.observe(headerRef.current)
    return () => ro.disconnect()
  }, [])

  const widths = useMemo(() => {
    const nameWidth = measureTextWidth(authorName, 14, LABEL_FONT_FAMILY, 600)
    // AuthorTotal = Avatar(12) + Gap(4) + NameWidth
    const authorTotal = 12 + 4 + nameWidth
    
    const createdW = createdLabel ? measureTextWidth(`created ${createdLabel}`, 11, LABEL_FONT_FAMILY, 550) : 0
    const editedW = editedLabel ? measureTextWidth(`edited ${editedLabel}`, 11, LABEL_FONT_FAMILY, 550) : 0
    const dateMax = Math.max(createdW, editedW)
    
    return { authorTotal, dateMax }
  }, [authorName, createdLabel, editedLabel])

  // Threshold: Author + Date + Gap (12) + Padding (20) + Buffer (10)
  // headerWidth is the content box width (excluding padding).
  // But we need to account for padding if we compare against full container width?
  // No, headerWidth comes from contentRect, so it IS the available space inside padding.
  // So we just need Author + Date + Gap + Buffer.
  const showDate = headerWidth > (widths.authorTotal + widths.dateMax + 12 + 10)

  const authorPressFeedback = usePressFeedback({
    scale: 0.96,
    hoverScale: 1.05,
    stiffness: 400,
    damping: 25,
    disabled: !author?.fullName,
  })

  const authorStyle: CSSProperties = {
    color: author?.fullName ? TEXT_PRIMARY : TEXT_TERTIARY,
    fontStyle: author?.fullName ? 'normal' : 'italic',
  }

  return (
    <div 
      ref={headerRef}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        paddingLeft: 8,
        paddingRight: 12,
        height: '100%',
        minWidth: 0,
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'baseline',
          gap: 4,
          minWidth: 0,
          color: TEXT_SECONDARY,
          fontFamily: LABEL_FONT_FAMILY,
          letterSpacing: headerLetterSpacing,
          flex: '1 1 auto',
        }}
      >
        <motion.span
          {...authorPressFeedback.bind}
          onPointerDown={(e) => {
            authorPressFeedback.bind.onPointerDown(e)
            if (author) onAuthorPointerDown?.(author, e)
          }}
          onPointerMove={(e) => {
            if (author) onAuthorPointerMove?.(author, e)
          }}
          onPointerUp={(e) => {
            authorPressFeedback.bind.onPointerUp(e)
            if (author) onAuthorPointerUp?.(author, e)
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            minWidth: 0,
            flex: '1 1 auto',
            scale: authorPressFeedback.pressScale,
            willChange: 'transform',
            cursor: author?.fullName ? 'pointer' : 'default',
            pointerEvents: author?.fullName ? 'auto' : 'none',
          }}
        >
          <span
            style={{
              width: headerIconSize,
              height: headerIconSize,
              position: 'relative',
              flex: '0 0 auto',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Avatar src={author?.avatarThumb} size={headerIconSize} />
          </span>
          <span
            style={{
              display: 'block',
              fontSize: `${headerFontSize}px`,
              color: authorStyle.color,
              fontStyle: authorStyle.fontStyle,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
              flex: '1 1 auto',
              fontWeight: 600,
            }}
          >
            {authorName}
          </span>
        </motion.span>
      </span>
      <AnimatePresence>
        {showDate && (createdLabel || editedLabel) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ 
              position: 'relative', 
              minWidth: 0, 
              flexShrink: 0, 
              alignSelf: 'baseline',
              overflow: 'hidden',
              whiteSpace: 'nowrap'
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {showEdited && editedLabel ? (
                <motion.span
                  key="edited"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  style={{
                    fontSize: 12,
                    color: TEXT_TERTIARY,
                    fontWeight: 600,
                    letterSpacing: '-0.01em',
                    display: 'block',
                    whiteSpace: 'nowrap',
                  }}
                >
                  edited {editedLabel}
                </motion.span>
              ) : createdLabel ? (
                <motion.span
                  key="created"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  style={{
                    fontSize: 12,
                    color: TEXT_TERTIARY,
                    fontWeight: 600,
                    letterSpacing: '-0.01em',
                    display: 'block',
                    whiteSpace: 'nowrap',
                  }}
                >
                  created {createdLabel}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

// Connection Item Sub-component - separated to properly use hooks
interface ConnectionItemComponentProps {
  conn: ConnectionItem
  fontSize: number
  onPointerDown?: (conn: ConnectionItem, e: React.PointerEvent) => void
  onPointerMove?: (conn: ConnectionItem, e: React.PointerEvent) => void
  onPointerUp?: (conn: ConnectionItem, e: React.PointerEvent) => void
}

const ConnectionItemComponent = memo(function ConnectionItemComponent({
  conn,
  fontSize,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: ConnectionItemComponentProps) {
  return (
    <PressableListItem
      data-interactive="connection-item"
      pressScale={0.98}
      hoverScale={1.02}
      stiffness={400}
      damping={25}
      style={{
        minHeight: `${(fontSize * 1.2 * 1.2) + 14}px`,
        display: 'flex',
        alignItems: 'center',
      }}
      onPointerDown={(e) => {
        onPointerDown?.(conn, e)
        e.stopPropagation()
      }}
      onPointerMove={(e) => {
        onPointerMove?.(conn, e)
        e.stopPropagation()
      }}
      onPointerUp={(e) => {
        onPointerUp?.(conn, e)
        e.stopPropagation()
      }}
      onClick={(e) => {
        e.stopPropagation()
        // TODO: Handle connection item click navigation
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          minWidth: 0,
          gap: 8,
        }}
      >
        <ConnectionRowContent conn={conn} fontSize={fontSize} />
      </div>
    </PressableListItem>
  )
})

// Connections List Sub-component
interface ConnectionsListProps {
  connections: ConnectionItem[]
  loading?: boolean
  fontSize: number
  onConnectionPointerDown?: (conn: ConnectionItem, e: React.PointerEvent) => void
  onConnectionPointerMove?: (conn: ConnectionItem, e: React.PointerEvent) => void
  onConnectionPointerUp?: (conn: ConnectionItem, e: React.PointerEvent) => void
  collapsedConnectionId?: number | null
}


const ITEM_HEIGHT = 36
const VIEWPORT_HEIGHT = 300
const OVERSCAN = 3
const LOADING_PLACEHOLDER_COUNT = 4

const ConnectionsList = memo(function ConnectionsList({
  connections,
  loading,
  fontSize,
  onConnectionPointerDown,
  onConnectionPointerMove,
  onConnectionPointerUp,
  collapsedConnectionId,
}: ConnectionsListProps) {
  const [scrollTop, setScrollTop] = useState(0)
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  const connectionCount = connections?.length || 0
  const collapsedId = collapsedConnectionId ?? null

  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN)
  const endIndex = Math.min(connectionCount, Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ITEM_HEIGHT) + OVERSCAN)
  const visibleConnections = connections.slice(startIndex, endIndex)
  const totalHeight = connectionCount * ITEM_HEIGHT
  const offsetY = startIndex * ITEM_HEIGHT

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: fontSize * 0.1,
      flex: 1,
      minHeight: 0
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: fontSize * 0.4,
        marginBottom: fontSize * 0.6,
        paddingLeft: 8,
      }}>
        <div style={{
          fontSize: fontSize * 0.8,
          fontWeight: 700,
          color: TEXT_SECONDARY,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          flexShrink: 0
        }}>
          Connections
        </div>
        <AnimatePresence>
          {!loading && connectionCount > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                color: TEXT_TERTIARY,
                fontSize: 8,
                letterSpacing: '-0.01em',
                fontWeight: 700,
                lineHeight: 1,
                flexShrink: 0
              }}>
              {connectionCount}
            </motion.div>
          )}
        </AnimatePresence>
        
      </div>
      {loading && connectionCount > 0 ? (
        <div style={{ paddingLeft: 8, paddingRight: 8 }}>
          {Array.from({ length: LOADING_PLACEHOLDER_COUNT }).map((_, index) => (
            <div
              key={`connection-placeholder-${index}`}
              style={{
                height: ITEM_HEIGHT,
                borderRadius: CARD_BORDER_RADIUS,
                background: DESIGN_TOKENS.colors.border,
                opacity: 0.4,
                marginBottom: 4,
              }}
            />
          ))}
        </div>
      ) : connectionCount === 0 ? (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ fontSize: fontSize * 0.9, color: TEXT_TERTIARY, fontStyle: 'italic', paddingLeft: 8 }}
        >
          No connections
        </motion.div>
      ) : (
        <ScrollFade
          onScroll={handleScroll}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            flex: 1,
            maxHeight: VIEWPORT_HEIGHT,
            overflowY: 'scroll',
            overflowX: 'visible',
            marginLeft: -10, // Pull back to align with parent
            marginRight: -10,
            
          }}
        >
          <div style={{ 
            height: totalHeight + 130, // totalHeight + paddingTop + paddingBottom
            position: 'relative', 
            width: '100%',
            padding: '0px 10px 120px 10px',
            boxSizing: 'border-box'
          }}>
            <div style={{ transform: `translateY(${offsetY}px)` }}>
              <AnimatePresence mode="popLayout">
                {visibleConnections.map((conn) => {
                  const isCollapsed = conn.id === collapsedId
                  return (
                    <motion.div
                      key={conn.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ 
                        opacity: isCollapsed ? 0 : 1,
                        y: 0,
                        maxHeight: isCollapsed ? 0 : 80,
                        scale: isCollapsed ? 0.9 : 1,
                        marginBottom: isCollapsed ? 0 : 4,
                      }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{
                        opacity: { duration: 0.16 },
                        default: { duration: 0.2, ease: 'easeOut' }
                      }}
                      style={{
                        overflow: isCollapsed ? 'hidden' : 'visible',
                        flexShrink: 0,
                        pointerEvents: isCollapsed ? 'none' : 'auto',
                        transformOrigin: 'center left',
                      }}
                    >
                      <ConnectionItemComponent
                        conn={conn}
                        fontSize={fontSize}
                        onPointerDown={onConnectionPointerDown}
                        onPointerMove={onConnectionPointerMove}
                        onPointerUp={onConnectionPointerUp}
                      />
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          </div>
        </ScrollFade>
      )}
    </div>
  )
})

interface ConnectionRowContentProps {
  conn: ConnectionItem
  fontSize: number
}

function ConnectionRowContent({ conn, fontSize }: ConnectionRowContentProps) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
        <OverflowCarouselText
          text={conn.title}
          maxWidthPx={Math.floor((PANEL_WIDTH - 24) * 0.8)}
          gapPx={32}
          speedPxPerSec={50}
          fadePx={16}
          textStyle={{
            fontSize: fontSize * 0.9,
            fontWeight: 700,
            color: TEXT_PRIMARY,
            lineHeight: 1.2,
          }}
        />
        {conn.length !== undefined && (
          <div style={{
            color: TEXT_TERTIARY,
            fontSize: fontSize * 0.8,
            letterSpacing: '-0.01em',
            fontWeight: 700,
            lineHeight: 1.2,
            flexShrink: 0
          }}>
            {conn.length >= 1000
              ? `${(conn.length / 1000).toFixed(1)}k`.replace('.0k', 'k')
              : conn.length
            }
          </div>
        )}
      </div>
      {/* Right-side metadata: author pinned to right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 'auto' }}>
        {conn.author && (
          <div
            title={conn.author}
            style={{ color: TEXT_TERTIARY, fontSize: fontSize * 0.75, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}
          >
            {conn.author}
          </div>
        )}
      </div>
    </>
  )
}
