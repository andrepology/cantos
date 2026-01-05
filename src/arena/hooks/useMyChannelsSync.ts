import { useEffect, useRef } from 'react'
import { useAccount } from 'jazz-tools/react'
import { Account, ArenaChannel, ArenaBlock } from '../../jazz/schema'
import { fetchArenaUserChannels } from '../api'
import { co } from 'jazz-tools'

/**
 * Sync hook for fetching the authenticated user's channels from Arena API
 * and writing them to Jazz CoValues.
 * 
 * Pattern: Similar to useSyncTrigger - staleness detection + orchestration.
 * 
 * Data flow:
 * 1. Read userId from root.arena.userId
 * 2. Check staleness via arenaCache.myChannelsLastFetchedAt
 * 3. Fetch from Arena API
 * 4. Upsert each channel into arenaCache.channels[slug] (lightweight metadata)
 * 5. Write ordered slugs to arenaCache.myChannelIds
 * 6. Update timestamp
 * 
 * Note: We reuse the channels registry. Initially stores lightweight metadata,
 * gets enriched with full block data when a portal loads the channel.
 */

const STALENESS_MS = 2 * 60 * 60 * 1000 // 2 hours

export function useMyChannelsSync() {
  const me = useAccount(Account, {
    resolve: { 
      root: { 
        arena: true, 
        arenaCache: { 
          myChannelIds: true, 
          channels: true 
        } 
      } 
    }
  })

  const inflightRef = useRef(false)
  const lastMissingRef = useRef<string | null>(null)

  // Extract stable references with proper guards
  const cache = me?.$isLoaded && me.root?.arenaCache?.$isLoaded ? me.root.arenaCache : null
  const channelsRegistry = cache?.channels?.$isLoaded ? cache.channels : null
  const myChannelIds = cache?.myChannelIds?.$isLoaded ? cache.myChannelIds : null
  const userId = me?.$isLoaded ? me.root?.arena?.userId : undefined
  const username = me?.$isLoaded ? me.root?.arena?.slug : undefined
  const lastFetch = cache?.myChannelsLastFetchedAt ?? 0

  useEffect(() => {
    // All guards - ensure everything is loaded before proceeding
    const missingReason = !cache
      ? 'cache'
      : !channelsRegistry
        ? 'channelsRegistry'
        : !myChannelIds
          ? 'myChannelIds'
          : !userId
            ? 'userId'
            : null

    if (missingReason) {
      if (lastMissingRef.current !== missingReason) {
        console.log('[useMyChannelsSync] Waiting for prerequisites', {
          missing: missingReason,
          userId,
          username,
          cacheLoaded: !!cache,
          channelsRegistryLoaded: !!channelsRegistry,
          myChannelIdsLoaded: !!myChannelIds,
        })
        lastMissingRef.current = missingReason
      }
      return
    }

    lastMissingRef.current = null

    const now = Date.now()
    const isStale = now - lastFetch > STALENESS_MS

    if (!isStale) {
      console.log('[useMyChannelsSync] Skipping: cache fresh', {
        ageMs: now - lastFetch,
        lastFetch,
      })
      return
    }
    if (inflightRef.current) return

    console.log('[useMyChannelsSync] Fetching my channels...', {
      userId,
      username,
      lastFetch,
      ageMs: now - lastFetch,
    })
    inflightRef.current = true

    fetchArenaUserChannels(userId, username, 1, 50)
      .then((channels) => {
        // Re-check guards (component may have unmounted or data changed)
        if (!cache.$isLoaded || !channelsRegistry.$isLoaded || !myChannelIds.$isLoaded) return

        const slugs: string[] = []
        const hasChannels = channels.length > 0
        if (!hasChannels) {
          console.warn('[useMyChannelsSync] No channels returned; keeping existing myChannelIds', { userId, username })
        }

        // Upsert each channel into the shared registry
        for (const ch of channels) {
          const slug = ch.slug
          slugs.push(slug)

          // Check if channel already exists
          const existing = channelsRegistry[slug]

          if (existing?.$isLoaded) {
            // Update existing channel's lightweight metadata
            // (full block data remains intact if already loaded)
            if (ch.title) existing.$jazz.set('title', ch.title)
            if (ch.length !== undefined) existing.$jazz.set('length', ch.length)
            if (ch.updatedAt) existing.$jazz.set('updatedAt', ch.updatedAt)
          } else {
            // Create new lightweight channel entry
            // (blocks list will be populated when portal loads this channel)
            const owner = cache.$jazz.owner
            const channel = ArenaChannel.create({
              slug: ch.slug,
              title: ch.title,
              length: ch.length,
              updatedAt: ch.updatedAt,
              blocks: co.list(ArenaBlock).create([], owner ? { owner } : undefined),
            }, owner ? { owner } : undefined)
            channelsRegistry.$jazz.set(slug, channel)
          }
        }

        // Replace myChannelIds with new ordered list (only when we have data)
        if (hasChannels) {
          myChannelIds.$jazz.splice(0, myChannelIds.length, ...slugs)
        }

        // Update timestamp
        cache.$jazz.set('myChannelsLastFetchedAt', Date.now())
        cache.$jazz.set('myChannelsError', undefined)
        console.log('[useMyChannelsSync] Updated', { count: slugs.length, slugs: slugs.slice(0, 5) })
      })
      .catch((err) => {
        if (!cache?.$isLoaded) return
        const errorMsg = err instanceof Error ? err.message : 'Failed to fetch channels'
        cache.$jazz.set('myChannelsError', errorMsg)
        console.warn('[useMyChannelsSync] Fetch failed', errorMsg)
      })
      .finally(() => {
        inflightRef.current = false
      })
  }, [cache, channelsRegistry, myChannelIds, userId, username, lastFetch])
}
