import type {
  ArenaChannelResponse,
  ArenaBlock,
  Card,
  ArenaUser,
  ChannelData,
  ArenaChannelSearchResponse,
  ChannelSearchResult,
  SearchResult,
  UserChannelListItem,
  ArenaBlockDetails,
  ArenaBlockConnection,
  ConnectedChannel,
} from './types'

const cache = new Map<string, ChannelData>()
const blockDetailsCache = new Map<number, ArenaBlockDetails>()
const userChannelsCache = new Map<string, UserChannelListItem[]>()

const getAuthHeaders = (): HeadersInit | undefined => {
  let token: string | undefined
  // Prefer env for development/testing
  const envToken = (import.meta as any).env?.VITE_ARENA_ACCESS_TOKEN as string | undefined
  if (envToken && envToken.trim()) token = envToken.trim()
  // Fallback to client-side persisted token
  if (!token && typeof window !== 'undefined') {
    try {
      const ls = window.localStorage.getItem('arenaAccessToken') || ''
      if (ls && ls.trim()) token = ls.trim()
    } catch {}
  }
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

export async function fetchArenaChannel(slug: string, per: number = 40): Promise<ChannelData> {
  if (cache.has(slug)) return cache.get(slug)!

  const collected: ArenaBlock[] = []
  let url = `https://api.are.na/v2/channels/${encodeURIComponent(slug)}?per=${per}`
  const headers = getAuthHeaders()
  let author: ArenaUser | undefined
  let channelTitle: string | undefined

  while (url) {
    const res = await fetch(url, { headers, mode: 'cors' })
    if (!res.ok) {
      const reason = `${res.status} ${res.statusText}`
      if (res.status === 401) {
        throw new Error(
          `Are.na fetch failed (401 Unauthorized). Set VITE_ARENA_ACCESS_TOKEN in your env for private channels or authenticated access. URL: ${url}`
        )
      }
      throw new Error(`Are.na fetch failed: ${reason}. URL: ${url}`)
    }
    const json = (await res.json()) as ArenaChannelResponse
    if (!channelTitle && json.title) channelTitle = json.title
    if (!author && json.user) {
      author = toUser(json.user)
    }
    collected.push(...(json.contents ?? []))
    url = json.pagination?.next ?? ''
  }

  const cards = collected.map(blockToCard)
  const data: ChannelData = { cards, author, title: channelTitle }
  cache.set(slug, data)
  return data
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
    const res = await fetch(url, { headers: getAuthHeaders(), mode: 'cors' })
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
    const res = await fetch(url, { headers, mode: 'cors' })
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
  const blockRes = await fetch(blockUrl, { headers, mode: 'cors' })
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
  const connRes = await fetch(connUrl, { headers, mode: 'cors' })
  if (!connRes.ok) {
    throw new Error(`Are.na block channels failed: ${connRes.status} ${connRes.statusText}`)
  }
  const connJson = (await connRes.json()) as any
  const list = (connJson?.channels ?? connJson) as any[]
  const connections: ArenaBlockConnection[] = list.map((c: any) => ({
    id: c.id,
    title: c.title ?? '',
    slug: c.slug ?? String(c.id),
    user: c.user
      ? {
          id: c.user.id,
          username: c.user.username,
          full_name: c.user.full_name,
          avatar: c.user?.avatar?.thumb ?? c.user?.avatar_image?.thumb ?? null,
        }
      : undefined,
    updatedAt: c.updated_at ?? undefined,
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
  const url = `https://api.are.na/v2/search/channels?q=${encodeURIComponent(q)}&page=${page}&per=${per}`
  const res = await fetch(url, { headers: getAuthHeaders(), mode: 'cors' })
  if (!res.ok) {
    throw new Error(`Are.na search failed: ${res.status} ${res.statusText}`)
  }
  const json = (await res.json()) as ArenaChannelSearchResponse

  const toUser = (u: NonNullable<ArenaChannelSearchResponse['channels'][number]['user']>): ArenaUser => ({
    id: u.id,
    username: u.username,
    full_name: u.full_name,
    avatar: u.avatar?.thumb ?? u.avatar_image?.thumb ?? null,
  })

  const results: ChannelSearchResult[] = (json.channels ?? []).map((c) => ({
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

  const headers = getAuthHeaders()
  const usersUrl = `https://api.are.na/v2/search/users?q=${encodeURIComponent(q)}&page=${page}&per=${per}`
  const channelsUrl = `https://api.are.na/v2/search/channels?q=${encodeURIComponent(q)}&page=${page}&per=${per}`

  const [usersRes, channelsRes] = await Promise.all([
    fetch(usersUrl, { headers, mode: 'cors' }),
    fetch(channelsUrl, { headers, mode: 'cors' }),
  ])

  if (!usersRes.ok && !channelsRes.ok) {
    throw new Error(`Are.na search failed: users ${usersRes.status} / channels ${channelsRes.status}`)
  }

  const usersJson = usersRes.ok ? ((await usersRes.json()) as any) : { users: [] }
  const channelsJson = channelsRes.ok ? ((await channelsRes.json()) as any) : { channels: [] }

  const userResults: SearchResult[] = (usersJson.users ?? []).map((u: any) => ({
    kind: 'user',
    id: u.id,
    username: u.username,
    full_name: u.full_name,
    avatar: u.avatar?.thumb ?? u.avatar_image?.thumb ?? null,
  }))

  const channelResults: SearchResult[] = (channelsJson.channels ?? []).map((c: any) => ({
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
        const res = await fetch(url, { headers, mode: 'cors' })
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
      console.debug(`[arena] users/:id/channels user=${userId} pages=${p - 1} items=${deduped.length} fetched=${fetched} ${Date.now() - t0}ms`)
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

    // page 1 to discover total_pages
    const firstUrl = `https://api.are.na/v2/search/channels?q=${encodeURIComponent(name)}&page=1&per=${per}`
    const firstRes = await fetch(firstUrl, { headers, mode: 'cors' })
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
      }
    }

    const totalPages: number = Math.max(1, Number(firstJson?.total_pages ?? 1))
    const firstItems = ((firstJson?.channels as any[]) ?? []).map(mapChannel).filter(Boolean) as UserChannelListItem[]

    const MAX_PAGES = 8
    const pagesToFetch = Math.min(totalPages, MAX_PAGES)
    const promises: Promise<UserChannelListItem[]>[] = []
    for (let p = 2; p <= pagesToFetch; p++) {
      const url = `https://api.are.na/v2/search/channels?q=${encodeURIComponent(name)}&page=${p}&per=${per}`
      promises.push(
        fetch(url, { headers, mode: 'cors' })
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
    console.debug(`[arena] search fallback user=${userId}(${name}) pages=${pagesToFetch}/${totalPages} items=${items.length} ${Date.now() - t0}ms`)
    return items
  } catch (e: any) {
    throw new Error(`Are.na user channels fallback failed: ${e?.message ?? 'Unknown error'}`)
  }
}

// Fetch a single user (for label display)
export async function fetchArenaUser(userId: number): Promise<ArenaUser> {
  const url = `https://api.are.na/v2/users/${encodeURIComponent(String(userId))}`
  const res = await fetch(url, { headers: getAuthHeaders(), mode: 'cors' })
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

