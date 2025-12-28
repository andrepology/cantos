/**
 * Hook for retrieving author/user metadata from the Jazz cache.
 * 
 * Jazz pattern (mirrors useArenaChannelStream):
 * 1. Subscribe to cache to get author ID (O(1) lookup via co.record)
 * 2. Create author in cache if missing AND trigger sync (combined effect)
 * 3. Subscribe to author CoValue for reactive updates
 */

import { useMemo, useEffect, useRef, useState } from 'react'
import { useAccount, useCoState } from 'jazz-tools/react'
import {
  Account,
  ArenaAuthor,
  ArenaCache,
  type LoadedArenaAuthor,
  type LoadedArenaCache,
} from '../../jazz/schema'
import { syncAuthor } from '../authorSync'
import { shouldSyncConnections } from '../utils/syncConnectionList'
import type { ConnectionItem } from '../ConnectionsPanel'

export interface AuthorMetadata {
  id: number
  username?: string
  fullName?: string
  avatarThumb?: string
  avatarDisplay?: string
  bio?: string
  followerCount?: number
  followingCount?: number
  channelCount?: number
  channels: ConnectionItem[]
  channelsHasMore?: boolean
  channelsLoading?: boolean
  loading: boolean
  error?: string
}

const MAX_AGE_MS = 60 * 60 * 1000

/**
 * Hook to get author metadata from the global authors registry.
 * O(1) lookup via cache.authors[userId] - creates author if missing, triggers sync.
 * 
 * @param userId - Arena user ID (numeric)
 */
export function useAuthorMetadata(
  userId: number | undefined
): AuthorMetadata | null | undefined {
  const [syncing, setSyncing] = useState(false)
  const syncInFlightForUserRef = useRef<number | null>(null)

  // STEP 1: Get cache ID from account root
  const me = useAccount(Account, {
    resolve: { root: { arenaCache: true } },
  })
  
  const cacheId = me && me.$isLoaded ? me.root?.arenaCache?.$jazz.id : undefined

  // STEP 2: Subscribe to cache with authors registry
  const cache = useCoState(ArenaCache, cacheId, { resolve: { authors: true } })

  // STEP 3: O(1) author lookup by user ID from co.record
  const authorRef =
    userId !== undefined && cache && cache.$isLoaded && cache.authors?.$isLoaded
      ? cache.authors[String(userId)]
      : undefined
  const authorJazzId = authorRef?.$jazz.id

  // STEP 4: Create author in cache AND trigger sync (combined effect)
  // This ensures we don't wait for subscription to start syncing
  useEffect(() => {
    let cancelled = false
    if (userId === undefined) return
    if (!cache || !cache.$isLoaded) return
    
    const authors = cache.authors
    if (!authors || !authors.$isLoaded) return

    // Check if author exists
    let authorEntry = authors[String(userId)]

    // Create author if it doesn't exist
    if (!authorEntry) {
      const owner = cache.$jazz.owner
      const createdAuthor = ArenaAuthor.create(
        { id: userId },
        owner ? { owner } : undefined
      )
      authors.$jazz.set(String(userId), createdAuthor)
      authorEntry = createdAuthor
    }
    
    if (!authorEntry || !authorEntry.$isLoaded) return
    const loadedAuthor: LoadedArenaAuthor = authorEntry
    const needsProfileSync = shouldSyncConnections(loadedAuthor.lastFetchedAt, MAX_AGE_MS, false)
    const needsChannelSync =
      loadedAuthor.channelsHasMore === true ||
      shouldSyncConnections(loadedAuthor.channelsLastFetchedAt, MAX_AGE_MS, false)
    const needsSync = needsProfileSync || needsChannelSync

    if (syncInFlightForUserRef.current === userId && syncing) return
    
    if (needsSync) {
      syncInFlightForUserRef.current = userId
      const loadedCache: LoadedArenaCache = cache
      setSyncing(true)
      void syncAuthor(loadedCache, userId)
        .catch((err) => {
          console.error(`[useAuthorMetadata] Sync error for user ${userId}:`, err)
        })
        .finally(() => {
          if (cancelled) return
          syncInFlightForUserRef.current = null
          setSyncing(false)
        })
    } else {
      syncInFlightForUserRef.current = null
    }
    return () => {
      cancelled = true
    }
  }, [cache, syncing, userId])

  // Reset sync state when userId changes
  useEffect(() => {
    syncInFlightForUserRef.current = null
  }, [userId])

  // STEP 5: Subscribe to the author with channels resolved
  const author = useCoState(ArenaAuthor, authorJazzId, {
    resolve: { channels: { $each: true } },
  })

  // STEP 7: Transform to stable metadata object
  return useMemo((): AuthorMetadata | null | undefined => {
    if (userId === undefined) return undefined
    if (author === undefined) return undefined
    if (author === null) return null
    if (!author.$isLoaded) return undefined

    const loadedAuthor: LoadedArenaAuthor = author

    // Safely extract channels - they may not be loaded yet
    const channelsList = loadedAuthor.channels
    const channels: ConnectionItem[] = channelsList?.$isLoaded
      ? [...channelsList]
          .filter((c): c is NonNullable<typeof c> & { $isLoaded: true } => Boolean(c && c.$isLoaded))
          .map((c) => ({
            id: c.id,
            slug: c.slug,
            title: c.title,
            length: c.length,
          }))
      : []

    const channelsLoading =
      loadedAuthor.channelsError === undefined &&
      (loadedAuthor.channelsHasMore === true ||
        (loadedAuthor.channelsLastFetchedAt === undefined && (loadedAuthor.channelCount ?? 0) > 0))

    return {
      id: loadedAuthor.id,
      username: loadedAuthor.username,
      fullName: loadedAuthor.fullName,
      avatarThumb: loadedAuthor.avatarThumb,
      avatarDisplay: loadedAuthor.avatarDisplay,
      bio: loadedAuthor.bio,
      followerCount: loadedAuthor.followerCount,
      followingCount: loadedAuthor.followingCount,
      channelCount: loadedAuthor.channelCount,
      channels,
      channelsHasMore: loadedAuthor.channelsHasMore,
      channelsLoading,
      loading: loadedAuthor.lastFetchedAt === undefined,
      error: loadedAuthor.error,
    }
  }, [author, userId])
}
