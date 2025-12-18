/**
 * Hook for streaming Arena channel data from Jazz CoValues.
 *
 * Architecture:
 * 1) Subscribe to the ArenaCache (fast, list of channels)
 * 2) Find the channel by slug (requires channels list + each channel to be loaded)
 * 3) Subscribe deeply to ONLY that channel's blocks
 * 4) Kick off Are.na sync only after local IndexedDB hydration is complete
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CoValueLoadingState, co, z, type MaybeLoaded } from 'jazz-tools'
import { useAccount, useCoState } from 'jazz-tools/react'

import {
  Account,
  ArenaBlock,
  ArenaCache,
  ArenaChannel,
  type LoadedArenaBlock,
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

function toTriState<T extends { $isLoaded: boolean; $jazz: { loadingState: string } }>(
  value: MaybeLoaded<T>,
): T | undefined | null {
  if (value.$isLoaded) return value
  return value.$jazz.loadingState === CoValueLoadingState.LOADING ? undefined : null
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
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // STEP 1: Load the user's ArenaCache ID from their Account root.
  const me = useAccount(Account, { resolve: { root: { arenaCache: true } } })

  const cacheId = useMemo(() => {
    if (!me.$isLoaded) return undefined
    return me.root?.arenaCache?.$jazz.id
  }, [me])

  // STEP 1.5: Subscribe to ArenaCache and shallow-load its channels (and each channel's primitives).
  const cache = useCoState(ArenaCache, cacheId, { resolve: { channels: { $each: true } } })
  const cacheRef = useRef(cache)
  cacheRef.current = cache

  const cacheLoaded = cache.$isLoaded
  const cacheChannelsLoaded = cacheLoaded && cache.channels.$isLoaded

  // STEP 1.75: Determine the channel ID by slug (requires cache + channels list fully hydrated).
  const channelId = useMemo(() => {
    if (!slug) return undefined
    if (!cacheChannelsLoaded) return undefined

    const found = cache.channels.find((c) => c?.$isLoaded && c.slug === slug)
    return found?.$jazz.id
  }, [cache, cacheChannelsLoaded, slug])

  // STEP 2: Subscribe deeply to the specific channel we need.
  const channelMaybe = useCoState(ArenaChannel, channelId, {
    resolve: { blocks: { $each: true }, fetchedPages: true, author: true },
  })
  const channelMaybeRef = useRef(channelMaybe)
  channelMaybeRef.current = channelMaybe

  const channelLoaded = channelMaybe.$isLoaded
  const channelBlocksLoaded = channelLoaded && channelMaybe.blocks.$isLoaded

  const channel = useMemo(() => toTriState(channelMaybe as MaybeLoaded<LoadedArenaChannel>), [channelMaybe])

  const { blockIds, layoutItems } = useMemo(() => {
    if (channelMaybe.$isLoaded && channelMaybe.blocks.$isLoaded) {
      const loadedBlocks = channelMaybe.blocks.filter((b): b is LoadedArenaBlock => b?.$isLoaded)
      return {
        blockIds: loadedBlocks.map(b => b.$jazz.id),
        layoutItems: loadedBlocks.map(b => ({
          id: b.$jazz.id,
          arenaId: b.arenaId ?? Number(b.blockId) ?? 0,
          aspect: b.aspect ?? 1
        }))
      }
    }
    return { blockIds: [], layoutItems: [] }
  }, [channelMaybe])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (!slug) return
    // Coarse signal: this hook produced a new blocks array / loading tri-state changed.
    recordRender(`ArenaChannelStream:${slug}`)
  }, [blockIds.length, channel?.$isLoaded, slug])

  const refresh = useCallback(() => {
    forceNextRunRef.current = true
    setRunToken((t) => t + 1)
  }, [])

  // STEP 2.5: Ensure the channel CoValue exists in the cache (create once, after hydration).
  const channelExistsInCache = useMemo(() => {
    if (!slug) return false
    if (!cacheChannelsLoaded) return false
    return cache.channels.some((c) => c?.$isLoaded && c.slug === slug)
  }, [cache, cacheChannelsLoaded, slug])

  useEffect(() => {
    const cacheNow = cacheRef.current
    if (!slug) return

    if (!cacheId) {
      console.log(`[useArenaChannelStream] Waiting for cacheId (account/root not hydrated yet).`)
      return
    }

    if (!cacheNow?.$isLoaded) {
      console.log(
        `[useArenaChannelStream] Cache object exists but $isLoaded=false. State: ${cacheNow?.$jazz.loadingState}`,
      )
      return
    }

    if (!cacheNow.channels?.$isLoaded) {
      console.log(`[useArenaChannelStream] Cache loaded but 'channels' list is still loading. Waiting...`)
      return
    }

    if (channelExistsInCache) return

    if (cacheNow.channels.length === 0) {
      console.log(`[useArenaChannelStream] Cache loaded and empty. Creating FIRST channel: ${slug}`)
    } else {
      console.log(
        `[useArenaChannelStream] Channel "${slug}" not found in cache of ${cacheNow.channels.length}. Creating new entry.`,
      )
    }

    const owner = cacheNow.$jazz.owner
    const created = ArenaChannel.create(
      {
        slug,
        blocks: co.list(ArenaBlock).create([]),
        fetchedPages: co.list(z.number()).create([]),
        hasMore: true,
      },
      owner ? { owner } : undefined,
    ) as LoadedArenaChannel

    cacheNow.channels.$jazz.push(created)
  }, [cacheChannelsLoaded, cacheId, cacheLoaded, channelExistsInCache, slug])

  // STEP 3: Sync (only after cache + channel + blocks are hydrated).
  const lastSyncDecisionKeyRef = useRef<string | null>(null)
  const activeSyncRunIdRef = useRef(0)
  useEffect(() => {
    const cacheNow = cacheRef.current
    const channelNow = channelMaybeRef.current
    if (!slug) return
    if (skipInitialFetch) return

    if (!cacheId) return
    if (!cacheLoaded) return
    if (!cacheChannelsLoaded) return

    if (!channelId) {
      console.log(`[useArenaChannelStream] Waiting for channelId lookup for "${slug}"...`)
      return
    }

    if (!channelNow.$isLoaded) {
      console.log(`[useArenaChannelStream] Waiting for channel data to load... (ID: ${channelId})`)
      return
    }

    if (!channelNow.blocks.$isLoaded) {
      console.log(`[useArenaChannelStream] Channel loaded but 'blocks' list is still loading. Waiting...`)
      return
    }

    const channelLoadedNow = channelNow as unknown as LoadedArenaChannel
    const channelBlocksLengthNow = channelNow.blocks.$isLoaded ? channelNow.blocks.length : null
    const channelLastFetchedAtNow = channelNow.lastFetchedAt ?? null
    const force = forceNextRunRef.current
    forceNextRunRef.current = false
    const syncDecisionKey = JSON.stringify({
      slug,
      cacheId,
      channelId,
      channelBlocksLength: channelBlocksLengthNow,
      channelLastFetchedAt: channelLastFetchedAtNow,
      maxAgeMs,
      forceNextRun: force,
    })
    if (lastSyncDecisionKeyRef.current !== syncDecisionKey) {
      lastSyncDecisionKeyRef.current = syncDecisionKey
      console.log(`[useArenaChannelStream] Sync check for "${slug}":`, {
        cacheSize: cacheNow.$isLoaded && cacheNow.channels.$isLoaded ? cacheNow.channels.length : null,
        channelFoundInCache:
          cacheNow.$isLoaded && cacheNow.channels.$isLoaded
            ? !!cacheNow.channels.find((c) => c?.$isLoaded && c.slug === slug)
            : false,
        deepResolvedChannel: true,
        hasBlocks: channelNow.blocks.length,
        lastFetchedAt: channelNow.lastFetchedAt,
        ageMs:
          typeof channelNow.lastFetchedAt === 'number'
            ? Date.now() - channelNow.lastFetchedAt
            : null,
        maxAgeMs,
        isStale: isStale(channelLoadedNow, maxAgeMs),
      })
    }

    const hasExistingData = channelNow.blocks.length > 0
    if (
      !force &&
      hasExistingData &&
      typeof channelNow.lastFetchedAt !== 'number'
    ) {
      console.log(
        `[useArenaChannelStream] Channel has blocks but lastFetchedAt is missing; setting lastFetchedAt=Date.now() to avoid immediate refetch.`,
      )
      channelNow.$jazz.set('lastFetchedAt', Date.now())
      return
    }
    const channelIsStale = isStale(channelLoadedNow, maxAgeMs)

    if (!force && hasExistingData && !channelIsStale) {
      if (lastSyncDecisionKeyRef.current === syncDecisionKey) {
        console.log(`[useArenaChannelStream] Skipping sync - data fresh. Blocks: ${channelNow.blocks.length}`)
      }
      return
    }

    console.log(
      `[useArenaChannelStream] STARTING SYNC. Force=${force}, Stale=${channelIsStale}, ExistingBlocks=${channelNow.blocks.length}`,
    )

    const runId = (activeSyncRunIdRef.current += 1)
    const ac = new AbortController()
    setSyncing(true)

    syncChannel(channelLoadedNow, slug, {
      per,
      maxAgeMs,
      force,
      signal: ac.signal,
    })
      .catch(() => {
        // Error written to channel CoValue
      })
      .finally(() => {
        if (!mountedRef.current) return
        if (activeSyncRunIdRef.current !== runId) return
        setSyncing(false)
      })

    return () => ac.abort()
  }, [
    cacheChannelsLoaded,
    cacheId,
    cacheLoaded,
    channelId,
    channelLoaded,
    channelBlocksLoaded,
    maxAgeMs,
    per,
    runToken,
    skipInitialFetch,
    slug,
  ])

  const loading =
    syncing ||
    (slug
      ? !cacheId ||
        cache.$jazz.loadingState === CoValueLoadingState.LOADING ||
        (cache.$isLoaded && (!cache.channels.$isLoaded || (channelId ? !channelMaybe.$isLoaded : true))) ||
        (channelMaybe.$isLoaded && !channelMaybe.blocks.$isLoaded)
      : false)

  return {
    channel,
    blockIds,
    layoutItems,
    loading,
    error: channelMaybe.$isLoaded ? channelMaybe.error ?? null : null,
    hasMore: channelMaybe.$isLoaded ? channelMaybe.hasMore ?? false : false,
    refresh,
  }
}
