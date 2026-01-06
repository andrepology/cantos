// =============================================================================
// ARENA API CLIENT
// =============================================================================

import type {
  ArenaBlock,
  ArenaBlockConnection,
  ArenaBlockDetails,
  ArenaChannelResponse,
  ArenaUser,
  Card,
  ChannelData,
  ChannelSearchResult,
  ConnectedChannel,
  FeedItem,
  FeedResponse,
  SearchResult,
  UserChannelListItem,
} from './types'
import { arenaFetch } from './http'
import { getAuthHeaders, httpError } from './arenaClient'
import { blockToCard } from './blockToCard'

// Caches grouped by domain
const channelCache = new Map<string, ChannelData>()
const blockDetailsCache = new Map<number, ArenaBlockDetails>()
const userChannelsCache = new Map<string, UserChannelListItem[]>()
const connectedChannelsCache = new Map<string | number, ConnectedChannel[]>()
const connectedChannelsListeners = new Set<() => void>()

// Channel data (fetch + cache) - uses v3 API for image dimensions
export async function fetchArenaChannel(slug: string, per: number = 50): Promise<ChannelData> {
  if (channelCache.has(slug)) return channelCache.get(slug)!

  const headers = getAuthHeaders()

  // v3: Fetch channel metadata
  const channelUrl = `https://api.are.na/v3/channels/${encodeURIComponent(slug)}`
  const channelRes = await arenaFetch(channelUrl, { headers, mode: 'cors' })
  if (!channelRes.ok) {
    if (channelRes.status === 401) {
      throw new Error(
        `Are.na fetch failed (401 Unauthorized). Please log in to Arena to access private channels. URL: ${channelUrl}`
      )
    }
    throw httpError(channelRes, channelUrl)
  }
  const channelJson = (await channelRes.json()) as any
  const channelId = channelJson.id
  const channelTitle = channelJson.title
  // v3 uses 'owner' instead of 'user', and owner can be User or Group
  const ownerData = channelJson.owner
  const author = ownerData ? toUser({
    id: ownerData.id,
    username: ownerData.slug ?? ownerData.username,
    full_name: ownerData.name ?? ownerData.full_name,
    name: ownerData.name,
    slug: ownerData.slug,
    avatar: ownerData.avatar,
  }) : undefined
  const createdAt = channelJson.created_at
  const updatedAt = channelJson.updated_at

  // v3: Fetch contents with pagination
  const collected: ArenaBlock[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const contentsUrl = `https://api.are.na/v3/channels/${encodeURIComponent(slug)}/contents?page=${page}&per=${per}&sort=position_desc`
    const res = await arenaFetch(contentsUrl, { headers, mode: 'cors' })
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error(
          `Are.na fetch failed (401 Unauthorized). Please log in to Arena to access private channels. URL: ${contentsUrl}`
        )
      }
      throw httpError(res, contentsUrl)
    }
    // v3 response: { data: Block[], meta: { has_more_pages, ... } }
    const json = (await res.json()) as { data: any[]; meta: { has_more_pages: boolean } }
    const blocks = json.data ?? []

    // Transform v3 blocks to ArenaBlock format for blockToCard compatibility
    for (const b of blocks) {
      collected.push({
        blockId: String(b.id),
        id: b.id,
        class: b.type === 'Embed' ? 'Media' : b.type,  // Map v3 type to v2 class for compatibility
        type: b.type,                                   // Also store v3 type
        title: b.title,
        created_at: b.created_at,
        updated_at: b.updated_at,
        user: b.user,
        image: b.image,
        source: b.source,
        embed: b.embed,
        attachment: b.attachment,
        content: b.content?.html ?? b.content?.markdown,
        content_html: b.content?.html,
        description: b.description?.plain,
        description_html: b.description?.html,
        // Channel-specific fields
        length: b.counts?.contents,
        ...(b.slug ? { slug: b.slug } : {}),
      } as ArenaBlock)
    }

    page++
    hasMore = json.meta?.has_more_pages ?? false
  }

  const cards = collected.map(blockToCard)
  const data: ChannelData = { id: channelId, cards, author, title: channelTitle, createdAt, updatedAt }
  channelCache.set(slug, data)
  return data
}

export function invalidateArenaChannel(slug: string): void {
  try {
    channelCache.delete(slug)
  } catch {}
}

// Connected channels (cache + listeners)
export function invalidateConnectedChannels(): void {
  connectedChannelsCache.clear()
  connectedChannelsListeners.forEach(listener => listener())
}

export function subscribeToConnectedChannelsInvalidation(listener: () => void): () => void {
  connectedChannelsListeners.add(listener)
  return () => {
    connectedChannelsListeners.delete(listener)
  }
}

// Channel connections - uses v3 API
export async function fetchConnectedChannels(channelIdOrSlug: number | string): Promise<ConnectedChannel[]> {
  const key = channelIdOrSlug
  if (connectedChannelsCache.has(key)) return connectedChannelsCache.get(key)!

  const headers = getAuthHeaders()
  const list: ConnectedChannel[] = []
  let page = 1
  let hasMore = true

  // v3 accepts both slug and id directly
  const idOrSlug = encodeURIComponent(String(channelIdOrSlug))

  while (hasMore) {
    const url = `https://api.are.na/v3/channels/${idOrSlug}/connections?page=${page}&per=50`
    const res = await arenaFetch(url, { headers, mode: 'cors' })
    if (!res.ok) {
      // If v3 fails, break gracefully
      break
    }

    // v3 response: { data: Channel[], meta: { has_more_pages, ... } }
    const json = (await res.json()) as { data: any[]; meta: { has_more_pages: boolean } }
    const channels = json.data ?? []

    for (const c of channels) {
      // v3 uses 'owner' instead of 'user'
      const owner = c.owner
      list.push({
        id: c.id,
        title: c.title ?? '',
        slug: c.slug ?? String(c.id),
        author: owner
          ? {
              id: owner.id,
              username: owner.slug ?? owner.username,
              full_name: owner.name ?? owner.full_name,
              avatar: typeof owner.avatar === 'string' ? owner.avatar : null,
            }
          : undefined,
        updatedAt: c.updated_at ?? undefined,
        length: c.counts?.contents ?? undefined,
        connectionId: c.connection_id ?? undefined,
      })
    }

    page++
    hasMore = json.meta?.has_more_pages ?? false
  }

  connectedChannelsCache.set(key, list)
  return list
}

// Block details + connections (cached) - uses v3 API
export async function fetchArenaBlockDetails(blockId: number): Promise<ArenaBlockDetails> {
  if (blockDetailsCache.has(blockId)) return blockDetailsCache.get(blockId)!

  const headers = getAuthHeaders()

  // v3: Fetch block details
  const blockUrl = `https://api.are.na/v3/blocks/${encodeURIComponent(String(blockId))}`
  const blockRes = await arenaFetch(blockUrl, { headers, mode: 'cors' })
  if (!blockRes.ok) {
    throw httpError(blockRes, blockUrl, 'Are.na block fetch failed')
  }
  const b = (await blockRes.json()) as any

  // v3 uses 'type' instead of 'class', and structured content
  const detailsBase: Omit<ArenaBlockDetails, 'connections'> = {
    id: b.id,
    title: b.title ?? undefined,
    class: b.type ?? b.class ?? undefined,  // v3 uses type
    descriptionHtml: b.description?.html ?? b.description_html ?? null,
    contentHtml: b.content?.html ?? b.content_html ?? null,
    createdAt: b.created_at ?? undefined,
    updatedAt: b.updated_at ?? undefined,
    user: b.user
      ? {
          id: b.user.id,
          username: b.user.slug ?? b.user.username,
          full_name: b.user.name ?? b.user.full_name,
          avatar: typeof b.user.avatar === 'string' ? b.user.avatar : b.user?.avatar?.thumb ?? null,
        }
      : undefined,
  }

  // v3: Fetch block connections
  const connUrl = `https://api.are.na/v3/blocks/${encodeURIComponent(String(blockId))}/connections`
  const connRes = await arenaFetch(connUrl, { headers, mode: 'cors' })
  if (!connRes.ok) {
    throw httpError(connRes, connUrl, 'Are.na block connections failed')
  }

  // v3 response: { data: Channel[], meta: { has_more_pages, ... } }
  const connJson = (await connRes.json()) as { data: any[]; meta: { has_more_pages: boolean } }
  const list = connJson.data ?? []
  const connections: ArenaBlockConnection[] = list.map((c: any) => {
    // v3 uses 'owner' instead of 'user'
    const owner = c.owner
    return {
      id: c.id,
      title: c.title ?? '',
      slug: c.slug ?? String(c.id),
      author: owner
        ? {
            id: owner.id,
            username: owner.slug ?? owner.username,
            full_name: owner.name ?? owner.full_name,
            avatar: typeof owner.avatar === 'string' ? owner.avatar : null,
          }
        : undefined,
      updatedAt: c.updated_at ?? undefined,
      length: c.counts?.contents ?? undefined,
    }
  })

  const hasMoreConnections = connJson.meta?.has_more_pages ?? false

  const details: ArenaBlockDetails = { ...detailsBase, connections, hasMoreConnections }
  blockDetailsCache.set(blockId, details)
  return details
}

// Search: channels-only
export async function searchArenaChannels(
  query: string,
  page: number = 1,
  per: number = 20
): Promise<ChannelSearchResult[]> {
  const q = query.trim()
  if (!q) return []
  const url = `https://api.are.na/v2/search/channels?q=${encodeURIComponent(q)}&page=${page}&per=${per}`
  const res = await arenaFetch(url, { headers: getAuthHeaders(), mode: 'cors' })
  if (!res.ok) {
    throw new Error(`Are.na search failed: ${res.status} ${res.statusText}`)
  }
  const json = (await res.json()) as any

  const channels = Array.isArray(json?.channels) ? json.channels : []
  return channels.map((c: any) => ({
    id: c.id,
    title: c.title,
    slug: c.slug,
    author: c.user ? toUser(c.user) : undefined,
    description: c.description,
    length: c.length,
    updatedAt: c.updated_at,
  }))
}

// Mixed search: channels + users (Parallel Fetch + Interleave)
export async function searchArena(
  query: string,
  options?: { page?: number; per?: number; signal?: AbortSignal }
): Promise<SearchResult[]> {
  const { page = 1, per = 20, signal } = options ?? {}
  const q = query.trim()
  if (!q) return []

  const channelsUrl = `https://api.are.na/v2/search/channels?q=${encodeURIComponent(q)}&page=${page}&per=${per}`
  const usersUrl = `https://api.are.na/v2/search/users?q=${encodeURIComponent(q)}&page=${page}&per=${per}`

  const headers = getAuthHeaders()
  const fetchOpts = {
    headers,
    mode: 'cors' as const,
    immediate: true, // bypass rate limiting for interactive search
    signal,
  }

  // Run both searches in parallel
  const [channelsRes, usersRes] = await Promise.allSettled([
    arenaFetch(channelsUrl, fetchOpts),
    arenaFetch(usersUrl, fetchOpts)
  ])

  // Process Channels
  let channelResults: SearchResult[] = []
  if (channelsRes.status === 'fulfilled' && channelsRes.value.ok) {
    const json = await channelsRes.value.json() as any
    const list = Array.isArray(json?.channels) ? json.channels : []
    channelResults = list.map((c: any) => ({
      kind: 'channel',
      id: c.id,
      title: c.title,
      slug: c.slug,
      author: c.user ? toUser(c.user) : undefined,
      description: c.description,
      length: c.length,
      updatedAt: c.updated_at,
    }))
  }

  // Process Users
  let userResults: SearchResult[] = []
  if (usersRes.status === 'fulfilled' && usersRes.value.ok) {
    const json = await usersRes.value.json() as any
    const list = Array.isArray(json?.users) ? json.users : []
    userResults = list.map((u: any) => ({
      kind: 'user',
      id: u.id,
      username: u.username,
      full_name: u.full_name,
      avatar: u?.avatar?.thumb ?? u?.avatar_image?.thumb ?? null,
    }))
  }

  // Check if both failed
  if (channelsRes.status === 'rejected' && usersRes.status === 'rejected') {
     throw new Error(`Are.na search failed`)
  }

  // Interleave results (Bias: 2 channels for every 1 user)
  const interleaved: SearchResult[] = []
  let cIdx = 0
  let uIdx = 0
  
  while (cIdx < channelResults.length || uIdx < userResults.length) {
    // Add up to 2 channels
    if (cIdx < channelResults.length) interleaved.push(channelResults[cIdx++])
    if (cIdx < channelResults.length) interleaved.push(channelResults[cIdx++])
    
    // Add 1 user
    if (uIdx < userResults.length) interleaved.push(userResults[uIdx++])
  }

  // Deduplicate by ID just in case (though unlikely across kinds)
  const map = new Map<string, SearchResult>()
  for (const r of interleaved) {
    map.set(`${r.kind}-${r.id}`, r)
  }
  return Array.from(map.values())
}

// User data - uses v3 API
export async function fetchArenaUser(userId: number): Promise<ArenaUser> {
  const url = `https://api.are.na/v3/users/${encodeURIComponent(String(userId))}`
  const res = await arenaFetch(url, { headers: getAuthHeaders(), mode: 'cors' })
  if (!res.ok) {
    throw new Error(`Are.na user fetch failed: ${res.status} ${res.statusText}`)
  }
  const u = (await res.json()) as any
  // v3 uses 'name' and 'slug', and nested 'counts' object
  return {
    id: u.id,
    username: u.slug ?? u.username,
    full_name: u.name ?? u.full_name ?? u.username ?? '',
    name: u.name,
    slug: u.slug,
    avatar: typeof u.avatar === 'string' ? u.avatar : u.avatar?.thumb ?? null,
    channel_count: u.counts?.channels ?? u.channel_count ?? undefined,
    follower_count: u.counts?.followers ?? u.follower_count ?? undefined,
    following_count: u.counts?.following ?? u.following_count ?? undefined,
    counts: u.counts,
    initials: u.initials,
  }
}

// User channels - uses v3 API with type=Channel filter
export async function fetchArenaUserChannels(
  userId: number,
  _username: string | undefined,  // unused in v3
  page: number = 1,
  per: number = 50
): Promise<UserChannelListItem[]> {
  const key = `${userId}:${page}:${per}`
  if (userChannelsCache.has(key)) return userChannelsCache.get(key)!

  const headers = getAuthHeaders()

  // v3: Use /users/:id/contents with type=Channel filter
  const mapItem = (c: any): UserChannelListItem => {
    // v3 uses 'owner' instead of 'user'
    const owner = c.owner
    return {
      id: c.id,
      title: c.title ?? '',
      slug: c.slug ?? '',
      thumbUrl: undefined,  // v3 doesn't include thumbnails in list view
      updatedAt: c.updated_at ?? undefined,
      length: c.counts?.contents ?? undefined,
      status: c.visibility ?? undefined,
      open: undefined,  // Not available in v3 list
      author: owner
        ? {
            id: owner.id,
            username: owner.slug ?? owner.username,
            full_name: owner.name ?? owner.full_name,
            avatar: typeof owner.avatar === 'string' ? owner.avatar : null,
          }
        : undefined,
    }
  }

  const items: UserChannelListItem[] = []
  const MAX_PAGES = 12
  let p = 1
  let hasMore = true

  while (hasMore && p <= MAX_PAGES) {
    const url = `https://api.are.na/v3/users/${encodeURIComponent(String(userId))}/contents?type=Channel&page=${p}&per=${per}`
    const res = await arenaFetch(url, { headers, mode: 'cors' })
    if (!res.ok) {
      // If v3 fails, break gracefully
      break
    }

    // v3 response: { data: Channel[], meta: { has_more_pages, ... } }
    const json = (await res.json()) as { data: any[]; meta: { has_more_pages: boolean } }
    const channels = json.data ?? []

    const pageItems = channels.map(mapItem)
    items.push(...pageItems)

    p++
    hasMore = json.meta?.has_more_pages ?? false
  }

  // Deduplicate by slug
  const byKey = new Map<string, UserChannelListItem>()
  for (const it of items) byKey.set(it.slug, it)
  const deduped = Array.from(byKey.values())

  userChannelsCache.set(key, deduped)
  return deduped
}

// Feed
export const fetchArenaFeed = async (page: number = 1, per: number = 50): Promise<FeedResponse> => {
  const url = `https://api.are.na/v2/feed?page=${page}&per=${per}`
  const res = await arenaFetch(url, { headers: getAuthHeaders() })
  if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`)
  return await res.json()
}

// Connect/disconnect
export async function connectToChannel(
  targetChannelSlug: string,
  connectableType: 'Block' | 'Channel',
  connectableId: number
): Promise<{ connectionId: number; success: boolean }> {
  const headers = getAuthHeaders()
  if (!headers) throw new Error('Authentication required to connect to channel')

  const url = `https://api.are.na/v2/channels/${encodeURIComponent(targetChannelSlug)}/connections`
  const body = JSON.stringify({
    connectable_type: connectableType,
    connectable_id: connectableId,
  })

  console.log('[connectToChannel]', {
    targetChannelSlug,
    connectableType,
    connectableId,
    url,
    body,
  })

  const res = await arenaFetch(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body,
  })

  if (!res.ok) {
    if (res.status === 409) {
      return { connectionId: -1, success: true }
    }
    console.error('[connectToChannel] Failed:', res.status, await res.text().catch(() => ''))
    throw new Error(`Failed to connect to channel: ${res.status}`)
  }

  const data = await res.json()
  return {
    connectionId: data.connection_id ?? data.id ?? -1,
    success: true,
  }
}

export async function disconnectFromChannel(
  targetChannelSlug: string,
  connectionId: number
): Promise<{ success: boolean }> {
  const headers = getAuthHeaders()
  if (!headers) throw new Error('Authentication required to disconnect from channel')

  const url = `https://api.are.na/v2/channels/${encodeURIComponent(targetChannelSlug)}/connections/${connectionId}`

  const res = await arenaFetch(url, {
    method: 'DELETE',
    headers,
  })

  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to disconnect from channel: ${res.status}`)
  }

  return { success: true }
}

function toUser(u: any): ArenaUser | undefined {
  if (!u) return undefined
  return {
    id: u.id,
    username: u.username,
    full_name: u.full_name,
    avatar: u.avatar?.thumb ?? u.avatar_image?.thumb ?? null,
  }
}
