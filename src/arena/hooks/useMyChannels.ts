import { useAccount } from 'jazz-tools/react'
import type { MaybeLoaded, Loaded } from 'jazz-tools'
import { Account, ArenaCache } from '../../jazz/schema'

/**
 * Read-only subscription hook for accessing the authenticated user's channels.
 *
 * Uses Jazz selector pattern for optimal re-render performance:
 * - Only re-renders when channel list actually changes
 * - Does NOT re-render when unrelated cache data changes
 *
 * Usage:
 * ```tsx
 * const { channels, loading, error } = useMyChannels()
 * const filtered = fuzzySearchChannels(channels, query)
 * ```
 */

export type MyChannelItem = {
  id: number
  slug: string
  title: string
  length?: number
  updatedAt?: string
  author?: {
    id: number
    username?: string
    fullName?: string
  }
}

export type MyChannelsResult = {
  channels: MyChannelItem[]
  loading: boolean
  error: string | null
}

// Type for the resolved cache structure
type ResolvedCache = Loaded<typeof ArenaCache, { myChannelIds: true; channels: { $each: { author: true } } }>

/**
 * Selector: extracts channel list from cache.
 * Returns a stable shape that only changes when channel data changes.
 */
function selectMyChannels(me: MaybeLoaded<Loaded<typeof Account, { root: { arenaCache: { myChannelIds: true; channels: { $each: { author: true } } } } }>>): MyChannelsResult {
  if (!me?.$isLoaded) {
    return { channels: [], loading: true, error: null }
  }

  const cache = me.root?.arenaCache as ResolvedCache | undefined
  if (!cache?.$isLoaded) {
    return { channels: [], loading: true, error: null }
  }

  if (!cache.myChannelIds?.$isLoaded) {
    return { channels: [], loading: true, error: null }
  }

  const error = cache.myChannelsError ?? null
  const channelsRegistry = cache.channels
  const channels: MyChannelItem[] = []

  // Use .values() iterator for CoList (Jazz playbook)
  for (const slug of cache.myChannelIds.values()) {
    const ch = channelsRegistry?.[slug]
    if (ch?.$isLoaded) {
      channels.push({
        id: Number(ch.channelId || 0),
        slug: ch.slug,
        title: ch.title ?? ch.slug,
        length: ch.length,
        updatedAt: ch.updatedAt,
        author: ch.author?.$isLoaded ? {
          id: ch.author.id,
          username: ch.author.username,
          fullName: ch.author.fullName,
        } : undefined
      })
    }
  }

  return { channels, loading: false, error }
}

/**
 * Equality check: prevents re-renders unless channel data actually changed.
 */
function myChannelsEqual(a: MyChannelsResult, b: MyChannelsResult): boolean {
  if (a === b) return true
  if (a.loading !== b.loading) return false
  if (a.error !== b.error) return false
  if (a.channels.length !== b.channels.length) return false

  for (let i = 0; i < a.channels.length; i++) {
    const chA = a.channels[i]
    const chB = b.channels[i]
    if (chA.id !== chB.id) return false
    if (chA.slug !== chB.slug) return false
    if (chA.title !== chB.title) return false
    if (chA.length !== chB.length) return false
    if (chA.updatedAt !== chB.updatedAt) return false
    // Compare author
    if (chA.author?.id !== chB.author?.id) return false
    if (chA.author?.username !== chB.author?.username) return false
    if (chA.author?.fullName !== chB.author?.fullName) return false
  }

  return true
}

export function useMyChannels(): MyChannelsResult {
  return useAccount(Account, {
    resolve: {
      root: {
        arenaCache: {
          myChannelIds: true,
          channels: { $each: { author: true } },
        }
      }
    },
    select: selectMyChannels,
    equalityFn: myChannelsEqual,
  }) ?? { channels: [], loading: true, error: null }
}
