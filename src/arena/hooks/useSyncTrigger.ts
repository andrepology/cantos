/**
 * Sync orchestration hook for Arena channels.
 * 
 * Handles:
 * - Channel creation in cache if not exists
 * - Staleness detection
 * - Triggering syncChannel() / syncChannelMetadata()
 * - Exposing sync state (syncing, error, refresh)
 * 
 * This hook does subscribe deeply (needs full channel for sync operations),
 * but its state changes are isolated - only syncing/error updates trigger
 * re-renders in the consuming component.
 * 
 * Note: This hook is intentionally separate from structure/layout hooks
 * to prevent sync-related deep subscriptions from cascading re-renders
 * to the layout system.
 */

import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { co, z } from 'jazz-tools'
import { useAccount, useCoState } from 'jazz-tools/react'
import {
  Account,
  ArenaBlock,
  ArenaCache,
  ArenaChannel,
  type LoadedArenaCache,
  type LoadedArenaChannel,
} from '../../jazz/schema'
import { isStale, syncChannel, syncChannelMetadata } from '../channelSync'

export interface SyncTriggerOptions {
  maxAgeMs?: number
  per?: number
  skipInitialFetch?: boolean
}

export interface SyncTriggerResult {
  /** True while sync is in progress */
  syncing: boolean
  /** Error message from last sync attempt */
  error: string | null
  /** Manually trigger a refresh */
  refresh: () => void
}

/**
 * Orchestrate sync for an Arena channel.
 * 
 * @param slug - Arena channel slug
 * @param options - Sync configuration
 * @returns Sync state and refresh function
 */
export function useSyncTrigger(
  slug: string | undefined,
  options: SyncTriggerOptions = {}
): SyncTriggerResult {
  const { maxAgeMs = 12 * 60 * 60 * 1000, per = 50, skipInitialFetch = false } = options

  const [syncing, setSyncing] = useState(false)
  const [runToken, setRunToken] = useState(0)
  const forceNextRunRef = useRef(false)
  const mountedRef = useRef(true)
  
  // Track which slug we've started syncing to avoid re-starting on subscription updates
  const syncStartedForSlugRef = useRef<string | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Get ArenaCache from account
  const me = useAccount(Account, { resolve: { root: { arenaCache: { channels: true, blocks: true } } } })
  
  const cache = useMemo(() => {
    if (me === undefined || me === null) return undefined
    if (!me.$isLoaded) return undefined
    const arenaCache = me.root?.arenaCache
    if (!arenaCache?.$isLoaded) return undefined
    if (!arenaCache.channels?.$isLoaded || !arenaCache.blocks?.$isLoaded) return undefined
    return arenaCache as LoadedArenaCache
  }, [me])

  // Get channel ID from cache
  const channelId = useMemo(() => {
    if (!slug || !cache) return undefined
    const channelRef = cache.channels[slug]
    if (!channelRef) return undefined
    return channelRef.$jazz.id
  }, [cache, slug])

  // Subscribe to channel with deep blocks for sync operations
  // This subscription is for sync triggering only - layout hooks subscribe separately
  const channel = useCoState(ArenaChannel, channelId, {
    resolve: { blocks: { $each: true }, fetchedPages: true, author: true },
  })

  const loadedChannel = channel?.$isLoaded ? (channel as LoadedArenaChannel) : null

  const refresh = useCallback(() => {
    forceNextRunRef.current = true
    syncStartedForSlugRef.current = null
    setRunToken((t) => t + 1)
  }, [])

  // Create channel in cache if it doesn't exist
  useEffect(() => {
    if (!slug) return
    if (!cache?.channels?.$isLoaded) return
    
    const existingChannel = cache.channels[slug]
    if (existingChannel !== undefined) return
    
    // Create new channel entry
    const owner = cache.$jazz.owner
    const created = ArenaChannel.create(
      {
        slug,
        blocks: co.list(ArenaBlock).create([]),
        fetchedPages: co.list(z.number()).create([]),
        hasMore: true,
      },
      owner ? { owner } : undefined,
    )

    console.log(`[useSyncTrigger] Creating channel in cache: ${slug}`)
    cache.channels.$jazz.set(slug, created)
  }, [cache, slug])

  // Sync trigger effect
  useEffect(() => {
    if (!slug) return
    if (skipInitialFetch) return
    if (!cache?.channels?.$isLoaded || !cache.blocks?.$isLoaded) return
    if (!loadedChannel?.blocks?.$isLoaded) return

    const force = forceNextRunRef.current
    
    // Prevent re-starting sync for same slug (unless forced)
    if (!force && syncStartedForSlugRef.current === slug) {
      return
    }
    
    forceNextRunRef.current = false
    
    // Check if we should sync
    const hasExistingData = loadedChannel.blocks.length > 0
    const channelIsStale = isStale(loadedChannel, maxAgeMs)
    const hasMore = loadedChannel.hasMore === true
    
    // Check for missing metadata
    const metadataMissing: string[] = []
    if (loadedChannel.channelId == null) metadataMissing.push('channelId')
    if (loadedChannel.title == null) metadataMissing.push('title')
    if (loadedChannel.createdAt == null) metadataMissing.push('createdAt')
    if (loadedChannel.updatedAt == null) metadataMissing.push('updatedAt')
    if (loadedChannel.length == null) metadataMissing.push('length')
    const authorId = loadedChannel.author?.$isLoaded ? loadedChannel.author.id : undefined
    if (!authorId) metadataMissing.push('author.id')
    const needsMetadata = metadataMissing.length > 0
    
    // Handle missing lastFetchedAt
    if (!force && hasExistingData && typeof loadedChannel.lastFetchedAt !== 'number' && !hasMore && !needsMetadata) {
      console.log(
        `[useSyncTrigger] Setting lastFetchedAt for "${slug}" (had blocks but no timestamp)`,
        { blocks: loadedChannel.blocks.length, hasMore, needsMetadata },
      )
      loadedChannel.$jazz.set('lastFetchedAt', Date.now())
      syncStartedForSlugRef.current = slug
      return
    }
    
    // Skip if data is fresh
    if (!force && hasExistingData && !channelIsStale && !hasMore && !needsMetadata) {
      console.log(
        `[useSyncTrigger] Skipping sync - data fresh for "${slug}"`,
        {
          blocks: loadedChannel.blocks.length,
          hasMore,
          needsMetadata,
          lastFetchedAt: loadedChannel.lastFetchedAt,
          maxAgeMs,
        },
      )
      syncStartedForSlugRef.current = slug
      return
    }

    // Metadata-only sync
    if (!force && hasExistingData && !channelIsStale && !hasMore && needsMetadata) {
      console.log(
        `[useSyncTrigger] STARTING METADATA SYNC for "${slug}"`,
        {
          blocks: loadedChannel.blocks.length,
          hasMore,
          needsMetadata,
          metadataMissing,
        },
      )
      syncStartedForSlugRef.current = slug

      const ac = new AbortController()
      setSyncing(true)

      syncChannelMetadata(loadedChannel, slug, { force, signal: ac.signal })
        .catch((err) => {
          console.error(`[useSyncTrigger] Metadata sync error for "${slug}":`, err)
        })
        .finally(() => {
          if (!mountedRef.current) return
          setSyncing(false)
        })

      return () => {
        ac.abort()
      }
    }

    // Full sync
    console.log(
      `[useSyncTrigger] STARTING SYNC for "${slug}"`,
      {
        force,
        stale: channelIsStale,
        blocks: loadedChannel.blocks.length,
        hasMore,
        needsMetadata,
        metadataMissing,
      },
    )
    syncStartedForSlugRef.current = slug

    const ac = new AbortController()
    setSyncing(true)

    syncChannel(cache, loadedChannel, slug, {
      per,
      maxAgeMs,
      force,
      signal: ac.signal,
    })
      .catch((err) => {
        console.error(`[useSyncTrigger] Sync error for "${slug}":`, err)
      })
      .finally(() => {
        if (!mountedRef.current) return
        setSyncing(false)
      })

    return () => {
      ac.abort()
    }
  }, [
    // Dependencies: only stable values and load states
    cache?.channels?.$isLoaded,
    cache?.blocks?.$isLoaded,
    channel?.$isLoaded,
    loadedChannel?.blocks?.$isLoaded,
    maxAgeMs,
    per,
    runToken,
    skipInitialFetch,
    slug,
  ])

  // Reset sync tracking when slug changes
  useEffect(() => {
    syncStartedForSlugRef.current = null
  }, [slug])

  return {
    syncing,
    error: channel?.$isLoaded ? channel.error ?? null : null,
    refresh,
  }
}

