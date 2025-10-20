import { useEffect, useRef, useCallback, useMemo } from 'react'
import { stopEventPropagation } from 'tldraw'
import { CARD_BORDER_RADIUS, SHAPE_BACKGROUND } from '../../arena/constants'
import type { UserChannelListItem } from '../../arena/types'
import { ChannelIcon } from '../../arena/icons'

export type ChannelConnectionState = 
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'error'; message: string }

export interface ConnectPopoverProps {
  searchQuery: string
  setSearchQuery: (query: string) => void
  filteredChannels: UserChannelListItem[]
  channelsLoading: boolean
  selectedChannelIds: Set<number>
  onChannelToggle: (channelId: number) => void
  position: {
    x: number  // CSS left position (already zoom-adjusted if needed)
    y: number  // CSS top position (already zoom-adjusted if needed)
  }
  z: number  // Zoom level (for reference, though positioning should already be adjusted)
  connectionStates?: Map<number, ChannelConnectionState>  // Track pending/error states per channel
  existingConnectionIds?: Set<number>  // Channels that already have connections
}

// Memoized channel item to prevent unnecessary re-renders
const ChannelItem = ({ 
  channel, 
  isSelected, 
  isExisting,
  connectionState,
  onToggle, 
  onMouseDown 
}: { 
  channel: UserChannelListItem
  isSelected: boolean
  isExisting: boolean
  connectionState?: ChannelConnectionState
  onToggle: (id: number) => void
  onMouseDown: (e: React.MouseEvent) => void 
}) => {
  const ITEM_HEIGHT = 44
  
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onToggle(channel.id)
  }, [channel.id, onToggle])

  const isPending = connectionState?.status === 'pending'
  const isError = connectionState?.status === 'error'
  const opacity = isPending ? 0.5 : 1

  return (
    <button
      key={channel.id}
      type="button"
      data-interactive="button"
      data-card-type="channel"
      data-card-title={channel.title}
      data-channel-slug={channel.slug}
      data-channel-author={String(channel.author?.full_name || channel.author?.username || '')}
      data-channel-updated-at={String(channel.updatedAt ?? '')}
      data-channel-block-count={String(channel.length ?? 0)}
      onClick={handleClick}
      onMouseDown={onMouseDown}
      style={{
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        height: ITEM_HEIGHT,
        padding: '0 12px',
        border: 'none',
        borderBottom: '1px solid #f0f0f0',
        borderRadius: 0,
        background: isExisting ? 'rgba(0,0,0,0.02)' : 'transparent',
        cursor: 'pointer',
        color: '#333',
        flexShrink: 0,
        opacity,
        transition: 'opacity 0.15s ease',
      }}
      draggable={false}
    >
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ChannelIcon size={12} color={isSelected ? '#666' : '#ccc'} />
        {isSelected && (
          <div style={{
            position: 'absolute',
            top: -2,
            right: -2,
            width: 8,
            height: 8,
            background: isError ? '#dc2626' : '#666',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {isError ? (
              <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            ) : (
              <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20,6 9,17 4,12"></polyline>
              </svg>
            )}
          </div>
        )}
      </div>
      <div style={{ overflow: 'hidden', display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#333', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
          {(channel.title || channel.slug) ?? ''}
        </span>
        <span style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
          {channel.author ? ` / ${((channel.author.full_name || channel.author.username) ?? '')}` : ''}
        </span>
      </div>
      {isExisting && !isError && (
        <span style={{ fontSize: 10, color: '#999', whiteSpace: 'nowrap', flexShrink: 0 }}>
          connected
        </span>
      )}
      {isError && (
        <span style={{ fontSize: 10, color: '#dc2626', whiteSpace: 'nowrap', flexShrink: 0 }} title={connectionState.message}>
          error
        </span>
      )}
    </button>
  )
}

export function ConnectPopover({
  searchQuery,
  setSearchQuery,
  filteredChannels,
  channelsLoading,
  selectedChannelIds,
  onChannelToggle,
  position,
  z,
  connectionStates = new Map(),
  existingConnectionIds = new Set(),
}: ConnectPopoverProps) {
  // Fixed size regardless of zoom (like ConnectionsPanel)
  const popoverWidth = 280
  const popoverHeight = 320

  // Auto-focus the input when popover opens
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  // Item height constant (matches button height in ArenaSearchResults.tsx)
  const ITEM_HEIGHT = 44

  // Memoize event handlers
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
  }, [setSearchQuery])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  // Separate existing connections from other channels
  const { existingChannels, otherChannels } = useMemo(() => {
    const existing: UserChannelListItem[] = []
    const other: UserChannelListItem[] = []
    
    for (const channel of filteredChannels) {
      if (existingConnectionIds.has(channel.id)) {
        existing.push(channel)
      } else {
        other.push(channel)
      }
    }
    
    return { existingChannels: existing, otherChannels: other }
  }, [filteredChannels, existingConnectionIds])

  // Memoize container styles
  const containerStyle = useMemo(() => ({
    position: 'absolute' as const,
    left: position.x,
    top: position.y,
    width: popoverWidth,
    height: popoverHeight,
    overflow: 'hidden' as const,
    background: SHAPE_BACKGROUND,
    borderRadius: CARD_BORDER_RADIUS,
    boxShadow: `0 12px 32px rgba(0,0,0,.12), 0 3px 8px rgba(0,0,0,.06), inset 0 0 0 1px rgba(0,0,0,.06)`,
    zIndex: 1001,
    pointerEvents: 'auto' as const,
  }), [position.x, position.y])

  const inputStyle = useMemo(() => ({
    position: 'absolute' as const,
    top: 8,
    left: 8,
    width: 'calc(100% - 16px)',
    fontSize: 32,
    fontWeight: 700 as const,
    color: 'rgba(0,0,0,0.3)',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    pointerEvents: 'auto' as const,
    zIndex: 2,
    fontFamily: 'inherit',
    animation: searchQuery ? 'none' : 'fadeInOut 3s ease-in-out infinite'
  }), [searchQuery])

  const placeholderStyle = useMemo(() => ({
    position: 'absolute' as const,
    top: 8,
    left: 8,
    fontSize: 32,
    fontWeight: 300 as const,
    color: 'rgba(0,0,0,0.08)',
    pointerEvents: 'none' as const,
    zIndex: 1,
    userSelect: 'none' as const,
    animation: 'fadeInOut 2s ease-in-out infinite'
  }), [])

  const listContainerStyle = useMemo(() => ({
    position: 'absolute' as const,
    top: 60,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'auto' as const,
    border: 'none',
    borderRadius: CARD_BORDER_RADIUS,
    background: SHAPE_BACKGROUND,
    padding: 0,
    touchAction: 'none' as const,
  }), [])

  const allChannels = [...existingChannels, ...otherChannels]
  const channelsListStyle = useMemo(() => ({
    display: 'flex',
    flexDirection: 'column' as const,
    height: allChannels.length * ITEM_HEIGHT,
    position: 'relative' as const,
  }), [allChannels.length])

  // Memoize rendered channels to prevent unnecessary re-renders
  const renderedChannels = useMemo(() => 
    allChannels.map((channel) => (
      <ChannelItem
        key={channel.id}
        channel={channel}
        isSelected={selectedChannelIds.has(channel.id)}
        isExisting={existingConnectionIds.has(channel.id)}
        connectionState={connectionStates.get(channel.id)}
        onToggle={onChannelToggle}
        onMouseDown={handleMouseDown}
      />
    )),
    [allChannels, selectedChannelIds, existingConnectionIds, connectionStates, onChannelToggle, handleMouseDown]
  )

  return (
    <div
      data-interactive="connect-popover"
      style={containerStyle}
      onPointerDown={stopEventPropagation}
      onPointerMove={(e) => {
        if (e.buttons > 0) {
          stopEventPropagation(e)
        }
      }}
      onPointerUp={stopEventPropagation}
    >
      {/* Search input - large, faint, behind rows */}
      <input
        ref={inputRef}
        type="text"
        placeholder=""
        value={searchQuery}
        onChange={handleInputChange}
        onKeyDown={stopEventPropagation}
        style={inputStyle}
        onPointerDown={stopEventPropagation}
        onClick={stopEventPropagation}
      />

      {/* Placeholder text when empty */}
      {!searchQuery && (
        <div style={placeholderStyle}>
          type to search
        </div>
      )}

      <style>{`
        @keyframes fadeInOut {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
      `}</style>

      {/* Channel list - identical styling to ArenaSearchResults.tsx */}
      <div
        style={listContainerStyle}
        onPointerDown={(e) => stopEventPropagation(e as any)}
        onPointerUp={(e) => stopEventPropagation(e as any)}
        onWheelCapture={(e) => {
          if ((e as any).ctrlKey) {
            ;(e as any).preventDefault()
            return
          }
          ;(e as any).stopPropagation()
        }}
      >
        {channelsLoading ? (
          <div style={{ color: '#999', fontSize: 12, padding: 8 }}>loading...</div>
        ) : filteredChannels.length === 0 && searchQuery.trim() ? (
          <div style={{ color: '#999', fontSize: 12, padding: 8 }}>no results</div>
        ) : (
          <div style={channelsListStyle}>
            {renderedChannels}
          </div>
        )}
      </div>
    </div>
  )
}

