import type { ArenaChannelResponse, ArenaBlock, Card, ArenaUser } from './types'

const cache = new Map<string, Card[]>()

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
    default:
      return { ...base, type: 'text', content: b.title ?? 'Untitled' }
  }
}

export async function fetchArenaChannel(slug: string, per: number = 40): Promise<Card[]> {
  if (cache.has(slug)) return cache.get(slug)!

  const collected: ArenaBlock[] = []
  let url = `https://api.are.na/v2/channels/${encodeURIComponent(slug)}?per=${per}`

  while (url) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Are.na fetch failed: ${res.status} ${res.statusText}`)
    const json = (await res.json()) as ArenaChannelResponse
    collected.push(...(json.contents ?? []))
    url = json.pagination?.next ?? ''
  }

  const cards = collected.map(blockToCard)
  cache.set(slug, cards)
  return cards
}


