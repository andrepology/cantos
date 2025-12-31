import { useEffect, useMemo, useRef } from 'react'
import { useAccount } from 'jazz-tools/react'
import { Account } from '../../jazz/schema'

/**
 * Read-only subscription hook for accessing the authenticated user's channels.
 * 
 * Reads from ArenaCache.myChannelIds and maps to channels registry.
 * Returns an array suitable for fuzzy searching and display.
 * 
 * Note: Reads from the shared channels registry - same data source
 * that portals use, just filtered to the user's owned channels.
 * 
 * Usage:
 * ```tsx
 * const { channels, loading } = useMyChannels()
 * const filtered = fuzzySearchChannels(channels, query)
 * ```
 */

export type MyChannelItem = {
  id: number
  slug: string
  title: string
  length?: number
  updatedAt?: string
  status?: string
  open?: boolean
  author?: {
    id: number
    username?: string
    fullName?: string
  }
}

export function useMyChannels(): {
  channels: MyChannelItem[]
  loading: boolean
  error: string | null
} {
  const missingAuthorLoggedRef = useRef<Set<string>>(new Set())
  const me = useAccount(Account, {
    resolve: {
      root: {
        arenaCache: {
          myChannelIds: true,
          channels: {
            $each: { author: true }
          },
        }
      }
    }
  })

  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (!me?.$isLoaded) return
    const cache = me.root?.arenaCache
    if (!cache?.$isLoaded) return
    if (!cache.myChannelIds?.$isLoaded) return
    if (!cache.channels?.$isLoaded) return

    for (const slug of cache.myChannelIds.values()) {
      const ch = cache.channels[slug]
      if (!ch?.$isLoaded) continue
      if (ch.author?.$isLoaded) continue
      if (missingAuthorLoggedRef.current.has(slug)) continue
      missingAuthorLoggedRef.current.add(slug)
      // eslint-disable-next-line no-console
      console.debug('[useMyChannels] Missing channel author ref', { slug, channelId: ch.$jazz.id })
    }
  }, [me])

  const result = useMemo(() => {
    if (!me?.$isLoaded) {
      return { channels: [], loading: true, error: null }
    }

    const cache = me.root?.arenaCache
    if (!cache?.$isLoaded) {
      return { channels: [], loading: true, error: null }
    }

    const error = cache.myChannelsError ?? null
    const channelsRegistry = cache.channels
    const channels: MyChannelItem[] = []

    // Use .values() iterator for CoList (Jazz playbook line 354)
    for (const slug of cache.myChannelIds.values()) {
      const ch = channelsRegistry[slug]
      if (ch?.$isLoaded) {
        channels.push({
          id: Number(ch.channelId || 0), // Fallback if numeric ID not yet synced
          slug: ch.slug,
          title: ch.title ?? ch.slug,
          length: ch.length,
          updatedAt: ch.updatedAt,
          author: ch.author ? {
            id: ch.author.id,
            username: ch.author.username,
            fullName: ch.author.fullName,
          } : undefined
        })
      }
    }

    return { channels, loading: false, error }
  }, [me])

  return result
}
