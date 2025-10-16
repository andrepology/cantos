import { useEffect, useReducer } from 'react'
import uFuzzy from '@leeoniya/ufuzzy'
import { fetchArenaUserChannels } from './api'
import type { UserChannelListItem } from './types'

/**
 * Shared user channels store with subscription-based reactivity.
 * 
 * Purpose: Share user channels data between toolbar (fetcher) and ThreeDBox shapes (consumers)
 * for instant local fuzzy searching without redundant API calls.
 * 
 * Design: Module-level state with subscriber notifications for React integration.
 * No Context, no Jazz - just a simple in-memory cache.
 */

// Types
type CachedUserChannels = {
  loading: boolean
  error: string | null
  channels: UserChannelListItem[]
  timestamp: number
}

type StoreState = Map<string, CachedUserChannels>

// Module-level state
const store: StoreState = new Map()

// Session user state (assumes single user per session)
let sessionUser: { userId: number; username: string | undefined } | null = null

// Subscription system for React components
const subscribers = new Set<() => void>()

function subscribe(callback: () => void): () => void {
  subscribers.add(callback)
  return () => subscribers.delete(callback)
}

function notifySubscribers(): void {
  subscribers.forEach(cb => cb())
}

// Cache key generation
function getCacheKey(userId: number, page: number, per: number): string {
  return `${userId}:${page}:${per}`
}

// Session user management
export function setSessionUser(userId: number, username?: string): void {
  sessionUser = { userId, username }
  notifySubscribers()
}

export function clearSessionUser(): void {
  sessionUser = null
  notifySubscribers()
}

export function getSessionUser(): { userId: number; username: string | undefined } | null {
  return sessionUser
}

// Store accessors
function getState(userId: number | undefined, page: number, per: number): CachedUserChannels {
  if (!userId) {
    return { loading: false, error: null, channels: [], timestamp: 0 }
  }

  const key = getCacheKey(userId, page, per)
  return store.get(key) || { loading: false, error: null, channels: [], timestamp: 0 }
}

function setState(userId: number, page: number, per: number, state: CachedUserChannels): void {
  const key = getCacheKey(userId, page, per)
  store.set(key, state)
  notifySubscribers()
}

// Prevent duplicate simultaneous fetches
const inflightRequests = new Map<string, Promise<UserChannelListItem[]>>()

async function fetchAndCache(
  userId: number,
  username: string | undefined,
  page: number,
  per: number
): Promise<void> {
  const key = getCacheKey(userId, page, per)
  
  // Check if already fetching
  if (inflightRequests.has(key)) {
    try {
      await inflightRequests.get(key)
    } catch {
      // Error already handled in the original fetch
    }
    return
  }
  
  // Set loading state
  setState(userId, page, per, { loading: true, error: null, channels: [], timestamp: Date.now() })
  
  // Create fetch promise
  const fetchPromise = fetchArenaUserChannels(userId, username, page, per)
  inflightRequests.set(key, fetchPromise)
  
  try {
    const channels = await fetchPromise
    setState(userId, page, per, { 
      loading: false, 
      error: null, 
      channels, 
      timestamp: Date.now() 
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Error fetching user channels'
    setState(userId, page, per, { 
      loading: false, 
      error, 
      channels: [], 
      timestamp: Date.now() 
    })
  } finally {
    inflightRequests.delete(key)
  }
}

// Public API

export type UseUserChannelsOptions = {
  autoFetch?: boolean  // Default: true. Set false to only read cached data
  page?: number
  per?: number
}

export type UseUserChannelsResult = {
  loading: boolean
  error: string | null
  channels: UserChannelListItem[]
  refresh: () => void
}

/**
 * React hook for accessing user channels from the shared store.
 *
 * @param userId - Arena user ID (optional - uses session user if not provided)
 * @param username - Arena username (optional - uses session user if not provided)
 * @param options - Configuration options
 * @returns User channels state and refresh function
 *
 * Usage:
 * - Toolbar: useUserChannels(userId, username, { autoFetch: true })  // Proactively fetches
 * - ThreeDBox: useUserChannels(undefined, undefined, { autoFetch: false })  // Uses session user, only reads cache
 */
export function useUserChannels(
  userId: number | undefined,
  username: string | undefined,
  options: UseUserChannelsOptions = {}
): UseUserChannelsResult {
  const { autoFetch = true, page = 1, per = 50 } = options

  // Use session user if no userId provided
  const effectiveUserId = userId ?? sessionUser?.userId
  const effectiveUsername = username ?? sessionUser?.username

  // Force re-render when store updates
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

  // Subscribe to store changes
  useEffect(() => {
    return subscribe(forceUpdate)
  }, [])

  // Auto-fetch if enabled and userId present
  useEffect(() => {
    if (autoFetch && effectiveUserId) {
      fetchAndCache(effectiveUserId, effectiveUsername, page, per)
    }
  }, [effectiveUserId, effectiveUsername, autoFetch, page, per])

  // Get current state from store
  const state = getState(effectiveUserId, page, per)

  // Manual refresh function
  const refresh = () => {
    if (effectiveUserId) {
      fetchAndCache(effectiveUserId, effectiveUsername, page, per)
    }
  }

  return {
    loading: state.loading,
    error: state.error,
    channels: state.channels,
    refresh
  }
}

/**
 * React hook for accessing user channels using the session user.
 *
 * @param options - Configuration options
 * @returns User channels state and refresh function
 *
 * Usage:
 * - ThreeDBox: useSessionUserChannels({ autoFetch: false })  // Uses session user, only reads cache
 */
export function useSessionUserChannels(
  options: UseUserChannelsOptions = {}
): UseUserChannelsResult {
  return useUserChannels(undefined, undefined, options)
}

// Fuzzy search utilities

// Shared uFuzzy instance with optimized config
const fuzzySearcher = new uFuzzy({
  intraMode: 1, // MultiInsert mode for forgiving matching
  intraIns: 1,  // Allow insertions within terms
  intraSub: 1,  // Allow substitutions within terms
  intraTrn: 1,  // Allow transpositions within terms
  intraDel: 1   // Allow deletions within terms
})

/**
 * Fuzzy search user channels by title and slug.
 * 
 * @param channels - Array of user channels to search
 * @param query - Search query string
 * @returns Ranked array of matching channels
 * 
 * Example:
 * ```ts
 * const results = fuzzySearchChannels(allChannels, 'dsgn insp')
 * // Matches: "Design Inspiration", "inspiring-designs", etc.
 * ```
 */
export function fuzzySearchChannels(
  channels: UserChannelListItem[],
  query: string
): UserChannelListItem[] {
  if (!channels.length) return []
  
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return channels
  
  // Build haystack: combine title and slug for better matching
  const haystack = channels.map(ch => 
    `${ch.title || ''} ${ch.slug || ''}`.toLowerCase()
  )
  
  // Perform fuzzy search
  const idxs = fuzzySearcher.filter(haystack, trimmedQuery.toLowerCase())
  
  if (!idxs || idxs.length === 0) return []
  
  // Get match info for ranking
  const info = fuzzySearcher.info(idxs, haystack, trimmedQuery.toLowerCase())
  const order = fuzzySearcher.sort(info, haystack, trimmedQuery.toLowerCase())
  
  // Map sorted indices back to channel objects
  return order.map(i => channels[info.idx[i]])
}

/**
 * Clear all cached data and session user (useful for testing or user logout).
 */
export function clearUserChannelsStore(): void {
  store.clear()
  sessionUser = null
  notifySubscribers()
}

