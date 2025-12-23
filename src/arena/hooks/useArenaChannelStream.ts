/**
 * Hook for streaming Arena channel data from Jazz CoValues.
 *
 * Architecture:
 * 1) Subscribe to the ArenaCache (O(1) lookup via co.record)
 * 2) Get channel directly by slug from cache.channels[slug]
 * 3) Subscribe deeply to ONLY that channel's blocks
 * 4) Kick off Are.na sync only after local IndexedDB hydration is complete
 *
 * Key patterns (per Jazz playbook):
 * - Pass IDs down, subscribe locally
 * - Check $isLoaded before accessing data
 * - Don't abort sync due to subscription updates
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CoValueLoadingState, co, z } from 'jazz-tools'
import { useAccount, useCoState } from 'jazz-tools/react'

import {
  Account,
  ArenaBlock,
  ArenaCache,
  ArenaChannel,
  type LoadedArenaBlock,
  type LoadedArenaCache,
  type LoadedArenaChannel,
} from '../../jazz/schema'
import { isStale, syncChannel } from '../channelSync'
import { recordRender } from '../renderCounts'
import type { LayoutItem } from './useTactileLayout'

export type UseArenaChannelStreamResult = {
  channel: LoadedArenaChannel | undefined | null
  blockIds: string[]
  layoutItems: LayoutItem[]
  loading: boolean
  error: string | null
  hasMore: boolean
  refresh: () => void
}

export type UseArenaChannelStreamOptions = {
  maxAgeMs?: number
  per?: number
  skipInitialFetch?: boolean
}

export function useArenaChannelStream(
  slug: string | undefined,
  options: UseArenaChannelStreamOptions = {},
): UseArenaChannelStreamResult {
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

  // STEP 1: Get the ArenaCache ID from user's account root
  const me = useAccount(Account, { resolve: { root: { arenaCache: true } } })
  
  const cacheId = useMemo(() => {
    if (!me.$isLoaded) return undefined
    return me.root?.arenaCache?.$jazz.id
  }, [me])

  // STEP 2: Subscribe to ArenaCache (resolves channels record container)
  const cache = useCoState(ArenaCache, cacheId, { resolve: { channels: true, blocks: true } })

  // STEP 3: O(1) channel lookup by slug from co.record
  // Jazz co.record: accessing cache.channels[slug] returns MaybeLoaded<ArenaChannel>
  const channelId = useMemo(() => {
    if (!slug) return undefined
    if (cache === undefined || cache === null) return undefined
    if (!cache.channels?.$isLoaded) return undefined

    // Access the record - Jazz returns the value or undefined if key doesn't exist
    const channelRef = cache.channels[slug]
    if (!channelRef) return undefined
    
    // The reference always has an ID even if not fully loaded
    return channelRef.$jazz.id
  }, [cache, slug])

  // STEP 4: Subscribe deeply to the specific channel we need
  const channel = useCoState(ArenaChannel, channelId, {
    resolve: { blocks: { $each: true }, fetchedPages: true, author: true },
  })

  // Derive tri-state: undefined (loading), null (not found), or loaded instance
  const channelTriState = useMemo((): LoadedArenaChannel | undefined | null => {
    if (channel === undefined) return undefined
    if (channel === null) return null
    if (!channel.$isLoaded) {
      return channel.$jazz.loadingState === CoValueLoadingState.LOADING ? undefined : null
    }
    return channel as LoadedArenaChannel
  }, [channel])

  // Extract block IDs and layout items from loaded channel
  const { blockIds, layoutItems } = useMemo(() => {
    if (!channel?.$isLoaded || !channel.blocks?.$isLoaded) {
      return { blockIds: [], layoutItems: [] }
    }
    
    const loadedBlocks = channel.blocks.filter((b): b is LoadedArenaBlock => b?.$isLoaded === true)
    return {
      blockIds: loadedBlocks.map(b => b.$jazz.id),
      layoutItems: loadedBlocks.map(b => ({
        id: b.$jazz.id,
        arenaId: b.arenaId ?? Number(b.blockId) ?? 0,
        aspect: b.aspect ?? 1
      }))
    }
  }, [channel])

  // Dev logging
  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (!slug) return
    recordRender(`ArenaChannelStream:${slug}`)
  }, [blockIds.length, channelTriState?.$isLoaded, slug])

  const refresh = useCallback(() => {
    forceNextRunRef.current = true
    syncStartedForSlugRef.current = null // Reset to allow new sync
    setRunToken((t) => t + 1)
  }, [])

  // STEP 5: Create channel in cache if it doesn't exist (one-time effect)
  useEffect(() => {
    if (!slug) return
    if (cache === undefined || cache === null) return
    if (!cache.channels?.$isLoaded) return
    
    // Check if channel already exists in the record
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

    console.log(`[useArenaChannelStream] Creating channel in cache: ${slug}`)
    cache.channels.$jazz.set(slug, created)
  }, [cache, slug])

  // STEP 6: Start sync once channel is ready
  // CRITICAL: Don't include data-dependent values that change during sync
  useEffect(() => {
    if (!slug) return
    if (skipInitialFetch) return
    if (cache === undefined || cache === null) return
    if (!cache.$isLoaded || !cache.channels?.$isLoaded || !cache.blocks?.$isLoaded) return
    if (channel === undefined || channel === null) return
    if (!channel.$isLoaded || !channel.blocks?.$isLoaded) return

    const force = forceNextRunRef.current
    
    // Prevent re-starting sync for same slug (unless forced)
    if (!force && syncStartedForSlugRef.current === slug) {
      return
    }
    
    forceNextRunRef.current = false
    
    // Check if we should sync
    const hasExistingData = channel.blocks.length > 0
    const channelIsStale = isStale(channel as LoadedArenaChannel, maxAgeMs)
    const hasMore = channel.hasMore === true
    const needsMetadata =
      channel.channelId == null ||
      channel.title == null ||
      channel.createdAt == null ||
      channel.updatedAt == null ||
      channel.length == null ||
      !channel.author?.id ||
      channel.description == null
    
    // Handle missing lastFetchedAt
    if (!force && hasExistingData && typeof channel.lastFetchedAt !== 'number' && !hasMore && !needsMetadata) {
      console.log(`[useArenaChannelStream] Setting lastFetchedAt for "${slug}" (had blocks but no timestamp)`)
      channel.$jazz.set('lastFetchedAt', Date.now())
      syncStartedForSlugRef.current = slug
      return
    }
    
    // Skip if data is fresh
    if (!force && hasExistingData && !channelIsStale && !hasMore && !needsMetadata) {
      console.log(`[useArenaChannelStream] Skipping sync - data fresh. Blocks: ${channel.blocks.length}`)
      syncStartedForSlugRef.current = slug
      return
    }

    console.log(`[useArenaChannelStream] STARTING SYNC for "${slug}". Force=${force}, Stale=${channelIsStale}, Blocks=${channel.blocks.length}`)
    syncStartedForSlugRef.current = slug

    const ac = new AbortController()
    setSyncing(true)

    // Start sync - runs to completion unless component unmounts or slug changes
    syncChannel(cache as LoadedArenaCache, channel as LoadedArenaChannel, slug, {
      per,
      maxAgeMs,
      force,
      signal: ac.signal,
    })
      .catch((err) => {
        console.error(`[useArenaChannelStream] Sync error for "${slug}":`, err)
      })
      .finally(() => {
        if (!mountedRef.current) return
        setSyncing(false)
      })

    // Only abort on unmount or slug change - NOT on subscription updates
    return () => {
      ac.abort()
    }
  }, [
    // Stable dependencies only - don't include values that change during sync
    cache?.$isLoaded,
    cache?.channels?.$isLoaded,
    cache?.blocks?.$isLoaded,
    channel?.$isLoaded,
    channel?.blocks?.$isLoaded,
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

  const loading =
    syncing ||
    (slug
      ? cache === undefined ||
        (cache !== null && !cache.$isLoaded) ||
        channel === undefined ||
        (channel !== null && !channel.$isLoaded) ||
        (channel?.$isLoaded && !channel.blocks?.$isLoaded)
      : false)

  return {
    channel: channelTriState,
    blockIds,
    layoutItems,
    loading,
    error: channel?.$isLoaded ? channel.error ?? null : null,
    hasMore: channel?.$isLoaded ? channel.hasMore ?? false : false,
    refresh,
  }
}
