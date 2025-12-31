/**
 * Selector-filtered hook for channel "chrome" (title, author) used by AddressBar.
 * 
 * Re-renders ONLY when:
 * - Channel title changes
 * - Channel slug changes  
 * - Author id/fullName/avatarThumb changes
 * 
 * Does NOT re-render when:
 * - Block content changes
 * - Channel length/hasMore/lastFetchedAt changes
 * - Any other channel or block property changes
 */

import { useCoState } from 'jazz-tools/react'
import type { MaybeLoaded, Loaded } from 'jazz-tools'
import { ArenaChannel } from '../../jazz/schema'

export interface ChannelChrome {
  title: string | undefined
  slug: string
  author: {
    id: number
    fullName: string | undefined
    avatarThumb: string | undefined
  } | null
}

// Type for the resolved channel with author
type ResolvedChannel = Loaded<typeof ArenaChannel, { author: true }>

/**
 * Equality check for channel chrome data.
 * Only compares fields needed by AddressBar.
 */
function chromeEqual(
  a: ChannelChrome | undefined,
  b: ChannelChrome | undefined
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (a.title !== b.title) return false
  if (a.slug !== b.slug) return false

  // Compare author
  if (a.author === b.author) return true
  if (!a.author || !b.author) return false
  if (a.author.id !== b.author.id) return false
  if (a.author.fullName !== b.author.fullName) return false
  if (a.author.avatarThumb !== b.author.avatarThumb) return false

  return true
}

/**
 * Subscribe to channel metadata needed for the AddressBar display.
 * 
 * @param channelId - Jazz CoValue ID of the ArenaChannel
 * @returns Stable ChannelChrome object that only changes when display data changes
 */
export function useChannelChrome(
  channelId: string | undefined
): ChannelChrome | undefined {
  return useCoState(
    ArenaChannel,
    channelId,
    {
      resolve: { author: true },
      select: (channel: MaybeLoaded<ResolvedChannel>): ChannelChrome | undefined => {
        if (!channel?.$isLoaded) return undefined
        
        const author = channel.author?.$isLoaded
          ? {
              id: channel.author.id,
              fullName: channel.author.fullName,
              avatarThumb: channel.author.avatarThumb,
            }
          : null
        
        return {
          title: channel.title,
          slug: channel.slug,
          author
        }
      },
      equalityFn: chromeEqual
    }
  )
}

