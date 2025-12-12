/**
 * Hook for streaming Arena channel data from Jazz CoValues.
 *
 * Provides reactive access to channel blocks with:
 * - Automatic fetch of all pages (rate-limited by arenaFetch)
 * - Blocks render incrementally as pages arrive
 * - `refresh()` for force refresh from page 1
 * - Loading/error state
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useAccount, useCoState } from 'jazz-tools/react'
import { Account, ArenaChannel, type LoadedArenaChannel, type LoadedArenaBlock } from '../../jazz/schema'
import { syncChannelPage, isStale, type SyncChannelPageOptions } from '../channelSync'

export type UseArenaChannelStreamResult = {
  /** The channel CoValue, or undefined if loading */
  channel: LoadedArenaChannel | undefined | null
  /** Array of loaded blocks (grows as pages arrive) */
  blocks: LoadedArenaBlock[]
  /** True while fetching (any page) */
  loading: boolean
  /** Error message if last fetch failed */
  error: string | null
  /** Whether more pages are being fetched */
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

/**
 * Stream Arena channel data from Jazz CoValues.
 * Automatically fetches all pages; blocks render as they arrive.
 *
 * @example
 * ```tsx
 * function ChannelView({ slug }: { slug: string }) {
 *   const { channel, blocks, loading, error, refresh } = useArenaChannelStream(slug)
 *
 *   if (loading && blocks.length === 0) return <Loading />
 *   if (error) return <Error message={error} onRetry={refresh} />
 *
 *   return (
 *     <div>
 *       <h1>{channel?.title}</h1>
 *       {blocks.map(block => <BlockCard key={block.blockId} block={block} />)}
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

  // Extract blocks from channel (filter defensive against undefined entries)
  const blocks = useMemo(() => {
    if (!channel?.blocks) return []
    return channel.blocks.filter((b): b is LoadedArenaBlock => b !== undefined && b !== null)
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
      try {
        await syncChannelPage(me.root.arenaCache, slug, page, { per, ...opts })
      } catch {
        // Error is stored on the channel CoValue by syncChannelPage
      } finally {
        if (mountedRef.current) {
          loadingRef.current = false
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
      doSync(1)
    }

    return () => {
      mountedRef.current = false
    }
  }, [slug, me?.root?.arenaCache, skipInitialFetch, maxAgeMs, doSync])

  // fetchNext: fetch the next unfetched page
  const fetchNext = useCallback(() => {
    if (!channel || !hasMore) return
    // Let syncChannelPage pick the next unfetched page.
    doSync(undefined)
  }, [channel, hasMore, slug, doSync])

  // refresh: force fetch from page 1
  const refresh = useCallback(() => {
    if (!slug) return
    doSync(1, { force: true })
  }, [slug, doSync])

  // Auto-fetch remaining pages until hasMore is false
  // Use fetchedPagesCount + channelId as dependencies (more stable than channel object)
  const fetchedPagesCount = channel?.fetchedPages?.length ?? 0
  useEffect(() => {
    if (!slug || !channelId || !hasMore || loadingRef.current) return
    fetchNext()
  }, [slug, channelId, hasMore, fetchedPagesCount, fetchNext])

  return { channel, blocks, loading, error, hasMore, refresh }
}
