/**
 * Hook for streaming Arena channel data from Jazz CoValues.
 *
 * Provides reactive access to channel blocks with:
 * - Automatic initial fetch when channel is missing or stale
 * - `fetchNext()` for pagination
 * - `refresh()` for force refresh
 * - Loading/error state
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useAccount, useCoState } from 'jazz-tools/react'
import { Account, ArenaChannel, type LoadedArenaChannel, type LoadedArenaBlock } from '../../jazz/schema'
import { syncChannelPage, isStale, isPageInflight, type SyncChannelPageOptions } from '../channelSync'

export type UseArenaChannelStreamResult = {
  /** The channel CoValue, or undefined if loading, or null if not found */
  channel: LoadedArenaChannel | undefined | null
  /** Array of loaded blocks (empty if channel not loaded) */
  blocks: LoadedArenaBlock[]
  /** True while fetching any page */
  loading: boolean
  /** Error message if last fetch failed */
  error: string | null
  /** Whether more pages are available */
  hasMore: boolean
  /** Fetch the next page of blocks */
  fetchNext: () => void
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

/**
 * Stream Arena channel data from Jazz CoValues.
 *
 * @example
 * ```tsx
 * function ChannelView({ slug }: { slug: string }) {
 *   const { channel, blocks, loading, error, fetchNext, refresh } = useArenaChannelStream(slug)
 *
 *   if (loading && blocks.length === 0) return <Loading />
 *   if (error) return <Error message={error} onRetry={refresh} />
 *
 *   return (
 *     <div>
 *       <h1>{channel?.title}</h1>
 *       {blocks.map(block => <BlockCard key={block.id} block={block} />)}
 *       {hasMore && <button onClick={fetchNext}>Load more</button>}
 *     </div>
 *   )
 * }
 * ```
 */
export function useArenaChannelStream(
  slug: string | undefined,
  options: UseArenaChannelStreamOptions = {}
): UseArenaChannelStreamResult {
  const { maxAgeMs = 5 * 60 * 1000, per = 50, skipInitialFetch = false } = options

  // Track loading state locally (since Jazz doesn't expose fetch status)
  const loadingRef = useRef(false)
  const mountedRef = useRef(true)

  // Get the account with arenaCache resolved shallowly (channels list only)
  const { me } = useAccount(Account, {
    resolve: {
      root: {
        arenaCache: {
          channels: true, // shallow - just the list, not each channel's blocks
        },
      },
    },
  })

  // Find channel by slug in the cache (linear scan, fine for 10-300 channels)
  const channelId = useMemo(() => {
    if (!me?.root?.arenaCache?.channels || !slug) return undefined
    const found = me.root.arenaCache.channels.find(c => c?.slug === slug)
    return found?.$jazz.id
  }, [me?.root?.arenaCache?.channels, slug])

  // Deep subscribe to the channel's blocks
  const channel = useCoState(ArenaChannel, channelId, { resolve: { blocks: { $each: true } } }) as LoadedArenaChannel | undefined | null

  // Extract state from channel
  const blocks = useMemo(() => {
    if (!channel?.blocks) return []
    // Filter out any undefined entries (shouldn't happen, but defensive)
    const list = channel.blocks.filter((b): b is LoadedArenaBlock => b !== undefined && b !== null)
    console.debug('[useArenaChannelStream] blocks changed', {
      slug,
      channelId,
      count: list.length,
      fetchedPages: channel?.fetchedPages?.slice?.(),
    })
    return list
  }, [channel?.blocks])

  const error = channel?.error ?? null
  const hasMore = channel?.hasMore ?? true

  // Determine if we should consider this "loading"
  // Loading = no channel yet OR channel exists but we're fetching
  const loading = !channel || loadingRef.current

  // Sync function that handles loading state
  const doSync = useCallback(
    async (page?: number, opts: SyncChannelPageOptions = {}) => {
      if (!me?.root?.arenaCache || !slug) return

      loadingRef.current = true
      console.debug('[useArenaChannelStream] sync start', { slug, page, opts })

      try {
        await syncChannelPage(me.root.arenaCache, slug, page, { per, ...opts })
      } catch (e) {
        // Error is stored on the channel CoValue by syncChannelPage
        console.error('[useArenaChannelStream] sync error:', e)
      } finally {
        if (mountedRef.current) {
          loadingRef.current = false
          console.debug('[useArenaChannelStream] sync done', { slug, page })
        }
      }
    },
    [me?.root?.arenaCache, slug, per]
  )

  // Auto-fetch on mount if channel is missing or stale
  useEffect(() => {
    mountedRef.current = true

    if (skipInitialFetch || !slug || !me?.root?.arenaCache) return

    // Check if we need to fetch
    const existingChannel = me.root.arenaCache.channels.find(c => c?.slug === slug) as
      | LoadedArenaChannel
      | undefined

    if (!existingChannel || isStale(existingChannel, maxAgeMs)) {
      console.debug('[useArenaChannelStream] auto-fetch', { slug, reason: existingChannel ? 'stale' : 'missing' })
      doSync(1)
    }

    return () => {
      mountedRef.current = false
    }
  }, [slug, me?.root?.arenaCache, skipInitialFetch, maxAgeMs, doSync])

  // fetchNext: fetch the next unfetched page
  const fetchNext = useCallback(() => {
    if (!channel || !hasMore) return

    // Calculate next page
    const highestPage = channel.fetchedPages
      ? Math.max(...channel.fetchedPages.map(p => p ?? 0), 0)
      : 0
    const nextPage = highestPage + 1

    // Skip if already inflight
    if (isPageInflight(slug!, nextPage)) return

    doSync(nextPage)
  }, [channel, hasMore, slug, doSync])

  // refresh: force fetch from page 1
  const refresh = useCallback(() => {
    if (!slug) return
    doSync(1, { force: true })
  }, [slug, doSync])

  return {
    channel,
    blocks,
    loading,
    error,
    hasMore,
    fetchNext,
    refresh,
  }
}
