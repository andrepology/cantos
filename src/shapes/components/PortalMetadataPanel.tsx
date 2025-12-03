import { useMemo, memo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { track, useEditor, type TLShapeId } from 'tldraw'
import { formatRelativeTime } from '../../arena/timeUtils'
import { getChannelMetadata, getBlockMetadata, getDefaultChannelMetadata, getDefaultBlockMetadata } from '../../arena/mockMetadata'
import { OverflowCarouselText } from '../../arena/OverflowCarouselText'
import { usePressFeedback } from '../../hooks/usePressFeedback'
import type { TactilePortalShape } from '../TactilePortalShape'
import type { ConnectionItem } from '../../arena/ConnectionsPanel'
import { usePortalSpawnDrag, type PortalSpawnGhostState } from '../../arena/hooks/usePortalSpawnDrag'

interface PortalMetadataPanelProps {
  shapeId: TLShapeId
}

const GAP = 16 // Gap between portal and panel (page space)
const PANEL_WIDTH = 200 // Panel width (page space)
const MIN_PANEL_HEIGHT = 320 // Minimum panel height (page space)

export const PortalMetadataPanel = memo(track(function PortalMetadataPanel({ shapeId }: PortalMetadataPanelProps) {


  const editor = useEditor()
  const zoom = editor.getZoomLevel()

  // Shape-dependent calculations
  const shape = editor.getShape(shapeId) as TactilePortalShape | undefined
  const pageBounds = shape && shape.type === 'tactile-portal' ? editor.getShapePageBounds(shape) : null

  // Calculate panel position in page space (use defaults when invalid)
  const panelPageX = pageBounds ? pageBounds.maxX + GAP : 0
  const panelPageY = pageBounds ? pageBounds.minY : 0
  const panelPageW = PANEL_WIDTH
  const panelPageH = pageBounds ? Math.max(pageBounds.height, MIN_PANEL_HEIGHT) : MIN_PANEL_HEIGHT

  // Transform page → screen coordinates (reactive to camera changes)
  const topLeft = editor.pageToScreen({ x: panelPageX, y: panelPageY })
  const bottomRight = editor.pageToScreen({ x: panelPageX + panelPageW, y: panelPageY + panelPageH })

  const positioning = {
    left: topLeft.x,
    top: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  }

  // Determine source (channel vs block) - safe defaults when shape is invalid
  const isBlockFocused = shape?.props.focusedCardId != null

  // Scale font size with zoom - smaller text when zoomed out
  const baseFontSize = 11
  const scaledFontSize = Math.max(4, baseFontSize * zoom) // Minimum 4px to keep it readable

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

    const channelMetadata = shape.props.channel
      ? getChannelMetadata(shape.props.channel) || getDefaultChannelMetadata()
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
  }, [shape?.props.channel, shape?.props.focusedCardId])

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
    return { kind: 'channel' as const, slug: conn.slug }
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
  })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{
        duration: 0.300,
        ease: [0.25, 0.46, 0.45, 0.94]
      }}
      style={{
        position: 'fixed',
        left: `${positioning.left}px`,
        top: `${positioning.top}px`,
        width: `${positioning.width}px`,
        height: `${positioning.height}px`,
        pointerEvents: 'none',

        // Styling

        // Layout
        paddingLeft: 4,
        paddingTop: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        overflowY: 'auto',
        zIndex: 1001,
        overflow: 'visible',
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
        zoom={zoom}
        onConnectionPointerDown={handleConnectionPointerDown}
        onConnectionPointerMove={handleConnectionPointerMove}
        onConnectionPointerUp={handleConnectionPointerUp}
      />
      <ConnectionSpawnGhost
        ghost={ghostState}
        fontSize={scaledFontSize}
        zoom={zoom}
      />
    </motion.div>
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
      paddingBottom: fontSize * 0.8
    }}>
      {author && source !== 'channel' && (
        <div style={{ fontSize, color: '#666', lineHeight: 1.4 }}>
          by <strong style={{ color: '#333' }}>{author.name}</strong>
        </div>
      )}
      {createdAt && (
        <div style={{ fontSize, color: '#999', lineHeight: 1.4 }}>
          created {formatRelativeTime(createdAt)}
        </div>
      )}
      {updatedAt && (
        <div style={{ fontSize, color: '#999', lineHeight: 1.4 }}>
          updated {formatRelativeTime(updatedAt)}
        </div>
      )}
      {addedAt && (
        <div style={{ fontSize, color: '#999', lineHeight: 1.4 }}>
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
  zoom: number
  onPointerDown?: (conn: ConnectionItem, e: React.PointerEvent) => void
  onPointerMove?: (conn: ConnectionItem, e: React.PointerEvent) => void
  onPointerUp?: (conn: ConnectionItem, e: React.PointerEvent) => void
}

const ConnectionItemComponent = memo(function ConnectionItemComponent({
  conn,
  fontSize,
  zoom,
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
        padding: `${6 * zoom}px ${8 * zoom}px`,
        borderRadius: 4 * zoom,
        border: `${zoom}px solid rgba(0,0,0,0.08)`,
        background: 'rgba(0,0,0,0.02)',
        transition: 'background 120ms ease',
        pointerEvents: 'none', // Let wheel events pass through
        minHeight: `${(fontSize * 1.2 * 1.2) + (12 * zoom)}px`,
        display: 'flex',
        alignItems: 'center',
        scale: pressFeedback.pressScale,
        willChange: 'transform',
      }}
    >
      <motion.div
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          minWidth: 0,
          gap: 8,
          pointerEvents: 'auto', // Make content clickable
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
        <ConnectionRowContent conn={conn} fontSize={fontSize} zoom={zoom} />
      </motion.div>
    </motion.div>
  )
})

// Connections List Sub-component
interface ConnectionsListProps {
  connections: ConnectionItem[]
  fontSize: number
  zoom: number
  onConnectionPointerDown?: (conn: ConnectionItem, e: React.PointerEvent) => void
  onConnectionPointerMove?: (conn: ConnectionItem, e: React.PointerEvent) => void
  onConnectionPointerUp?: (conn: ConnectionItem, e: React.PointerEvent) => void
}

const ConnectionsList = memo(function ConnectionsList({
  connections,
  fontSize,
  zoom,
  onConnectionPointerDown,
  onConnectionPointerMove,
  onConnectionPointerUp,
}: ConnectionsListProps) {
  if (!connections || connections.length === 0) {
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
          marginBottom: fontSize * 0.6
        }}>
          <div style={{
            fontSize: fontSize * 0.8,
            fontWeight: 700,
            color: '#666',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            flexShrink: 0
          }}>
            Connections
          </div>
          <div style={{
            color: 'rgba(0,0,0,.4)',
            fontSize: Math.max(4, 8 * zoom),
            letterSpacing: '-0.01em',
            fontWeight: 700,
            lineHeight: 1,
            flexShrink: 0
          }}>
            0
          </div>
          <div style={{
            flex: 1,
            height: fontSize * 0.1,
            backgroundColor: 'rgba(0,0,0,0.08)',
            marginTop: fontSize * 0.05
          }} />
        </div>
        <div style={{ fontSize: fontSize * 0.9, color: '#bbb', fontStyle: 'italic' }}>
          No connections
        </div>
      </div>
    )
  }

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
        marginBottom: fontSize * 0.6
      }}>
        <div style={{
          fontSize: fontSize * 0.8,
          fontWeight: 700,
          color: '#666',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          flexShrink: 0
        }}>
          Connections
        </div>
        <div style={{
          color: 'rgba(0,0,0,.4)',
          fontSize: Math.max(4, 8 * zoom),
          letterSpacing: '-0.01em',
          fontWeight: 700,
          lineHeight: 1,
          flexShrink: 0
        }}>
          {connections.length}
        </div>
        <div style={{
          flex: 1,
          height: fontSize * 0.1,
          backgroundColor: 'rgba(0,0,0,0.08)',
          marginTop: fontSize * 0.05
        }} />
      </div>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4 * zoom,
        flex: 1
      }}>
        {connections.map((conn) => (
          <ConnectionItemComponent
            key={conn.id}
            conn={conn}
            fontSize={fontSize}
            zoom={zoom}
            onPointerDown={onConnectionPointerDown}
            onPointerMove={onConnectionPointerMove}
            onPointerUp={onConnectionPointerUp}
          />
        ))}
      </div>
    </div>
  )
})

interface ConnectionRowContentProps {
  conn: ConnectionItem
  fontSize: number
  zoom: number
}

function ConnectionRowContent({ conn, fontSize, zoom }: ConnectionRowContentProps) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
        <OverflowCarouselText
          text={conn.title}
          maxWidthPx={Math.floor(((PANEL_WIDTH * zoom) - 24) * 0.8)}
          gapPx={32}
          speedPxPerSec={50}
          fadePx={16}
          textStyle={{
            fontSize: fontSize * 0.9,
            fontWeight: 700,
            color: '#333',
            lineHeight: 1.2,
          }}
        />
        {conn.blockCount !== undefined && (
          <div style={{
            color: 'rgba(0,0,0,.4)',
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
            style={{ color: 'rgba(0,0,0,.5)', fontSize: fontSize * 0.75, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}
          >
            {conn.author}
          </div>
        )}
      </div>
    </>
  )
}

interface ConnectionSpawnGhostProps {
  ghost: PortalSpawnGhostState<ConnectionItem> | null
  fontSize: number
  zoom: number
}

const ConnectionSpawnGhost = memo(function ConnectionSpawnGhost({ ghost, fontSize, zoom }: ConnectionSpawnGhostProps) {
  if (!ghost || typeof document === 'undefined') return null

  const anchorRect = ghost.anchorRect ?? {
    x: ghost.pointer.x - ghost.pointerOffset.x,
    y: ghost.pointer.y - ghost.pointerOffset.y,
    width: 0,
    height: 0,
  }

  const width = anchorRect.width
  const height = anchorRect.height
  const left = ghost.pointer.x - ghost.pointerOffset.x
  const top = ghost.pointer.y - ghost.pointerOffset.y

  const element = (
    <motion.div
      initial={{ opacity: 0.8, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
      style={{
        position: 'fixed',
        left,
        top,
        width,
        height,
        pointerEvents: 'none',
        zIndex: 2000,
      }}
    >
      <div
        style={{
          padding: `${6 * zoom}px ${8 * zoom}px`,
          borderRadius: 4 * zoom,
          border: `${zoom}px solid rgba(0,0,0,0.08)`,
          background: 'rgba(255,255,255,0.94)',
          minHeight: `${(fontSize * 1.2 * 1.2) + (12 * zoom)}px`,
          display: 'flex',
          alignItems: 'center',
          boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
          width: '100%',
          height: '100%',
        }}
      >
        <ConnectionRowContent conn={ghost.item} fontSize={fontSize} zoom={zoom} />
      </div>
    </motion.div>
  )

  return createPortal(element, document.body)
})
