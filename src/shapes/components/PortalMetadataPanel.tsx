import { useMemo, memo, useCallback } from 'react'
import { motion } from 'motion/react'
import { track, useEditor, useValue, type TLShapeId } from 'tldraw'
import { formatRelativeTime } from '../../arena/timeUtils'
import { getChannelMetadata, getBlockMetadata, getDefaultChannelMetadata, getDefaultBlockMetadata } from '../../arena/mockMetadata'
import { OverflowCarouselText } from '../../arena/OverflowCarouselText'
import { BACKDROP_BLUR, DESIGN_TOKENS, GHOST_BACKGROUND, SHAPE_BORDER_RADIUS, SHAPE_SHADOW, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_TERTIARY, CARD_BORDER_RADIUS } from '../../arena/constants'
import { usePressFeedback } from '../../hooks/usePressFeedback'
import type { TactilePortalShape } from '../TactilePortalShape'
import type { ConnectionItem } from '../../arena/ConnectionsPanel'
import { usePortalSpawnDrag } from '../../arena/hooks/usePortalSpawnDrag'
import { PortalSpawnGhost } from '../../arena/components/PortalSpawnGhost'

interface PortalMetadataPanelProps {
  shapeId: TLShapeId
}

const GAP_SCREEN = 16 // Gap between portal and panel (screen px)
const PANEL_WIDTH = 220 // Panel width (screen px)
const MIN_PANEL_HEIGHT = 320 // Minimum panel height (screen px)

export const PortalMetadataPanel = memo(track(function PortalMetadataPanel({ shapeId }: PortalMetadataPanelProps) {


  const editor = useEditor()
  // Track camera zoom reactively (camera uses z for zoom)
  const zoom = useValue('cameraZoom', () => editor.getCamera().z, [editor]) || 1
  // Shape-dependent calculations
  const shape = editor.getShape(shapeId) as TactilePortalShape | undefined
  const pageBounds = shape && shape.type === 'tactile-portal' ? editor.getShapePageBounds(shape) : null

  // Calculate panel anchor in page space (use defaults when invalid)
  const panelPageX = pageBounds ? pageBounds.maxX : 0
  const panelPageY = pageBounds ? pageBounds.minY : 0

  // Transform anchor (top-left) page → screen coordinates
  const anchor = editor.pageToScreen({ x: panelPageX, y: panelPageY })

  const positioning = {
    left: anchor.x + GAP_SCREEN, // fixed screen-space gap
    top: anchor.y,
  }

  // Determine source (channel vs block) - safe defaults when shape is invalid
  const isBlockFocused = shape?.props.focusedCardId != null

  // Keep font size constant on screen
  const scaledFontSize = 11

  // Get metadata - memoized to avoid recreating objects on every render
  const metadata = useMemo(() => {
    if (!shape) {
      const defaultMetadata = getDefaultChannelMetadata()
      return {
        connections: defaultMetadata.connections,
        channelAuthor: defaultMetadata.author,
        channelCreatedAt: defaultMetadata.createdAt,
        channelUpdatedAt: defaultMetadata.updatedAt,
        blockAuthor: getDefaultBlockMetadata().author,
        blockAddedAt: getDefaultBlockMetadata().addedAt,
      }
    }

    const channelSlug =
      shape.props.source && (shape.props.source as any).kind === 'channel'
        ? (shape.props.source as any).slug
        : undefined

    const channelMetadata = channelSlug
      ? getChannelMetadata(channelSlug) || getDefaultChannelMetadata()
      : getDefaultChannelMetadata()

    const blockMetadata = shape.props.focusedCardId
      ? getBlockMetadata(shape.props.focusedCardId) || getDefaultBlockMetadata()
      : getDefaultBlockMetadata()

    return {
      connections: channelMetadata.connections,
      channelAuthor: channelMetadata.author,
      channelCreatedAt: channelMetadata.createdAt,
      channelUpdatedAt: channelMetadata.updatedAt,
      blockAuthor: blockMetadata.author,
      blockAddedAt: blockMetadata.addedAt,
    }
  }, [shape?.props.source, shape?.props.focusedCardId])

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
    onClick: (payload) => {
      if (!shape || shape.type !== 'tactile-portal') return
      if (payload.kind !== 'channel') return
      editor.updateShape({
        id: shape.id,
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
    },
  })

  return (
    <div
      style={{
        position: 'fixed',
        left: `${positioning.left}px`,
        top: `${positioning.top}px`,
        width: `${PANEL_WIDTH}px`,
        minHeight: `${MIN_PANEL_HEIGHT}px`,
        pointerEvents: 'none',
        zIndex: 1001,
      }}
    >
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
        createdAt={!isBlockFocused ? metadata.channelCreatedAt : undefined}
        updatedAt={!isBlockFocused ? metadata.channelUpdatedAt : undefined}
        addedAt={isBlockFocused ? metadata.blockAddedAt : undefined}
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
    </div>
  )
}))
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
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: fontSize * 0.6,
      paddingBottom: fontSize * 0.8,
      paddingLeft: 11,
    }}>
      {author && source !== 'channel' && (
        <div style={{ fontSize, color: TEXT_SECONDARY, lineHeight: 1.4 }}>
          by <strong style={{ color: TEXT_PRIMARY }}>{author.name}</strong>
        </div>
      )}
      {createdAt && (
        <div style={{ fontSize, color: TEXT_TERTIARY, lineHeight: 1.4 }}>
          created {formatRelativeTime(createdAt)}
        </div>
      )}
      {updatedAt && (
        <div style={{ fontSize, color: TEXT_TERTIARY, lineHeight: 1.4 }}>
          updated {formatRelativeTime(updatedAt)}
        </div>
      )}
      {addedAt && (
        <div style={{ fontSize, color: TEXT_TERTIARY, lineHeight: 1.4 }}>
          added {formatRelativeTime(addedAt)}
        </div>
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
  // Hook called at component top level - this is the correct pattern
  const pressFeedback = usePressFeedback({
    scale: 0.98,
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
        paddingLeft: 17,
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
        <div style={{
          flex: 1,
          height: fontSize * 0.1,
          backgroundColor: DESIGN_TOKENS.colors.border,
          marginTop: fontSize * 0.05
        }} />
      </div>
      {connectionCount === 0 ? (
        <div style={{ fontSize: fontSize * 0.9, color: TEXT_TERTIARY, fontStyle: 'italic' }}>
          No connections
        </div>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          flex: 1
        }}>
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
        </div>
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
        {conn.blockCount !== undefined && (
          <div style={{
            color: TEXT_TERTIARY,
            fontSize: fontSize * 0.8,
            letterSpacing: '-0.01em',
            fontWeight: 700,
            lineHeight: 1.2,
            flexShrink: 0
          }}>
            {conn.blockCount >= 1000
              ? `${(conn.blockCount / 1000).toFixed(1)}k`.replace('.0k', 'k')
              : conn.blockCount
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
