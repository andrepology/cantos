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
import type { ConnectionItem } from '../ConnectionsPanel'

export interface AuthorMetadata {
  id: number
  username?: string
  fullName?: string
  avatarThumb?: string
  bio?: string
  followerCount?: number
  followingCount?: number
  channelCount?: number
  channels: ConnectionItem[]
  loading: boolean
  error?: string
}

/**
 * Hook to get author metadata from the global authors registry.
 * O(1) lookup via cache.authors[userId] - creates author if missing, triggers sync.
 * 
 * @param userId - Arena user ID (numeric)
 */
export function useAuthorMetadata(
  userId: number | undefined
): AuthorMetadata | null | undefined {
  // Track sync state to force re-renders
  const [syncing, setSyncing] = useState(false)
  const syncStartedForUserRef = useRef<number | null>(null)
  const mountedRef = useRef(true)

  // STEP 1: Get cache ID from account root
  const me = useAccount(Account, {
    resolve: { root: { arenaCache: true } },
  })
  
  const cacheId = useMemo(() => {
    if (!me.$isLoaded) return undefined
    return me.root?.arenaCache?.$jazz.id
  }, [me])

  // STEP 2: Subscribe to cache with authors registry
  const cache = useCoState(ArenaCache, cacheId, { resolve: { authors: true } })

  // STEP 3: O(1) author lookup by user ID from co.record
  const authorJazzId = useMemo(() => {
    if (!userId) return undefined
    if (cache === undefined || cache === null) return undefined
    if (!cache.$isLoaded) return undefined
    const authors = cache.authors
    if (!authors || !authors.$isLoaded) return undefined
    
    const authorRef = authors[String(userId)]
    if (!authorRef) return undefined
    return authorRef.$jazz.id
  }, [cache, userId])

  // STEP 4: Create author in cache AND trigger sync (combined effect)
  // This ensures we don't wait for subscription to start syncing
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!userId) return
    if (cache === undefined || cache === null) return
    if (!cache.$isLoaded) return
    
    const authors = cache.authors
    if (!authors || !authors.$isLoaded) return
    
    // Check if we've already started sync for this user
    if (syncStartedForUserRef.current === userId) return
    
    // Check if author exists
    let authorRef = authors[String(userId)]
    
    // Create author if it doesn't exist
    if (!authorRef) {
      console.log(`[useAuthorMetadata] Creating author placeholder for user ${userId}`)
      const owner = cache.$jazz.owner
      const created = ArenaAuthor.create(
        { id: userId },
        owner ? { owner } : undefined
      )
      authors.$jazz.set(String(userId), created)
      authorRef = created
    }
    
    // Check if sync is needed (author exists but lastFetchedAt is undefined)
    // We check the cache directly, not the subscription, to avoid race conditions
    const isLoaded = authorRef && '$isLoaded' in authorRef && authorRef.$isLoaded
    const needsSync = !isLoaded || !(authorRef as LoadedArenaAuthor).lastFetchedAt
    
    if (needsSync) {
      console.log(`[useAuthorMetadata] Starting sync for user ${userId}`)
      syncStartedForUserRef.current = userId
      setSyncing(true)
      
      syncAuthor(cache as LoadedArenaCache, userId)
        .then(() => {
          console.log(`[useAuthorMetadata] Sync complete for user ${userId}`)
        })
        .catch((err) => {
          console.error(`[useAuthorMetadata] Sync error for user ${userId}:`, err)
        })
        .finally(() => {
          if (mountedRef.current) {
            setSyncing(false)
          }
        })
    } else {
      // Author exists and has been synced - mark as started
      syncStartedForUserRef.current = userId
    }
  }, [cache, userId])

  // Reset sync state when userId changes
  useEffect(() => {
    syncStartedForUserRef.current = null
  }, [userId])

  // STEP 5: Subscribe to the author with channels resolved
  const author = useCoState(ArenaAuthor, authorJazzId, {
    resolve: { channels: { $each: true } },
  })

  // STEP 7: Transform to stable metadata object
  return useMemo((): AuthorMetadata | null | undefined => {
    if (!userId) return undefined
    if (author === undefined) return undefined
    if (author === null) return null
    if (!author.$isLoaded) return undefined

    const loadedAuthor = author as LoadedArenaAuthor

    // Safely extract channels - they may not be loaded yet
    const channelsList = loadedAuthor.channels
    const channels: ConnectionItem[] = (channelsList && '$isLoaded' in channelsList && channelsList.$isLoaded)
      ? [...channelsList]
          .filter((c): c is NonNullable<typeof c> & { $isLoaded: true } => !!c && '$isLoaded' in c && c.$isLoaded)
          .map((c) => ({
            id: c.id,
            slug: c.slug,
            title: c.title,
            length: c.length,
          }))
      : []

    return {
      id: loadedAuthor.id,
      username: loadedAuthor.username,
      fullName: loadedAuthor.fullName,
      avatarThumb: loadedAuthor.avatarThumb,
      bio: loadedAuthor.bio,
      followerCount: loadedAuthor.followerCount,
      followingCount: loadedAuthor.followingCount,
      channelCount: loadedAuthor.channelCount,
      channels,
      loading: loadedAuthor.lastFetchedAt === undefined,
      error: loadedAuthor.error,
    }
  }, [author, userId])
}
