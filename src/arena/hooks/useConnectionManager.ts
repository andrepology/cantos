import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { connectToChannel, disconnectFromChannel, invalidateArenaChannel, invalidateConnectedChannels } from '../api'
import { fuzzySearchChannels } from '../userChannelsStore'
import type { UserChannelListItem } from '../types'
import type { ChannelConnectionState } from '../../shapes/components/ConnectPopover'

export type ConnectionSource = 
  | { type: 'block'; id: number }
  | { type: 'channel'; id: number; slug: string }

export type ConnectionItem = {
  id: number
  [key: string]: any
}

export interface UseConnectionManagerOptions {
  source: ConnectionSource | null
  existingConnections: ConnectionItem[]
  userChannels: UserChannelListItem[]
  isActive: boolean // Whether connection UI should be active (typically when shape is selected)
}

export interface UseConnectionManagerResult {
  // State
  connectionStates: Map<number, ChannelConnectionState>
  existingConnectionIds: Set<number>
  selectedChannelIds: Set<number>
  showConnectPopover: boolean
  searchQuery: string
  filteredChannels: UserChannelListItem[]
  
  // Handlers
  handleConnectToggle: () => void
  handleChannelToggle: (channelId: number) => void
  setSearchQuery: (query: string) => void
  
  // Props for ConnectPopover (convenience)
  popoverProps: {
    searchQuery: string
    setSearchQuery: (query: string) => void
    filteredChannels: UserChannelListItem[]
    selectedChannelIds: Set<number>
    onChannelToggle: (channelId: number) => void
    connectionStates: Map<number, ChannelConnectionState>
    existingConnectionIds: Set<number>
  }
}

/**
 * Custom hook to manage connections between blocks/channels and user channels.
 * Handles optimistic updates, error recovery, and session-based disconnect.
 * 
 * @param options Configuration for the connection manager
 * @returns Connection state and handlers
 */
export function useConnectionManager({
  source,
  existingConnections,
  userChannels,
  isActive,
}: UseConnectionManagerOptions): UseConnectionManagerResult {
  
  // ==========================================
  // STATE
  // ==========================================
  const [connectionStates, setConnectionStates] = useState<Map<number, ChannelConnectionState>>(new Map())
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<number>>(new Set())
  const [showConnectPopover, setShowConnectPopover] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  
  // Track connection IDs for all connections (both pre-existing and session)
  // Maps channelId -> connectionId
  const connectionIdsRef = useRef<Map<number, number>>(new Map())
  
  // Debounce state for rapid toggles
  const pendingTogglesRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  
  // ==========================================
  // DERIVED STATE
  // ==========================================
  
  // Build set of existing connection IDs from connections data
  const existingConnectionIds = useMemo(() => {
    const ids = new Set<number>()
    if (existingConnections) {
      for (const conn of existingConnections) {
        if (conn.id) {
          ids.add(conn.id)
        }
      }
    }
    return ids
  }, [existingConnections])
  
  // Filtered channels for search
  const filteredChannels = useMemo(() => 
    fuzzySearchChannels(userChannels, searchQuery),
    [userChannels, searchQuery]
  )
  
  // ==========================================
  // EFFECTS
  // ==========================================
  
  // Sync selectedChannelIds and connectionIds when existing connections change
  useEffect(() => {
    // Update connection IDs map from existing connections
    const newConnectionIds = new Map<number, number>()
    for (const conn of existingConnections) {
      if (conn.id && (conn as any).connectionId) {
        newConnectionIds.set(conn.id, (conn as any).connectionId)
      }
    }
    connectionIdsRef.current = newConnectionIds
    
    // Update selected channel IDs
    setSelectedChannelIds(prev => {
      // Only update if the sets differ in content
      if (prev.size !== existingConnectionIds.size) {
        return new Set(existingConnectionIds)
      }
      // Check if all IDs match
      for (const id of existingConnectionIds) {
        if (!prev.has(id)) {
          return new Set(existingConnectionIds)
        }
      }
      // No changes, return previous state to avoid re-render
      return prev
    })
  }, [existingConnectionIds, existingConnections])
  
  // Close popover when inactive (deselected)
  useEffect(() => {
    if (!isActive) {
      setShowConnectPopover(false)
      setSearchQuery('')
    }
  }, [isActive])
  
  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      pendingTogglesRef.current.forEach(timer => clearTimeout(timer))
      pendingTogglesRef.current.clear()
    }
  }, [])
  
  // ==========================================
  // HANDLERS
  // ==========================================
  
  const handleConnectToggle = useCallback(() => {
    setShowConnectPopover(prev => !prev)
  }, [])
  
  const handleChannelToggleImmediate = useCallback(async (channelId: number) => {
    if (!source || !source.id) return
    
    // Find the target channel to get its slug
    const targetChannel = userChannels.find(ch => ch.id === channelId)
    if (!targetChannel || !targetChannel.slug) return
    
    console.log('[handleChannelToggle]', {
      source,
      targetChannel: { id: targetChannel.id, slug: targetChannel.slug, title: targetChannel.title }
    })
    
    // Read current state (optimistic update already happened)
    const wasSelected = !selectedChannelIds.has(channelId) // Inverted because optimistic update already toggled it
    const connectionId = connectionIdsRef.current.get(channelId)
    
    // For disconnecting: we need a connection ID
    if (!wasSelected && !connectionId) {
      // Can't disconnect without connection_id - revert optimistic update
      setSelectedChannelIds(prev => {
        const next = new Set(prev)
        next.add(channelId)
        return next
      })
      console.warn('[handleChannelToggle] Cannot disconnect: no connection_id for channel', channelId)
      return
    }
    
    // Set pending state (visual feedback during API call)
    setConnectionStates(prev => new Map(prev).set(channelId, { status: 'pending' }))
    
    try {
      if (!wasSelected && connectionId) {
        // Disconnect: remove existing connection
        // Connection is always stored in the target channel (user's channel)
        await disconnectFromChannel(targetChannel.slug, connectionId)
        connectionIdsRef.current.delete(channelId)
      } else if (wasSelected) {
        // Connect: add new connection
        // Always add TO the target channel (user's channel they selected)
        // This works because users can only add to channels they own (their own channels)
        if (source.type === 'block') {
          const result = await connectToChannel(targetChannel.slug, 'Block', source.id)
          if (result.connectionId > 0) {
            connectionIdsRef.current.set(channelId, result.connectionId)
          }
        } else if (source.type === 'channel') {
          // For channels: add source channel TO target channel (user's collection)
          const result = await connectToChannel(targetChannel.slug, 'Channel', source.id)
          if (result.connectionId > 0) {
            connectionIdsRef.current.set(channelId, result.connectionId)
          }
        }
      }
      
      // Success: clear pending state
      setConnectionStates(prev => {
        const next = new Map(prev)
        next.delete(channelId)
        return next
      })
      
      // Invalidate cache to refresh connections
      invalidateArenaChannel(targetChannel.slug)
      invalidateConnectedChannels() // Global invalidation for connected channels
      
      // For channel sources, also invalidate the source channel
      if (source.type === 'channel' && source.slug) {
        invalidateArenaChannel(source.slug)
      }
      
    } catch (error) {
      console.error('Connection toggle failed:', error)
      
      // Revert optimistic update on error (toggle back)
      setSelectedChannelIds(prev => {
        const next = new Set(prev)
        if (wasSelected) {
          next.delete(channelId) // Was trying to connect, revert to unselected
        } else {
          next.add(channelId) // Was trying to disconnect, revert to selected
        }
        return next
      })
      
      // Set error state
      setConnectionStates(prev => new Map(prev).set(channelId, { 
        status: 'error', 
        message: error instanceof Error ? error.message : 'Failed to connect' 
      }))
      
      // Clear error after 3 seconds
      setTimeout(() => {
        setConnectionStates(prev => {
          const next = new Map(prev)
          next.delete(channelId)
          return next
        })
      }, 3000)
    }
  }, [source, userChannels, selectedChannelIds, existingConnectionIds])
  
  // Debounced version of toggle handler (300ms matches API rate limit)
  // Provides immediate visual feedback, but debounces the actual API call
  const handleChannelToggle = useCallback((channelId: number) => {
    // Clear any pending toggle for this channel
    const existingTimer = pendingTogglesRef.current.get(channelId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }
    
    // Immediate optimistic UI update
    setSelectedChannelIds(prev => {
      const next = new Set(prev)
      if (next.has(channelId)) {
        next.delete(channelId)
      } else {
        next.add(channelId)
      }
      return next
    })
    
    // Debounce the actual API call (300ms)
    const timer = setTimeout(() => {
      handleChannelToggleImmediate(channelId)
      pendingTogglesRef.current.delete(channelId)
    }, 300)
    
    pendingTogglesRef.current.set(channelId, timer)
  }, [handleChannelToggleImmediate])
  
  // ==========================================
  // RETURN INTERFACE
  // ==========================================
  
  return {
    // State
    connectionStates,
    existingConnectionIds,
    selectedChannelIds,
    showConnectPopover,
    searchQuery,
    filteredChannels,
    
    // Handlers
    handleConnectToggle,
    handleChannelToggle,
    setSearchQuery,
    
    // Convenience props for ConnectPopover
    popoverProps: {
      searchQuery,
      setSearchQuery,
      filteredChannels,
      selectedChannelIds,
      onChannelToggle: handleChannelToggle,
      connectionStates,
      existingConnectionIds,
    },
  }
}

