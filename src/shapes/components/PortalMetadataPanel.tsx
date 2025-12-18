import { useMemo, memo, useCallback } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { motion } from 'motion/react'
import { useEditor, type TLShapeId } from 'tldraw'
import { formatRelativeTime } from '../../arena/timeUtils'
import { useChannelMetadata } from '../../arena/hooks/useChannelMetadata'
import { useBlockMetadata } from '../../arena/hooks/useBlockMetadata'
import { OverflowCarouselText } from '../../arena/OverflowCarouselText'
import { BACKDROP_BLUR, DESIGN_TOKENS, GHOST_BACKGROUND, SHAPE_BORDER_RADIUS, SHAPE_SHADOW, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_TERTIARY, CARD_BORDER_RADIUS } from '../../arena/constants'
import { usePressFeedback } from '../../hooks/usePressFeedback'
import type { ConnectionItem } from '../../arena/ConnectionsPanel'
import { usePortalSpawnDrag } from '../../arena/hooks/usePortalSpawnDrag'
import { PortalSpawnGhost } from '../../arena/components/PortalSpawnGhost'
import { ScrollFade } from './ScrollFade'

interface PortalMetadataPanelProps {
  shapeId: TLShapeId
  source: any // effectively PortalSource
  focusedCardId?: number
  position: { left: number; top: number; width: number; minHeight: number }
}

interface PanelMetadata {
  connections: ConnectionItem[]
  channelAuthor: { id: number; name: string } | null
  channelCreatedAt: string | null
  channelUpdatedAt: string | null
  blockAuthor: { id: number; name: string } | null
  blockAddedAt: string | null
}

const PANEL_WIDTH = 220 // Panel width (screen px)
const EMPTY_CONNECTIONS: ConnectionItem[] = []

// Outer "Positioner" - Only tracks position, re-renders on camera movement
// This is intentionally NOT memoized because position changes every frame
function PortalMetadataPanelPositioner({ position, children }: { 
  position: { left: number; top: number; width: number; minHeight: number }
  children: ReactNode 
}) {
  return (
    <div
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
const PortalMetadataPanelContent = memo(function PortalMetadataPanelContent({ 
  shapeId, 
  source, 
  focusedCardId 
}: { 
  shapeId: TLShapeId
  source: any // effectively PortalSource
  focusedCardId?: number 
}) {
  const editor = useEditor()
  
  const isBlockFocused = focusedCardId != null

  // Keep font size constant on screen
  const scaledFontSize = 11

  // Extract channel slug for metadata hook
  const channelSlug = source && source.kind === 'channel' ? source.slug : undefined

  // Fetch real metadata from Jazz cache (or null if not found)
  // These hooks only run when Content re-renders, which only happens when source/focus changes
  const realChannelMetadata = useChannelMetadata(channelSlug)
  const realBlockMetadata = useBlockMetadata(channelSlug, focusedCardId)

  // Get metadata - memoized to avoid recreating objects on every render
  const metadata = useMemo<PanelMetadata>(() => ({
    connections: realChannelMetadata?.connections ?? EMPTY_CONNECTIONS,
    channelAuthor: realChannelMetadata?.author ?? null,
    channelCreatedAt: realChannelMetadata?.createdAt ?? null,
    channelUpdatedAt: realChannelMetadata?.updatedAt ?? null,
    
    blockAuthor: realBlockMetadata?.author ?? null,
    blockAddedAt: realBlockMetadata?.addedAt ?? null,
  }), [realChannelMetadata, realBlockMetadata])

  const screenToPagePoint = useCallback((clientX: number, clientY: number) => {
    const anyEditor = editor as any
    return (
      anyEditor?.screenToPage?.({ x: clientX, y: clientY }) ||
      anyEditor?.viewportScreenToPage?.({ x: clientX, y: clientY }) ||
      { x: editor.getViewportPageBounds().midX, y: editor.getViewportPageBounds().midY }
    )
  }, [editor])

  const getConnectionSpawnPayload = useCallback((conn: ConnectionItem) => {
    if (!conn.slug) return null
    return { kind: 'channel' as const, slug: conn.slug, title: conn.title }
  }, [])

  const portalSpawnDimensions = useMemo(() => ({ w: 180, h: 180 }), [])

  // Memoize the onClick handler to prevent usePortalSpawnDrag from returning new handlers
  const handleConnectionClick = useCallback((payload: any) => {
    const currentShape = editor.getShape(shapeId)
    if (!currentShape || currentShape.type !== 'tactile-portal') return
    if (payload.kind !== 'channel') return
    editor.updateShape({
      id: shapeId,
      type: 'tactile-portal',
      props: {
        source: {
          kind: 'channel',
          slug: payload.slug,
          title: payload.title,
        },
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
    onClick: handleConnectionClick,
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{
        duration: 0.300,
        ease: [0.25, 0.46, 0.45, 0.94]
      }}
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
        source={isBlockFocused ? 'block' : 'channel'}
        author={isBlockFocused ? metadata.blockAuthor : metadata.channelAuthor}
        createdAt={!isBlockFocused ? (metadata.channelCreatedAt ?? undefined) : undefined}
        updatedAt={!isBlockFocused ? (metadata.channelUpdatedAt ?? undefined) : undefined}
        addedAt={isBlockFocused ? (metadata.blockAddedAt ?? undefined) : undefined}
        fontSize={scaledFontSize}
      />

      {/* Connections */}
      <ConnectionsList
        connections={metadata.connections}
        fontSize={scaledFontSize}
        onConnectionPointerDown={handleConnectionPointerDown}
        onConnectionPointerMove={handleConnectionPointerMove}
        onConnectionPointerUp={handleConnectionPointerUp}
      />
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
    </motion.div>
  )
})

// Public API - Combines positioner and content
export const PortalMetadataPanel = memo(function PortalMetadataPanel({ 
  shapeId, 
  source, 
  focusedCardId,
  position
}: PortalMetadataPanelProps) {
  return (
    <PortalMetadataPanelPositioner position={position}>
      <PortalMetadataPanelContent 
        shapeId={shapeId}
        source={source}
        focusedCardId={focusedCardId}
      />
    </PortalMetadataPanelPositioner>
  )
})

// Metadata Fields Sub-component
interface MetadataFieldsProps {
  source: 'channel' | 'block'
  author?: { id: number; name: string } | null
  createdAt?: string
  updatedAt?: string
  addedAt?: string
  fontSize: number
}

const MetadataFields = memo(function MetadataFields({ source, author, createdAt, updatedAt, addedAt, fontSize }: MetadataFieldsProps) {
  const showAuthor = source === 'channel' || !!author
  const authorName = author?.name ?? '?missing'
  const authorStyle: CSSProperties = {
    color: TEXT_PRIMARY,
    fontStyle: author?.name ? 'normal' : 'italic',
  }

  const renderDateRow = (label: string, value?: string, showFallback?: boolean) => {
    if (!value && !showFallback) return null
    return (
      <div style={{ fontSize, color: TEXT_TERTIARY, lineHeight: 1.4 }}>
        {label}{' '}
        {value ? (
          formatRelativeTime(value)
        ) : (
          <span style={{ fontStyle: 'italic' }}>n.d.</span>
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
        <div style={{ fontSize, color: TEXT_SECONDARY, lineHeight: 1.4 }}>
          by <strong style={authorStyle}>{authorName}</strong>
        </div>
      )}
      {renderDateRow('created', createdAt, source === 'channel')}
      {renderDateRow('updated', updatedAt, source === 'channel')}
      {renderDateRow('added', addedAt, source === 'block')}
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
  // Hook called at component top level - this is the correct pattern
  const pressFeedback = usePressFeedback({
    scale: 0.98,
    hoverScale: 1.02, // Reduced from default 1.02 to prevent clipping
    stiffness: 400,
    damping: 25
  })

  return (
    <motion.div
      data-interactive="connection-item"
      style={{
        padding: `6px 8px`,
        borderRadius: CARD_BORDER_RADIUS,
        border: `1px solid ${DESIGN_TOKENS.colors.border}`,
        background: GHOST_BACKGROUND,
        backdropFilter: `blur(${BACKDROP_BLUR})`,
        transition: 'background 120ms ease',
        pointerEvents: 'auto',
        minHeight: `${(fontSize * 1.2 * 1.2) + 12}px`,
        display: 'flex',
        alignItems: 'center',
        scale: pressFeedback.pressScale,
        transformOrigin: 'center center', // Scale from center
        willChange: 'transform',
        cursor: 'pointer',
      }}
      {...pressFeedback.bind}
      onPointerDown={(e) => {
        pressFeedback.bind.onPointerDown(e)
        onPointerDown?.(conn, e)
        e.stopPropagation()
      }}
      onPointerMove={(e) => {
        onPointerMove?.(conn, e)
        e.stopPropagation()
      }}
      onPointerUp={(e) => {
        pressFeedback.bind.onPointerUp(e)
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
    </motion.div>
  )
})

// Connections List Sub-component
interface ConnectionsListProps {
  connections: ConnectionItem[]
  fontSize: number
  onConnectionPointerDown?: (conn: ConnectionItem, e: React.PointerEvent) => void
  onConnectionPointerMove?: (conn: ConnectionItem, e: React.PointerEvent) => void
  onConnectionPointerUp?: (conn: ConnectionItem, e: React.PointerEvent) => void
}


const ConnectionsList = memo(function ConnectionsList({
  connections,
  fontSize,
  onConnectionPointerDown,
  onConnectionPointerMove,
  onConnectionPointerUp,
}: ConnectionsListProps) {


  const connectionCount = connections?.length || 0

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
        <div style={{
          color: TEXT_TERTIARY,
          fontSize: 8,
          letterSpacing: '-0.01em',
          fontWeight: 700,
          lineHeight: 1,
          flexShrink: 0
        }}>
          {connectionCount}
        </div>
        
      </div>
      {connectionCount === 0 ? (
        <div style={{ fontSize: fontSize * 0.9, color: TEXT_TERTIARY, fontStyle: 'italic' }}>
          No connections
        </div>
      ) : (
        <ScrollFade
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            flex: 1,
            maxHeight: 300,
            overflowY: 'scroll',
            overflowX: 'visible',
            paddingBottom: 120, // Extra padding for scrolling past the end
            paddingLeft: 10, // Horizontal padding to prevent scale clipping
            paddingRight: 10,
            paddingTop: 4, // Top/bottom padding for vertical scale
            marginLeft: -10, // Pull back to align with parent
            marginRight: -10,
          }}
        >
          {connections.map((conn) => (
            <ConnectionItemComponent
              key={conn.id}
              conn={conn}
              fontSize={fontSize}
              onPointerDown={onConnectionPointerDown}
              onPointerMove={onConnectionPointerMove}
              onPointerUp={onConnectionPointerUp}
            />
          ))}
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