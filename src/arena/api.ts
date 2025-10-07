import type {
  ArenaChannelResponse,
  ArenaBlock,
  Card,
  ArenaUser,
  ChannelData,
  ChannelSearchResult,
  SearchResult,
  UserChannelListItem,
  ArenaBlockDetails,
  ArenaBlockConnection,
  ConnectedChannel,
} from './types'
import { arenaFetch } from './http'
import { getArenaAccessToken } from './token'

const cache = new Map<string, ChannelData>()
const blockDetailsCache = new Map<number, ArenaBlockDetails>()
const userChannelsCache = new Map<string, UserChannelListItem[]>()

const getAuthHeaders = (): HeadersInit | undefined => {
  const token = getArenaAccessToken()
  try {
    // console.debug('[arena-api] getAuthHeaders: tokenPresent=', !!token)
  } catch {}
  return token ? { Authorization: `Bearer ${token}` } : undefined
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
    case 'Image':
      return {
        ...base,
        type: 'image',
        url: b.image?.display?.url ?? '',
        alt: b.title ?? 'Image',
        originalDimensions: b.image?.original,
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

export async function fetchArenaChannel(slug: string, per: number = 50): Promise<ChannelData> {
  if (cache.has(slug)) return cache.get(slug)!

  const headers = getAuthHeaders()

  // 1. First, fetch channel metadata (title, author, etc.) using the main channels endpoint
  const channelUrl = `https://api.are.na/v2/channels/${encodeURIComponent(slug)}`
  const channelRes = await arenaFetch(channelUrl, { headers, mode: 'cors' })
  if (!channelRes.ok) {
    const reason = `${channelRes.status} ${channelRes.statusText}`
    if (channelRes.status === 401) {
      throw new Error(
        `Are.na fetch failed (401 Unauthorized). Please log in to Arena to access private channels. URL: ${channelUrl}`
      )
    }
    throw new Error(`Are.na fetch failed: ${reason}. URL: ${channelUrl}`)
  }
  const channelJson = (await channelRes.json()) as ArenaChannelResponse
  const channelTitle = channelJson.title
  const author = channelJson.user ? toUser(channelJson.user) : undefined

  // 2. Then fetch all blocks using the contents endpoint (includes private blocks)
  const collected: ArenaBlock[] = []
  let page = 1
  let contentsUrl = `https://api.are.na/v2/channels/${encodeURIComponent(slug)}/contents?page=${page}&per=${per}&sort=position&direction=desc`

  while (contentsUrl) {
    const res = await arenaFetch(contentsUrl, { headers, mode: 'cors' })
    if (!res.ok) {
      const reason = `${res.status} ${res.statusText}`
      if (res.status === 401) {
        throw new Error(
          `Are.na fetch failed (401 Unauthorized). Please log in to Arena to access private channels. URL: ${contentsUrl}`
        )
      }
      throw new Error(`Are.na fetch failed: ${reason}. URL: ${contentsUrl}`)
    }
    const json = (await res.json()) as ArenaChannelResponse
    collected.push(...(json.contents ?? []))
    // Use page-based pagination
    page++
    const hasMore = json.contents && json.contents.length === per
    contentsUrl = hasMore ? `https://api.are.na/v2/channels/${encodeURIComponent(slug)}/contents?page=${page}&per=${per}&sort=position&direction=desc` : ''
  }

  const cards = collected.map(blockToCard)
  const data: ChannelData = { cards, author, title: channelTitle }
  cache.set(slug, data)
  return data
}

export function invalidateArenaChannel(slug: string): void {
  try {
    cache.delete(slug)
  } catch {}
}

// Fetch channels connected to a channel (channels/:id/channels). Accepts slug or id.
const connectedChannelsCache = new Map<string | number, ConnectedChannel[]>()
export async function fetchConnectedChannels(channelIdOrSlug: number | string): Promise<ConnectedChannel[]> {
  const key = channelIdOrSlug
  if (connectedChannelsCache.has(key)) return connectedChannelsCache.get(key)!

  // If slug is provided, we need the id first; try to get it from the channel response
  let id: number | null = null
  if (typeof channelIdOrSlug === 'number') {
    id = channelIdOrSlug
  } else {
    // Minimal call to get id from slug
    const url = `https://api.are.na/v2/channels/${encodeURIComponent(channelIdOrSlug)}`
    const res = await arenaFetch(url, { headers: getAuthHeaders(), mode: 'cors' })
    if (!res.ok) throw new Error(`Are.na channel fetch failed: ${res.status} ${res.statusText}`)
    const json = (await res.json()) as any
    id = json?.id ?? null
  }
  if (!id) return []

  const list: ConnectedChannel[] = []
  // Per docs, use /channels/:id/connections (returns connection objects, not full)
  // We'll coerce into a minimal channel representation; if the shape differs, we try best-effort mapping.
  let url = `https://api.are.na/v2/channels/${encodeURIComponent(String(id))}/connections`
  const headers = getAuthHeaders()
  while (url) {
    const res = await arenaFetch(url, { headers, mode: 'cors' })
    if (!res.ok) {
      // Some older docs mention /channels; fallback once if /connections 404s
      if (res.status === 404 && url.includes('/connections')) {
        url = `https://api.are.na/v2/channels/${encodeURIComponent(String(id))}/channels`
        continue
      }
      break
    }
    const json = (await res.json()) as any
    const arrBase = Array.isArray(json)
      ? json
      : (json?.connections ?? json?.channels ?? [])
    const arr = Array.isArray(arrBase) ? arrBase : []

    const coerceChannel = (item: any): any => {
      const c = item?.channel ?? item?.connected_channel ?? item?.connected_to ?? item
      return c
    }

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
      })
    }
    const next = json?.pagination?.next ?? json?.next ?? ''
    url = typeof next === 'string' ? next : ''
  }

  connectedChannelsCache.set(key, list)
  return list
}


// Fetch a block's details and its connections list (paginated at API; we fetch first page only)
export async function fetchArenaBlockDetails(blockId: number): Promise<ArenaBlockDetails> {
  if (blockDetailsCache.has(blockId)) return blockDetailsCache.get(blockId)!

  const headers = getAuthHeaders()

  // Block core
  const blockUrl = `https://api.are.na/v2/blocks/${encodeURIComponent(String(blockId))}`
  const blockRes = await arenaFetch(blockUrl, { headers, mode: 'cors' })
  if (!blockRes.ok) {
    throw new Error(`Are.na block fetch failed: ${blockRes.status} ${blockRes.statusText}`)
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

  // Connections (first page only; enough for lightweight panel)
  const connUrl = `https://api.are.na/v2/blocks/${encodeURIComponent(String(blockId))}/channels`
  const connRes = await arenaFetch(connUrl, { headers, mode: 'cors' })
  if (!connRes.ok) {
    throw new Error(`Are.na block channels failed: ${connRes.status} ${connRes.statusText}`)
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

  const hasMoreConnections = typeof connJson?.current_page === 'number' && typeof connJson?.total_pages === 'number'
    ? connJson.current_page < connJson.total_pages
    : false

  const details: ArenaBlockDetails = { ...detailsBase, connections, hasMoreConnections }
  blockDetailsCache.set(blockId, details)
  return details
}

export async function searchArenaChannels(query: string, page: number = 1, per: number = 20): Promise<ChannelSearchResult[]> {
  const q = query.trim()
  if (!q) return []
  const url = `https://api.are.na/v2/search?q=${encodeURIComponent(q)}&page=${page}&per=${per}`
  const res = await arenaFetch(url, { headers: getAuthHeaders(), mode: 'cors' })
  if (!res.ok) {
    throw new Error(`Are.na search failed: ${res.status} ${res.statusText}`)
  }
  const json = (await res.json()) as any

  const toUser = (u: any): ArenaUser => ({
    id: u.id,
    username: u.username,
    full_name: u.full_name,
    avatar: u?.avatar?.thumb ?? u?.avatar_image?.thumb ?? null,
  })

  const channels = Array.isArray(json?.channels) ? json.channels : []
  const results: ChannelSearchResult[] = channels.map((c: any) => ({
    id: c.id,
    title: c.title,
    slug: c.slug,
    author: c.user ? toUser(c.user) : undefined,
    description: c.description,
    length: c.length,
    updatedAt: c.updated_at,
  }))

  return results
}

// Mixed search: channels + users
export async function searchArena(query: string, page: number = 1, per: number = 20): Promise<SearchResult[]> {
  const q = query.trim()
  if (!q) return []

  const url = `https://api.are.na/v2/search?q=${encodeURIComponent(q)}&page=${page}&per=${per}`
  const res = await arenaFetch(url, { headers: getAuthHeaders(), mode: 'cors' })
  if (!res.ok) {
    throw new Error(`Are.na search failed: ${res.status} ${res.statusText}`)
  }
  const json = (await res.json()) as any

  const usersArr = Array.isArray(json?.users) ? json.users : []
  const channelsArr = Array.isArray(json?.channels) ? json.channels : []
  // Blocks are available in json.blocks but are currently ignored by the UI. We can add mapping later.

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

  // Dedupe by kind-id just in case
  const map = new Map<string, SearchResult>()
  for (const r of [...userResults, ...channelResults]) {
    map.set(`${r.kind}-${r.id}`, r)
  }
  return Array.from(map.values())
}

// Fetch a user's channels for the index view
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
  const t0 = Date.now()

  // If we have a token, try the direct endpoint with pagination first (faster and complete)
  if (hasToken) {
    try {
      const mapItem = (c: any): UserChannelListItem => ({
        id: c.id,
        title: c.title ?? '',
        slug: c.slug ?? '',
        thumbUrl: c.thumb?.display?.url ?? c.image?.display?.url ?? c.open_graph_image_url ?? undefined,
        updatedAt: c.updated_at ?? undefined,
        length: typeof c.length === 'number' ? c.length : undefined,
        status: typeof c.status === 'string' ? c.status : (typeof c.visibility === 'string' ? c.visibility : undefined),
        open: typeof c.open === 'boolean' ? c.open : (typeof c.collaboration === 'boolean' ? c.collaboration : undefined),
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

      // Dedupe by slug
      const byKey = new Map<string, UserChannelListItem>()
      for (const it of items) byKey.set(it.slug, it)
      const deduped = Array.from(byKey.values())
      userChannelsCache.set(key, deduped)
      return deduped
    } catch (e) {
      console.debug(`[arena] users/:id/channels failed, falling back. user=${userId}. Reason: ${(e as any)?.message ?? e}`)
      // continue to fallback
    }
  }

  // Fallback: search-based approach
  try {
    const name = username ?? (await fetchArenaUser(userId)).username
    if (!name) return []

    // page 1 to discover total_pages (generic search; read channels array)
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
        status: typeof c.status === 'string' ? c.status : (typeof c.visibility === 'string' ? c.visibility : undefined),
        open: typeof c.open === 'boolean' ? c.open : (typeof c.collaboration === 'boolean' ? c.collaboration : undefined),
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
          .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`search p${p} ${res.status}`))))
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

// Fetch a single user (for label display)
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

