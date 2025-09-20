import type {
  ArenaChannelResponse,
  ArenaBlock,
  Card,
  ArenaUser,
  ChannelData,
  ArenaChannelSearchResponse,
  ChannelSearchResult,
} from './types'

const cache = new Map<string, ChannelData>()

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
  const token = (import.meta as any)?.env?.VITE_ARENA_ACCESS_TOKEN || (import.meta as any)?.env?.VITE_ARENA_TOKEN
  let author: ArenaUser | undefined
  let channelTitle: string | undefined

  while (url) {
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      mode: 'cors',
    })
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


export async function searchArenaChannels(query: string, page: number = 1, per: number = 20): Promise<ChannelSearchResult[]> {
  const q = query.trim()
  if (!q) return []
  const url = `https://api.are.na/v2/search/channels?q=${encodeURIComponent(q)}&page=${page}&per=${per}`
  const token = (import.meta as any)?.env?.VITE_ARENA_ACCESS_TOKEN || (import.meta as any)?.env?.VITE_ARENA_TOKEN
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    mode: 'cors',
  })
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

