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

export type UseArenaChannelStreamResult = {
  channel: LoadedArenaChannel | undefined | null
  blocks: LoadedArenaBlock[]
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
  const [forceNextRun, setForceNextRun] = useState(false)

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

  const cacheLoadingState = cache.$jazz.loadingState
  const cacheLoaded = cache.$isLoaded
  const cacheChannelsLoaded = cacheLoaded && cache.channels.$isLoaded
  const cacheChannelsLength = cacheChannelsLoaded ? cache.channels.length : null

  // STEP 1.75: Determine the channel ID by slug (requires cache + channels list fully hydrated).
  const channelId = useMemo(() => {
    if (!slug) return undefined
    if (!cacheChannelsLoaded) return undefined

    const found = cache.channels.find((c) => c?.$isLoaded && c.slug === slug)
    return found?.$jazz.id
  }, [cache, cacheChannelsLoaded, slug])

  // STEP 2: Subscribe deeply to the specific channel we need.
  const channelMaybe = useCoState(ArenaChannel, channelId, {
    resolve: { blocks: { $each: true }, fetchedPages: true },
  })
  const channelMaybeRef = useRef(channelMaybe)
  channelMaybeRef.current = channelMaybe

  const channelLoadingState = channelMaybe.$jazz.loadingState
  const channelLoaded = channelMaybe.$isLoaded
  const channelBlocksLoaded = channelLoaded && channelMaybe.blocks.$isLoaded
  const channelBlocksLength = channelBlocksLoaded ? channelMaybe.blocks.length : null
  const channelLastFetchedAt = channelLoaded ? channelMaybe.lastFetchedAt : null

  const channel = useMemo(() => toTriState(channelMaybe as MaybeLoaded<LoadedArenaChannel>), [channelMaybe])

  const blocks = useMemo(() => {
    if (!channelMaybe.$isLoaded) return []
    if (!channelMaybe.blocks.$isLoaded) return []
    return channelMaybe.blocks.filter((b): b is LoadedArenaBlock => b?.$isLoaded)
  }, [channelMaybe])

  const refresh = useCallback(() => {
    setForceNextRun(true)
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

    if (!cacheLoaded) {
      console.log(
        `[useArenaChannelStream] Cache object exists but $isLoaded=false. State: ${cache.$jazz.loadingState}`,
      )
      return
    }

    if (!cacheChannelsLoaded) {
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
  useEffect(() => {
    const cacheNow = cacheRef.current
    const channelNow = channelMaybeRef.current
    if (!slug) return
    if (skipInitialFetch) return
    if (syncing) return

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

    const syncDecisionKey = JSON.stringify({
      slug,
      cacheId,
      channelId,
      channelBlocksLength,
      channelLastFetchedAt,
      maxAgeMs,
      forceNextRun,
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
        isStale: isStale(channelNow as any, maxAgeMs),
      })
    }

    const force = forceNextRun
    if (force) setForceNextRun(false)

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
    const channelIsStale = isStale(channelNow as any, maxAgeMs)

    if (!force && hasExistingData && !channelIsStale) {
      if (lastSyncDecisionKeyRef.current === syncDecisionKey) {
        console.log(`[useArenaChannelStream] Skipping sync - data fresh. Blocks: ${channelNow.blocks.length}`)
      }
      return
    }

    console.log(
      `[useArenaChannelStream] STARTING SYNC. Force=${force}, Stale=${channelIsStale}, ExistingBlocks=${channelNow.blocks.length}`,
    )

    const ac = new AbortController()
    setSyncing(true)

    syncChannel(channelNow as unknown as LoadedArenaChannel, slug, {
      per,
      maxAgeMs,
      force,
      signal: ac.signal,
    })
      .catch(() => {
        // Error written to channel CoValue
      })
      .finally(() => {
        if (ac.signal.aborted) return
        setSyncing(false)
      })

    return () => ac.abort()
  }, [
    cacheChannelsLoaded,
    cacheId,
    cacheLoaded,
    channelBlocksLength,
    channelId,
    channelLastFetchedAt,
    forceNextRun,
    maxAgeMs,
    per,
    runToken,
    skipInitialFetch,
    slug,
    syncing,
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
    blocks,
    loading,
    error: channelMaybe.$isLoaded ? channelMaybe.error ?? null : null,
    hasMore: channelMaybe.$isLoaded ? channelMaybe.hasMore ?? false : false,
    refresh,
  }
}
