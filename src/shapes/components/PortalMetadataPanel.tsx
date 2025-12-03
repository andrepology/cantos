import { useMemo, memo } from 'react'
import { track, useEditor, useValue, type TLShapeId } from 'tldraw'
import { formatRelativeTime } from '../../arena/timeUtils'
import { getChannelMetadata, getBlockMetadata, getDefaultChannelMetadata, getDefaultBlockMetadata } from '../../arena/mockMetadata'
import { OverflowCarouselText } from '../../arena/OverflowCarouselText'
import type { TactilePortalShape } from '../TactilePortalShape'
import type { ConnectionItem } from '../../arena/ConnectionsPanel'

interface PortalMetadataPanelProps {
  shapeId: TLShapeId
}

const GAP = 16 // Gap between portal and panel (page space)
const PANEL_WIDTH = 200 // Panel width (page space)
const MIN_PANEL_HEIGHT = 320 // Minimum panel height (page space)

export const PortalMetadataPanel = memo(track(function PortalMetadataPanel({ shapeId }: PortalMetadataPanelProps) {
  const editor = useEditor()

  // Combined camera state subscription (performance guide pattern)
  const cameraState = useValue('camera', () => ({
    zoom: editor.getZoomLevel()
  }), [editor])

  const zoom = cameraState.zoom

  // Shape-dependent calculations
  const shape = editor.getShape(shapeId) as TactilePortalShape | undefined
  if (!shape || shape.type !== 'tactile-portal') return null

  // Get shape bounds
  const pageBounds = editor.getShapePageBounds(shape)
  if (!pageBounds) return null

  // Calculate panel position in page space
  const panelPageX = pageBounds.maxX + GAP
  const panelPageY = pageBounds.minY
  const panelPageW = PANEL_WIDTH
  const panelPageH = Math.max(pageBounds.height, MIN_PANEL_HEIGHT)

  // Transform page → screen coordinates (reactive to camera changes)
  const topLeft = editor.pageToScreen({ x: panelPageX, y: panelPageY })
  const bottomRight = editor.pageToScreen({ x: panelPageX + panelPageW, y: panelPageY + panelPageH })

  const positioning = {
    left: topLeft.x,
    top: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  }
  
  // Determine source (channel vs block)
  const isBlockFocused = shape.props.focusedCardId != null

  // Scale font size with zoom - smaller text when zoomed out
  const baseFontSize = 11
  const scaledFontSize = Math.max(4, baseFontSize * zoom) // Minimum 4px to keep it readable

  // Get metadata - memoized to avoid recreating objects on every render
  const metadata = useMemo(() => {
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
  }, [shape.props.channel, shape.props.focusedCardId])
  
  return (
    <div
      style={{
        position: 'fixed',
        left: `${positioning.left}px`,
        top: `${positioning.top}px`,
        width: `${positioning.width}px`,
        height: `${positioning.height}px`,
        pointerEvents: 'none',

        // Styling

        // Layout
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        overflowY: 'auto',
        zIndex: 1001,
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
      />
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

// Connections List Sub-component
interface ConnectionsListProps {
  connections: ConnectionItem[]
  fontSize: number
  zoom: number
}

const ConnectionsList = memo(function ConnectionsList({ connections, fontSize, zoom }: ConnectionsListProps) {
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
          <div
            key={conn.id}
            style={{
              padding: `${6 * zoom}px ${8 * zoom}px`,
              borderRadius: 4 * zoom,
              border: `${zoom}px solid rgba(0,0,0,0.08)`,
              background: 'rgba(0,0,0,0.02)',
              cursor: 'pointer',
              transition: 'background 120ms ease',
              pointerEvents: 'none',
              minHeight: `${(fontSize * 1.2 * 1.2) + (12 * zoom)}px`,
              display: 'flex',
              alignItems: 'center',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(0,0,0,0.04)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(0,0,0,0.02)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0, gap: 8 }}>
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
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})

