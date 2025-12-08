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
import { getArenaAccessToken } from './token'

// Caches grouped by domain
const channelCache = new Map<string, ChannelData>()
const blockDetailsCache = new Map<number, ArenaBlockDetails>()
const userChannelsCache = new Map<string, UserChannelListItem[]>()
const connectedChannelsCache = new Map<string | number, ConnectedChannel[]>()
const connectedChannelsListeners = new Set<() => void>()

// Shared helpers
const getAuthHeaders = (): HeadersInit | undefined => {
  const token = getArenaAccessToken()
  try {
    // console.debug('[arena-api] getAuthHeaders: tokenPresent=', !!token)
  } catch {}
  return token ? { Authorization: `Bearer ${token}` } : undefined
}

const httpError = (res: Response, url: string, prefix = 'Are.na fetch failed'): Error => {
  const reason = `${res.status} ${res.statusText}`
  return new Error(`${prefix}: ${reason}. URL: ${url}`)
}

const toUser = (u: ArenaBlock['user']): ArenaUser | undefined =>
  u
    ? {
        id: u.id,
        username: u.username,
        full_name: u.full_name,
        avatar: u.avatar?.thumb ?? u.avatar_image?.thumb ?? null,
      }
    : undefined

const blockToCard = (b: ArenaBlock): Card => {
  const base = {
    id: b.id,
    title: b.title ?? '',
    createdAt: b.created_at,
    user: toUser(b.user),
  }

  if (b.attachment?.content_type?.startsWith('video/')) {
    return {
      ...base,
      type: 'media',
      embedHtml: '',
      thumbnailUrl: b.image?.display?.url,
      provider: b.source?.provider?.name,
      originalUrl: b.attachment.url,
    }
  }

  if (b.attachment?.content_type === 'application/pdf') {
    return {
      ...base,
      type: 'pdf',
      url: b.attachment.url!,
      thumbnailUrl: b.image?.display?.url,
      fileSize: (b as any).attachment?.file_size_display,
      contentType: 'application/pdf',
    }
  }

  switch (b.class) {
    case 'Image': {
      const originalFile = b.image?.original
        ? {
            url: b.image.original.url,
            fileSize: b.image.original.file_size,
            fileSizeDisplay: b.image.original.file_size_display,
          }
        : undefined
      return {
        ...base,
        type: 'image',
        url: b.image?.display?.url ?? '',
        alt: b.title ?? 'Image',
        originalDimensions: (b.image?.original as any)?.width ? (b.image?.original as any) : undefined,
        originalFile,
      }
    }
    case 'Text':
      return {
        ...base,
        type: 'text',
        content: b.content ?? b.title ?? 'Untitled',
      }
    case 'Link':
      return {
        ...base,
        type: 'link',
        url: b.source?.url ?? '',
        imageUrl: b.image?.display?.url,
        provider: b.source?.provider?.name,
      }
    case 'Media':
      return {
        ...base,
        type: 'media',
        embedHtml: b.embed?.html ?? '',
        thumbnailUrl: b.image?.display?.url,
        provider: b.source?.provider?.name,
        originalUrl: b.source?.url,
      }
    case 'Channel':
      return {
        ...base,
        type: 'channel',
        slug: (b as any).slug,
        length: (b as any).length ?? 0,
        updatedAt: (b as any).updated_at,
      } as any
    default:
      return { ...base, type: 'text', content: b.title ?? 'Untitled' }
  }
}

// Channel data (fetch + cache)
export async function fetchArenaChannel(slug: string, per: number = 50): Promise<ChannelData> {
  if (channelCache.has(slug)) return channelCache.get(slug)!

  const headers = getAuthHeaders()
  const channelUrl = `https://api.are.na/v2/channels/${encodeURIComponent(slug)}`
  const channelRes = await arenaFetch(channelUrl, { headers, mode: 'cors' })
  if (!channelRes.ok) {
    if (channelRes.status === 401) {
      throw new Error(
        `Are.na fetch failed (401 Unauthorized). Please log in to Arena to access private channels. URL: ${channelUrl}`
      )
    }
    throw httpError(channelRes, channelUrl)
  }
  const channelJson = (await channelRes.json()) as ArenaChannelResponse
  const channelId = channelJson.id
  const channelTitle = channelJson.title
  const author = channelJson.user ? toUser(channelJson.user) : undefined
  const createdAt = channelJson.created_at
  const updatedAt = channelJson.updated_at

  const collected: ArenaBlock[] = []
  let page = 1
  let contentsUrl = `https://api.are.na/v2/channels/${encodeURIComponent(slug)}/contents?page=${page}&per=${per}&sort=position&direction=desc`

  while (contentsUrl) {
    const res = await arenaFetch(contentsUrl, { headers, mode: 'cors' })
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error(
          `Are.na fetch failed (401 Unauthorized). Please log in to Arena to access private channels. URL: ${contentsUrl}`
        )
      }
      throw httpError(res, contentsUrl)
    }
    const json = (await res.json()) as ArenaChannelResponse
    collected.push(...(json.contents ?? []))
    page++
    const hasMore = json.contents && json.contents.length === per
    contentsUrl = hasMore
      ? `https://api.are.na/v2/channels/${encodeURIComponent(slug)}/contents?page=${page}&per=${per}&sort=position&direction=desc`
      : ''
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

export async function fetchConnectedChannels(channelIdOrSlug: number | string): Promise<ConnectedChannel[]> {
  const key = channelIdOrSlug
  if (connectedChannelsCache.has(key)) return connectedChannelsCache.get(key)!

  let id: number | null = null
  if (typeof channelIdOrSlug === 'number') {
    id = channelIdOrSlug
  } else {
    const url = `https://api.are.na/v2/channels/${encodeURIComponent(channelIdOrSlug)}`
    const res = await arenaFetch(url, { headers: getAuthHeaders(), mode: 'cors' })
    if (!res.ok) throw new Error(`Are.na channel fetch failed: ${res.status} ${res.statusText}`)
    const json = (await res.json()) as any
    id = json?.id ?? null
  }
  if (!id) return []

  const list: ConnectedChannel[] = []
  let url = `https://api.are.na/v2/channels/${encodeURIComponent(String(id))}/connections`
  const headers = getAuthHeaders()
  while (url) {
    const res = await arenaFetch(url, { headers, mode: 'cors' })
    if (!res.ok) {
      if (res.status === 404 && url.includes('/connections')) {
        url = `https://api.are.na/v2/channels/${encodeURIComponent(String(id))}/channels`
        continue
      }
      break
    }
    const json = (await res.json()) as any
    const arrBase = Array.isArray(json) ? json : (json?.connections ?? json?.channels ?? [])
    const arr = Array.isArray(arrBase) ? arrBase : []

    const coerceChannel = (item: any): any => item?.channel ?? item?.connected_channel ?? item?.connected_to ?? item

    for (const it of arr) {
      const c = coerceChannel(it)
      if (!c) continue
      const u = c.user
      list.push({
        id: c.id ?? it.id,
        title: c.title ?? it.title ?? '',
        slug: c.slug ?? String(c.id ?? it.id),
        author: u
          ? {
              id: u.id,
              username: u.username,
              full_name: u.full_name,
              avatar: u?.avatar?.thumb ?? u?.avatar_image?.thumb ?? null,
            }
          : undefined,
        updatedAt: c.updated_at ?? it.updated_at ?? undefined,
        length: typeof c.length === 'number' ? c.length : undefined,
        connectionId: it.connection_id ?? undefined, // Extract connection_id for disconnect support
      })
    }
    const next = json?.pagination?.next ?? json?.next ?? ''
    url = typeof next === 'string' ? next : ''
  }

  connectedChannelsCache.set(key, list)
  return list
}

// Block details + connections (cached)
export async function fetchArenaBlockDetails(blockId: number): Promise<ArenaBlockDetails> {
  if (blockDetailsCache.has(blockId)) return blockDetailsCache.get(blockId)!

  const headers = getAuthHeaders()
  const blockUrl = `https://api.are.na/v2/blocks/${encodeURIComponent(String(blockId))}`
  const blockRes = await arenaFetch(blockUrl, { headers, mode: 'cors' })
  if (!blockRes.ok) {
    throw httpError(blockRes, blockUrl, 'Are.na block fetch failed')
  }
  const b = (await blockRes.json()) as any

  const detailsBase: Omit<ArenaBlockDetails, 'connections'> = {
    id: b.id,
    title: b.title ?? undefined,
    class: b.class ?? undefined,
    descriptionHtml: b.description_html ?? null,
    contentHtml: b.content_html ?? null,
    createdAt: b.created_at ?? undefined,
    updatedAt: b.updated_at ?? undefined,
    user: b.user
      ? {
          id: b.user.id,
          username: b.user.username,
          full_name: b.user.full_name,
          avatar: b.user?.avatar?.thumb ?? b.user?.avatar_image?.thumb ?? null,
        }
      : undefined,
  }

  const connUrl = `https://api.are.na/v2/blocks/${encodeURIComponent(String(blockId))}/channels`
  const connRes = await arenaFetch(connUrl, { headers, mode: 'cors' })
  if (!connRes.ok) {
    throw httpError(connRes, connUrl, 'Are.na block channels failed')
  }
  const connJson = (await connRes.json()) as any
  const list = (connJson?.channels ?? connJson) as any[]
  const connections: ArenaBlockConnection[] = list.map((c: any) => ({
    id: c.id,
    title: c.title ?? '',
    slug: c.slug ?? String(c.id),
    author: c.user
      ? {
          id: c.user.id,
          username: c.user.username,
          full_name: c.user.full_name,
          avatar: c.user?.avatar_image?.thumb ?? c.user?.avatar ?? null,
        }
      : undefined,
    updatedAt: c.updated_at ?? undefined,
    length: typeof c.length === 'number' ? c.length : undefined,
  }))

  const hasMoreConnections =
    typeof connJson?.current_page === 'number' && typeof connJson?.total_pages === 'number'
      ? connJson.current_page < connJson.total_pages
      : false

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
  const url = `https://api.are.na/v2/search?q=${encodeURIComponent(q)}&page=${page}&per=${per}`
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

// Mixed search: channels + users
export async function searchArena(
  query: string,
  options?: { page?: number; per?: number; signal?: AbortSignal }
): Promise<SearchResult[]> {
  const { page = 1, per = 20, signal } = options ?? {}
  const q = query.trim()
  if (!q) return []

  const url = `https://api.are.na/v2/search?q=${encodeURIComponent(q)}&page=${page}&per=${per}`
  const res = await arenaFetch(url, {
    headers: getAuthHeaders(),
    mode: 'cors',
    immediate: true, // bypass rate limiting for interactive search
    signal,
  })
  if (!res.ok) {
    throw new Error(`Are.na search failed: ${res.status} ${res.statusText}`)
  }
  const json = (await res.json()) as any

  try {
    // eslint-disable-next-line no-console
    console.log('[arena] searchArena raw', {
      query: q,
      page,
      per,
      usersCount: Array.isArray(json?.users) ? json.users.length : 0,
      channelsCount: Array.isArray(json?.channels) ? json.channels.length : 0,
      blocksCount: Array.isArray(json?.blocks) ? json.blocks.length : 0,
    })
  } catch {}

  const usersArr = Array.isArray(json?.users) ? json.users : []
  const channelsArr = Array.isArray(json?.channels) ? json.channels : []

  const userResults: SearchResult[] = usersArr.map((u: any) => ({
    kind: 'user',
    id: u.id,
    username: u.username,
    full_name: u.full_name,
    avatar: u?.avatar?.thumb ?? u?.avatar_image?.thumb ?? null,
  }))

  const channelResults: SearchResult[] = channelsArr.map((c: any) => ({
    kind: 'channel',
    id: c.id,
    title: c.title,
    slug: c.slug,
    author: c.user
      ? {
          id: c.user.id,
          username: c.user.username,
          full_name: c.user.full_name,
          avatar: c.user?.avatar?.thumb ?? c.user?.avatar_image?.thumb ?? null,
        }
      : undefined,
    description: c.description,
    length: c.length,
    updatedAt: c.updated_at,
  }))

  const map = new Map<string, SearchResult>()
  for (const r of [...userResults, ...channelResults]) {
    map.set(`${r.kind}-${r.id}`, r)
  }
  return Array.from(map.values())
}

// User data + channels (cached)
export async function fetchArenaUser(userId: number): Promise<ArenaUser> {
  const url = `https://api.are.na/v2/users/${encodeURIComponent(String(userId))}`
  const res = await arenaFetch(url, { headers: getAuthHeaders(), mode: 'cors' })
  if (!res.ok) {
    throw new Error(`Are.na user fetch failed: ${res.status} ${res.statusText}`)
  }
  const u = (await res.json()) as any
  return {
    id: u.id,
    username: u.username,
    full_name: u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.full_name || u.username || '',
    avatar: u.avatar?.thumb ?? u.avatar_image?.thumb ?? null,
    channel_count: u.channel_count ?? (u.channels_count ?? undefined),
    follower_count: typeof u.follower_count === 'number' ? u.follower_count : undefined,
    following_count: typeof u.following_count === 'number' ? u.following_count : undefined,
  }
}

export async function fetchArenaUserChannels(
  userId: number,
  username: string | undefined,
  page: number = 1,
  per: number = 50
): Promise<UserChannelListItem[]> {
  const key = `${userId}:${page}:${per}`
  if (userChannelsCache.has(key)) return userChannelsCache.get(key)!

  const headers = getAuthHeaders()
  const hasToken = !!headers

  if (hasToken) {
    try {
      const mapItem = (c: any): UserChannelListItem => ({
        id: c.id,
        title: c.title ?? '',
        slug: c.slug ?? '',
        thumbUrl: c.thumb?.display?.url ?? c.image?.display?.url ?? c.open_graph_image_url ?? undefined,
        updatedAt: c.updated_at ?? undefined,
        length: typeof c.length === 'number' ? c.length : undefined,
        status: typeof c.status === 'string' ? c.status : typeof c.visibility === 'string' ? c.visibility : undefined,
        open: typeof c.open === 'boolean' ? c.open : typeof c.collaboration === 'boolean' ? c.collaboration : undefined,
        author: c.user
          ? {
              id: c.user.id,
              username: c.user.username,
              full_name: c.user.full_name,
              avatar: c.user?.avatar?.thumb ?? c.user?.avatar_image?.thumb ?? null,
            }
          : undefined,
      })

      const getList = (json: any): any[] => {
        if (Array.isArray(json)) return json
        if (Array.isArray(json?.channels)) return json.channels
        return []
      }

      const items: UserChannelListItem[] = []
      const MAX_PAGES = 12
      let p = 1
      let fetched = 0
      for (; p <= MAX_PAGES; p++) {
        const url = `https://api.are.na/v2/users/${encodeURIComponent(String(userId))}/channels?page=${p}&per=${per}`
        const res = await arenaFetch(url, { headers, mode: 'cors' })
        if (!res.ok) throw new Error(`users/:id/channels p${p} ${res.status}`)
        const json = await res.json()
        const list = getList(json)
        const pageItems = list.map(mapItem)
        items.push(...pageItems)
        fetched += pageItems.length
        if (pageItems.length < per) break
      }

      const byKey = new Map<string, UserChannelListItem>()
      for (const it of items) byKey.set(it.slug, it)
      const deduped = Array.from(byKey.values())
      userChannelsCache.set(key, deduped)
      return deduped
    } catch (e) {
      // users/:id/channels failed, falling back - no logging
    }
  }

  try {
    const name = username ?? (await fetchArenaUser(userId)).username
    if (!name) return []

    const firstUrl = `https://api.are.na/v2/search?q=${encodeURIComponent(name)}&page=1&per=${per}`
    const firstRes = await arenaFetch(firstUrl, { headers, mode: 'cors' })
    if (!firstRes.ok) throw new Error(`search p1 ${firstRes.status}`)
    const firstJson = (await firstRes.json()) as any

    const mapChannel = (c: any): UserChannelListItem | null => {
      if (!c) return null
      if (c.user?.id !== userId) return null
      return {
        id: c.id,
        title: c.title ?? '',
        slug: c.slug ?? '',
        thumbUrl: c.thumb?.display?.url ?? c.image?.display?.url ?? c.open_graph_image_url ?? undefined,
        updatedAt: c.updated_at ?? undefined,
        length: typeof c.length === 'number' ? c.length : undefined,
        status: typeof c.status === 'string' ? c.status : typeof c.visibility === 'string' ? c.visibility : undefined,
        open: typeof c.open === 'boolean' ? c.open : typeof c.collaboration === 'boolean' ? c.collaboration : undefined,
        author: c.user
          ? {
              id: c.user.id,
              username: c.user.username,
              full_name: c.user.full_name,
              avatar: c.user?.avatar?.thumb ?? c.user?.avatar_image?.thumb ?? null,
            }
          : undefined,
      }
    }

    const totalPages: number = Math.max(1, Number(firstJson?.total_pages ?? 1))
    const firstItems = ((firstJson?.channels as any[]) ?? []).map(mapChannel).filter(Boolean) as UserChannelListItem[]

    const MAX_PAGES = 8
    const pagesToFetch = Math.min(totalPages, MAX_PAGES)
    const promises: Promise<UserChannelListItem[]>[] = []
    for (let p = 2; p <= pagesToFetch; p++) {
      const url = `https://api.are.na/v2/search?q=${encodeURIComponent(name)}&page=${p}&per=${per}`
      promises.push(
        arenaFetch(url, { headers, mode: 'cors' })
          .then(res => (res.ok ? res.json() : Promise.reject(new Error(`search p${p} ${res.status}`))))
          .then((json: any) => {
            const items = ((json?.channels as any[]) ?? []).map(mapChannel).filter(Boolean) as UserChannelListItem[]
            return items
          })
          .catch(() => [])
      )
    }

    const rest = await Promise.all(promises)
    const all = [...firstItems, ...rest.flat()]
    const byKey = new Map<string, UserChannelListItem>()
    for (const it of all) byKey.set(it.slug, it)
    const items = Array.from(byKey.values())

    userChannelsCache.set(key, items)
    // console.debug(`[arena] search fallback user=${userId}(${name}) pages=${pagesToFetch}/${totalPages} items=${items.length} ${Date.now() - t0}ms`)
    return items
  } catch (e: any) {
    throw new Error(`Are.na user channels fallback failed: ${e?.message ?? 'Unknown error'}`)
  }
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

