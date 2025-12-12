/**
 * Hook for streaming Arena channel data from Jazz CoValues.
 *
 * - Subscribes to the channel CoValue and its blocks.
 * - Kicks off a background sync (metadata + pages) via `syncChannel`.
 *
 * Tri-state:
 * - `channel === undefined`: loading / not created yet
 * - `channel === null`: not found / no access
 * - `channel` instance: ready
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useCoState } from 'jazz-tools/react'
import { Account, ArenaChannel, type LoadedArenaBlock, type LoadedArenaChannel } from '../../jazz/schema'
import { syncChannel } from '../channelSync'

export type UseArenaChannelStreamResult = {
  /** The channel CoValue, or undefined/null while loading/denied */
  channel: LoadedArenaChannel | undefined | null
  /** Array of loaded blocks (grows as pages arrive) */
  blocks: LoadedArenaBlock[]
  /** True while syncing or the channel isn't loaded yet */
  loading: boolean
  /** Error message if last sync failed */
  error: string | null
  /** Whether more pages are available */
  hasMore: boolean
  /** Force refresh from page 1 */
  refresh: () => void
}

export type UseArenaChannelStreamOptions = {
  /** Max age in ms before channel is considered stale (default: 5 min) */
  maxAgeMs?: number
  /** Blocks per page (default: 50) */
  per?: number
  /** Skip auto-fetch on mount (useful for prefetch scenarios) */
  skipInitialFetch?: boolean
}

export function useArenaChannelStream(
  slug: string | undefined,
  options: UseArenaChannelStreamOptions = {}
): UseArenaChannelStreamResult {
  const { maxAgeMs = 5 * 60 * 1000, per = 50, skipInitialFetch = false } = options

  const mountedRef = useRef(true)
  const forceNextRunRef = useRef(false)
  const [syncing, setSyncing] = useState(false)
  const [runToken, setRunToken] = useState(0)

  const { me } = useAccount(Account, {
    resolve: {
      root: {
        arenaCache: { channels: true },
      },
    },
  })

  const cacheId = me?.root?.arenaCache?.$jazz.id

  // Find channel by slug in the cache (linear scan, fine for 10-300 channels).
  const channelId = useMemo(() => {
    if (!me?.root?.arenaCache?.channels || !slug) return undefined
    const found = me.root.arenaCache.channels.find(c => c?.slug === slug)
    return found?.$jazz.id
  }, [me?.root?.arenaCache?.channels, slug])

  // Deep subscribe to the channel's blocks.
  const channel = useCoState(ArenaChannel, channelId, {
    resolve: { blocks: { $each: true } },
  }) as LoadedArenaChannel | undefined | null

  const blocks = useMemo(() => {
    if (!channel?.blocks) return []
    return channel.blocks.filter((b): b is LoadedArenaBlock => b !== undefined && b !== null)
  }, [channel?.blocks])

  const refresh = useCallback(() => {
    forceNextRunRef.current = true
    setRunToken(t => t + 1)
  }, [])

  useEffect(() => {
    mountedRef.current = true

    if (skipInitialFetch || !slug || !me?.root?.arenaCache) {
      return () => {
        mountedRef.current = false
      }
    }

    const cache = me.root.arenaCache
    const ac = new AbortController()
    const force = forceNextRunRef.current
    forceNextRunRef.current = false

    setSyncing(true)
    syncChannel(cache, slug, { per, maxAgeMs, force, signal: ac.signal })
      .catch(() => {
        // Error is written onto the channel CoValue.
      })
      .finally(() => {
        if (!mountedRef.current || ac.signal.aborted) return
        setSyncing(false)
      })

    return () => {
      mountedRef.current = false
      ac.abort()
    }
  }, [slug, per, maxAgeMs, skipInitialFetch, cacheId, runToken])

  return {
    channel,
    blocks,
    loading: syncing || channel === undefined,
    error: channel?.error ?? null,
    hasMore: channel?.hasMore ?? false,
    refresh,
  }
}
