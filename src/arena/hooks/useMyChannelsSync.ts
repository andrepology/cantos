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

const STALENESS_MS =  2 * 60 * 60 * 1000 // 2 hours
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

  useEffect(() => {
    if (!me?.$isLoaded) return
    if (!me.root?.arenaCache) return

    const userId = me.root.arena?.userId
    const username = me.root.arena?.slug
    
    if (!userId) return

    const cache = me.root.arenaCache
    const lastFetch = cache.myChannelsLastFetchedAt ?? 0
    const now = Date.now()
    const isStale = now - lastFetch > STALENESS_MS

    if (!isStale) return
    if (inflightRef.current) return

    inflightRef.current = true

    fetchArenaUserChannels(userId, username, 1, 50)
      .then((channels) => {
        if (!me.$isLoaded || !me.root?.arenaCache) return

        const cache = me.root.arenaCache
        const channelsRegistry = cache.channels
        const slugs: string[] = []

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
            // Note: API returns 'status', not 'published' - skip for now
          } else {
            // Create new lightweight channel entry
            // (blocks list will be populated when portal loads this channel)
            const channel = ArenaChannel.create({
              slug: ch.slug,
              title: ch.title,
              length: ch.length,
              updatedAt: ch.updatedAt,
              blocks: co.list(ArenaBlock).create([], { owner: cache.$jazz.owner }),
            }, cache.$jazz.owner)
            channelsRegistry.$jazz.set(slug, channel)
          }
        }

        // Replace myChannelIds with new ordered list
        cache.myChannelIds.$jazz.splice(0, cache.myChannelIds.length, ...slugs)

        // Update timestamp
        cache.$jazz.set('myChannelsLastFetchedAt', Date.now())
        cache.$jazz.set('myChannelsError', undefined)
      })
      .catch((err) => {
        if (!me.$isLoaded || !me.root?.arenaCache) return
        const errorMsg = err instanceof Error ? err.message : 'Failed to fetch channels'
        me.root.arenaCache.$jazz.set('myChannelsError', errorMsg)
      })
      .finally(() => {
        inflightRef.current = false
      })
  }, [me])
}

