import { useMemo, memo } from 'react'
import { track, useEditor, type TLShapeId } from 'tldraw'
import { formatRelativeTime } from '../../arena/timeUtils'
import { getChannelMetadata, getBlockMetadata, getDefaultChannelMetadata, getDefaultBlockMetadata } from '../../arena/mockMetadata'
import type { TactilePortalShape } from '../TactilePortalShape'
import type { ConnectionItem } from '../../arena/ConnectionsPanel'

interface PortalMetadataPanelProps {
  shapeId: TLShapeId
}

const GAP = 16 // Gap between portal and panel (page space)
const PANEL_WIDTH = 240 // Panel width (page space)

export const PortalMetadataPanel = track(function PortalMetadataPanel({ shapeId }: PortalMetadataPanelProps) {
  const editor = useEditor()
  
  // track() automatically subscribes to shape changes
  const shape = editor.getShape(shapeId) as TactilePortalShape | undefined
  if (!shape || shape.type !== 'tactile-portal') return null
  
  // Get shape bounds - track() subscribes to geometry changes automatically
  const pageBounds = editor.getShapePageBounds(shape)
  if (!pageBounds) return null
  
  // Calculate panel position in page space
  const panelPageX = pageBounds.maxX + GAP
  const panelPageY = pageBounds.minY
  const panelPageW = PANEL_WIDTH
  const panelPageH = pageBounds.height
  
  // Transform page → screen coordinates
  // pageToScreen is reactive to viewport changes internally - no need to track zoom/camera
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
        
        // Styling
        background: 'rgba(255,255,255,0.96)',
        backdropFilter: 'blur(22px)',
        borderRadius: 8,
        border: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
        
        // Layout
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        overflow: 'hidden',
        
        pointerEvents: 'auto',
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
        fontSize={11}
      />
      
      {/* Connections */}
      <ConnectionsList
        connections={metadata.connections}
        fontSize={11}
      />
    </div>
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
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: fontSize * 0.6,
      paddingBottom: fontSize * 0.8,
      borderBottom: `${fontSize * 0.1}px solid rgba(0,0,0,0.08)`
    }}>
      {author && (
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
}

const ConnectionsList = memo(function ConnectionsList({ connections, fontSize }: ConnectionsListProps) {
  if (!connections || connections.length === 0) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: fontSize * 0.4,
        flex: 1,
        minHeight: 0
      }}>
        <div style={{ fontSize, fontWeight: 700, color: '#666' }}>
          Connections (0)
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
      <div style={{ fontSize, fontWeight: 700, color: '#666' }}>
        Connections ({connections.length})
      </div>
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: 4,
        overflowY: 'auto',
        flex: 1
      }}>
        {connections.map((conn) => (
          <div
            key={conn.id}
            style={{
              padding: '6px 8px',
              borderRadius: 4,
              border: '1px solid rgba(0,0,0,0.08)',
              background: 'rgba(0,0,0,0.02)',
              cursor: 'pointer',
              transition: 'background 120ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(0,0,0,0.04)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(0,0,0,0.02)'
            }}
          >
            <div style={{ fontSize: fontSize * 0.95, fontWeight: 700, color: '#333' }}>
              {conn.title}
            </div>
            {conn.author && (
              <div style={{ fontSize: fontSize * 0.8, color: '#999', marginTop: 2 }}>
                by {conn.author} {conn.blockCount !== undefined && `• ${conn.blockCount}`}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
})

