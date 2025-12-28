import { useMemo, memo, useCallback, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { AnimatePresence, motion, type Transition } from 'motion/react'
import { useEditor, type TLShapeId } from 'tldraw'
import { formatRelativeTime } from '../../arena/timeUtils'
import { useChannelMetadata } from '../../arena/hooks/useChannelMetadata'
import { useBlockMetadata } from '../../arena/hooks/useBlockMetadata'
import { OverflowCarouselText } from '../../arena/OverflowCarouselText'
import { DESIGN_TOKENS, GHOST_BACKGROUND, SHAPE_BORDER_RADIUS, SHAPE_SHADOW, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_TERTIARY, CARD_BORDER_RADIUS } from '../../arena/constants'
import { usePressFeedback } from '../../hooks/usePressFeedback'
import type { ConnectionItem } from '../../arena/ConnectionsPanel'
import { usePortalSpawnDrag } from '../../arena/hooks/usePortalSpawnDrag'
import { PortalSpawnGhost } from '../../arena/components/PortalSpawnGhost'
import { ScrollFade } from './ScrollFade'
import { PressableListItem } from './PressableListItem'
import type { PortalAuthor, PortalSource } from '../../arena/search/portalSearchTypes'
import { Avatar } from '../../arena/icons'
import { useScreenToPagePoint } from '../../arena/hooks/useScreenToPage'
import { HoverIndicator } from './HoverIndicator'

import { useAuthorMetadata } from '../../arena/hooks/useAuthorMetadata'

type MetadataPanelSelection =
  | { blockId: number }
  | { shapeId: TLShapeId; source: PortalSource; focusedCardId?: number }

interface MetadataPanelProps {
  selection: MetadataPanelSelection
  position: { left: number; top: number; width: number; minHeight: number }
  collapsed: boolean
  onToggleCollapsed: () => void
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
function MetadataPanelPositioner({ position, children }: { 
  position: { left: number; top: number; width: number; minHeight: number }
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
  collapsed,
  onToggleCollapsed,
}: { 
  selection: MetadataPanelSelection
  collapsed: boolean
  onToggleCollapsed: () => void
}) {
  const editor = useEditor()
  const isBlockSelection = 'blockId' in selection
  const blockFocusId = isBlockSelection ? selection.blockId : selection.focusedCardId
  const isBlockFocused = blockFocusId != null
  const source = isBlockSelection ? undefined : selection.source
  const shapeId = isBlockSelection ? undefined : selection.shapeId

  // Keep font size constant on screen
  const scaledFontSize = 12

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

  const connectionsCount = metadata.connections.length
  const panelTransition: Transition = {
    duration: 0.300,
    ease: [0.25, 0.46, 0.45, 0.94],
  }
  const indicatorSize = 24
  const collapsedIndicatorOffsetX = -12

  return (
    <AnimatePresence mode="wait">
      {collapsed ? (
        <motion.div
          key="collapsed"
          initial={{ opacity: 0, y: 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98 }}
          transition={panelTransition}
          style={{
            pointerEvents: 'none',
            transformOrigin: 'top left',
            paddingLeft: 0,
            paddingTop: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            overflow: 'visible',
            willChange: 'transform, opacity',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', paddingLeft: 11 }}>
            <div style={{ position: 'relative', width: indicatorSize, height: indicatorSize }}>
              <HoverIndicator
                connectionsCount={connectionsCount}
                position={{ x: collapsedIndicatorOffsetX, y: indicatorSize / 2 }}
                variant="count"
                interactive
                ariaLabel="Expand metadata panel"
                onClick={onToggleCollapsed}
              />
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="expanded"
          initial={{ opacity: 0, y: 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98 }}
          transition={panelTransition}
          style={{
            pointerEvents: 'none',
            transformOrigin: 'top left',

            // Layout
            paddingLeft: 0,
            paddingTop: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            overflowY: 'auto',
            overflow: 'visible',
            willChange: 'transform, opacity',
          }}
        >
          {/* Metadata Fields */}
          <MetadataFields
            metadata={metadata}
            isBlockFocused={isBlockFocused}
            isAuthorSource={source?.kind === 'author'}
            fontSize={scaledFontSize}
            onAuthorPointerDown={handleAuthorPointerDown}
            onAuthorPointerMove={handleAuthorPointerMove}
            onAuthorPointerUp={handleAuthorPointerUp}
            onToggleCollapsed={onToggleCollapsed}
          />

          {/* Connections - only show if not author source or if a block is focused */}
          {(isBlockFocused || source?.kind !== 'author') && (
            <ConnectionsList
              connections={metadata.connections}
              loading={metadata.loading}
              fontSize={scaledFontSize}
              onConnectionPointerDown={handleConnectionPointerDown}
              onConnectionPointerMove={handleConnectionPointerMove}
              onConnectionPointerUp={handleConnectionPointerUp}
              collapsedConnectionId={collapsedConnectionId}
            />
          )}
          <PortalSpawnGhost
            ghost={ghostState}
            padding={4}
            borderWidth={1}
            borderRadius={SHAPE_BORDER_RADIUS}
            boxShadow={SHAPE_SHADOW}
            background={GHOST_BACKGROUND}
            renderContent={(conn) => {
              const connection = conn as ConnectionItem
              return (
                <div
                  style={{
                    padding: `0px 8px`,
                    minHeight: `${(scaledFontSize * 1.2 * 1.2) + 12}px`,
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    height: '100%',
                    gap: 8,
                  }}
                >
                  <ConnectionRowContent conn={connection} fontSize={scaledFontSize} />
                </div>
              )
            }}
          />

          <PortalSpawnGhost
            ghost={authorGhostState}
            padding={4}
            borderWidth={1}
            borderRadius={SHAPE_BORDER_RADIUS}
            boxShadow={SHAPE_SHADOW}
            background={GHOST_BACKGROUND}
            renderContent={(auth) => {
              const author = auth as PortalAuthor
              return (
                <div
                  style={{
                    padding: `4px 8px`,
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    height: '100%',
                    gap: 8,
                  }}
                >
                  <Avatar src={author.avatarThumb} size={scaledFontSize * 1.2} />
                  <div style={{ fontSize: scaledFontSize, fontWeight: 700, color: TEXT_PRIMARY }}>
                    {author.fullName}
                  </div>
                </div>
              )
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
})

// Public API - Combines positioner and content
export const MetadataPanel = memo(function MetadataPanel({ 
  selection,
  position,
  collapsed,
  onToggleCollapsed
}: MetadataPanelProps) {
  return (
    <MetadataPanelPositioner position={position}>
      <MetadataPanelContent 
        selection={selection}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
      />
    </MetadataPanelPositioner>
  )
})

// Metadata Fields Sub-component
interface MetadataFieldsProps {
  metadata: PanelMetadata
  isBlockFocused: boolean
  isAuthorSource?: boolean
  fontSize: number
  onAuthorPointerDown?: (author: PortalAuthor, e: React.PointerEvent) => void
  onAuthorPointerMove?: (author: PortalAuthor, e: React.PointerEvent) => void
  onAuthorPointerUp?: (author: PortalAuthor, e: React.PointerEvent) => void
  onToggleCollapsed?: () => void
}

const MetadataFields = memo(function MetadataFields({ 
  metadata,
  isBlockFocused,
  isAuthorSource,
  fontSize,
  onAuthorPointerDown,
  onAuthorPointerMove,
  onAuthorPointerUp,
  onToggleCollapsed,
}: MetadataFieldsProps) {
  const { author, createdAt, updatedAt, addedAt, channelCount, followerCount, followingCount } = metadata
  const showAuthor = !isAuthorSource
  const authorName = author?.fullName ?? (metadata.loading ? 'Loading...' : 'Unknown')
  
  const authorPressFeedback = usePressFeedback({
    scale: 0.96,
    hoverScale: 1.02,
    stiffness: 400,
    damping: 25,
    disabled: !author?.fullName,
  })

  const authorStyle: CSSProperties = {
    color: author?.fullName ? TEXT_PRIMARY : TEXT_TERTIARY,
    fontStyle: author?.fullName ? 'normal' : 'italic',
  }
  const indicatorSize = 24

  const renderStatRow = (label: string, value?: number) => {
    return (
      <div style={{ fontSize, color: TEXT_TERTIARY, lineHeight: 1.4, display: 'flex', gap: 6 }}>
        <span>{label}</span>
        <span style={{ color: TEXT_SECONDARY, fontWeight: 600 }}>{value ?? '—'}</span>
      </div>
    )
  }

  const renderDateRow = (label: string, value: string | null | undefined, showRow: boolean) => {
    if (!showRow) return null
    return (
      <div style={{ fontSize, color: TEXT_TERTIARY, lineHeight: 1.4 }}>
        {label}{' '}
        {value ? (
          formatRelativeTime(value)
        ) : (
          <span style={{ fontStyle: 'italic' }}>—</span>
        )}
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: fontSize * 0.6,
      paddingBottom: fontSize * 0.8,
      paddingLeft: 11,
    }}>
      {showAuthor && (
        <div style={{ fontSize, color: TEXT_SECONDARY, display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.4, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flex: 1 }}>
            <span>by</span>
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
                cursor: author?.fullName ? 'pointer' : 'default',
                pointerEvents: author?.fullName ? 'auto' : 'none',
                scale: authorPressFeedback.pressScale,
                willChange: 'transform',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', position: 'relative', top: '-2px' }}>
                <Avatar src={author?.avatarThumb} size={fontSize * 1.1} />
              </span>
              <strong style={authorStyle}>{authorName}</strong>
            </motion.span>
          </div>
          {onToggleCollapsed && (
            <div style={{ position: 'relative', width: indicatorSize, height: indicatorSize, marginLeft: 'auto', flexShrink: 0 }}>
              <HoverIndicator
                connectionsCount={0}
                position={{ x: 0, y: indicatorSize / 2 }}
                variant="close"
                interactive
                ariaLabel="Collapse metadata panel"
                onClick={onToggleCollapsed}
              />
            </div>
          )}
        </div>
      )}

      {isAuthorSource && !isBlockFocused ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', marginBottom: fontSize * -0.2 }}>
            <div style={{ fontSize, color: TEXT_SECONDARY, display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.4, flex: 1 }}>
              <Avatar src={author?.avatarThumb} size={fontSize * 1.1} />
              <strong style={authorStyle}>{authorName}</strong>
            </div>
            {onToggleCollapsed && (
              <div style={{ position: 'relative', width: indicatorSize, height: indicatorSize, marginLeft: 'auto', flexShrink: 0 }}>
                <HoverIndicator
                  connectionsCount={0}
                  position={{ x: 0, y: indicatorSize / 2 }}
                  variant="close"
                  interactive
                  ariaLabel="Collapse metadata panel"
                  onClick={onToggleCollapsed}
                />
              </div>
            )}
          </div>
          {renderStatRow('channels', channelCount)}
          {renderStatRow('followers', followerCount)}
          {renderStatRow('following', followingCount)}
        </>
      ) : (
        <>
          {renderDateRow('created', createdAt, !isBlockFocused)}
          {renderDateRow('updated', updatedAt, !isBlockFocused)}
          {renderDateRow('added', addedAt, isBlockFocused)}
        </>
      )}
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
      gap: fontSize * 0.4,
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
            paddingBottom: 120, // Extra padding for scrolling past the end
            paddingLeft: 10, // Horizontal padding to prevent scale clipping
            paddingRight: 10,
            paddingTop: 0, // Top/bottom padding for vertical scale
            marginLeft: -10, // Pull back to align with parent
            marginRight: -10,
          }}
        >
          <div style={{ height: totalHeight, position: 'relative', width: '100%' }}>
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
                        overflow: 'hidden',
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
