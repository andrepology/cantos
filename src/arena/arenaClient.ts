import { arenaFetch } from './http'
import { getArenaAccessToken } from './token'
import type { ArenaBlock, ArenaChannelListResponse, ArenaChannelResponse, ArenaUser } from './types'

export function getAuthHeaders(): HeadersInit | undefined {
  const token = getArenaAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : undefined
}

export function httpError(res: Response, url: string, prefix = 'Are.na fetch failed'): Error {
  const reason = `${res.status} ${res.statusText}`
  return new Error(`${prefix}: ${reason}. URL: ${url}`)
}

export function toArenaAuthor(
  u: ArenaUser | null | undefined
):
  | {
      id: number
      username?: string
      fullName?: string
      avatarThumb?: string
      avatarDisplay?: string
    }
  | undefined {
  if (!u) return undefined

  // Safe extraction without 'any'
  let avatarThumb: string | undefined
  let avatarDisplay: string | undefined

  if (u.avatar_image) {
    avatarThumb = u.avatar_image.thumb
    avatarDisplay = u.avatar_image.display
  }

  if (u.avatar) {
    if (typeof u.avatar === 'string') {
      avatarThumb = avatarThumb ?? u.avatar
    } else {
      avatarThumb = avatarThumb ?? u.avatar.thumb
      avatarDisplay = avatarDisplay ?? u.avatar.display
    }
  }

  return {
    id: u.id,
    username: u.username ?? undefined,
    fullName: u.full_name ?? undefined,
    avatarThumb,
    avatarDisplay,
  }
}

// Channel details - uses v3 API
export async function fetchChannelDetails(
  slug: string,
  opts: { signal?: AbortSignal } = {}
): Promise<ArenaChannelResponse> {
  const url = `https://api.are.na/v3/channels/${encodeURIComponent(slug)}`
  const res = await arenaFetch(url, { headers: getAuthHeaders(), mode: 'cors', signal: opts.signal })
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(`Are.na fetch failed (401 Unauthorized). Please log in to Arena. URL: ${url}`)
    }
    throw httpError(res, url)
  }
  const v3 = (await res.json()) as any

  // Transform v3 to v2-compatible shape for backward compatibility
  return {
    id: v3.id,
    title: v3.title,
    slug: v3.slug,
    description: v3.description?.plain ?? null,
    contents: [], // v3 doesn't include contents in channel response
    created_at: v3.created_at,
    updated_at: v3.updated_at,
    length: v3.counts?.contents,
    status: v3.visibility,
    user: v3.owner ? {
      id: v3.owner.id,
      username: v3.owner.slug ?? v3.owner.username,
      full_name: v3.owner.name ?? v3.owner.full_name,
      avatar: v3.owner.avatar,
      avatar_image: typeof v3.owner.avatar === 'string' ? { thumb: v3.owner.avatar } : undefined,
    } : undefined,
  } as ArenaChannelResponse
}

// Channel contents - uses v3 API (provides image dimensions!)
export async function fetchChannelContentsPage(
  slug: string,
  page: number,
  per: number,
  opts: { signal?: AbortSignal } = {}
): Promise<ArenaChannelResponse> {
  const url = `https://api.are.na/v3/channels/${encodeURIComponent(slug)}/contents?page=${page}&per=${per}&sort=position_desc`
  const res = await arenaFetch(url, { headers: getAuthHeaders(), mode: 'cors', signal: opts.signal })
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(`Are.na fetch failed (401 Unauthorized). Please log in to Arena. URL: ${url}`)
    }
    throw httpError(res, url)
  }
  const v3 = (await res.json()) as { data: any[]; meta: { has_more_pages: boolean; current_page: number; total_pages?: number } }

  // Transform v3 blocks to v2-compatible shape
  const contents = (v3.data ?? []).map((b: any) => {
    // Transform v3 image to v2-compatible shape with aspect_ratio
    const image = b.image ? {
      filename: b.image.filename,
      content_type: b.image.content_type,
      updated_at: b.image.updated_at,
      // v3 provides dimensions directly - this eliminates aspect measurement!
      aspect_ratio: b.image.aspect_ratio,
      width: b.image.width,
      height: b.image.height,
      blurhash: b.image.blurhash,
      alt_text: b.image.alt_text,
      // v3 uses small/medium/large, transform to v2 thumb/display/large
      thumb: b.image.small ? { url: b.image.small.src } : undefined,
      display: b.image.medium ? { url: b.image.medium.src } : undefined,
      large: b.image.large ? { url: b.image.large.src } : undefined,
      square: b.image.square ? { url: b.image.square.src } : undefined,
      // Also include v3 structure for new code
      small: b.image.small,
      medium: b.image.medium,
      original: b.image.original,
    } : undefined

    return {
      blockId: String(b.id),
      id: b.id,
      class: b.type === 'Embed' ? 'Media' : b.type,  // Map v3 Embed to v2 Media
      type: b.type,  // Also include v3 type
      title: b.title,
      created_at: b.created_at,
      updated_at: b.updated_at,
      content: b.content?.html ?? b.content?.markdown,
      content_html: b.content?.html,
      description: b.description?.plain,
      description_html: b.description?.html,
      image,
      source: b.source,
      embed: b.embed,
      attachment: b.attachment,
      user: b.user ? {
        id: b.user.id,
        username: b.user.slug ?? b.user.username,
        full_name: b.user.name ?? b.user.full_name,
        avatar: b.user.avatar,
        avatar_image: typeof b.user.avatar === 'string' ? { thumb: b.user.avatar } : undefined,
      } : undefined,
      // Channel-specific fields (when type is Channel)
      length: b.counts?.contents,
      slug: b.slug,
    } as ArenaBlock
  })

  // Return v2-compatible response shape
  return {
    id: 0, // Not provided in contents response
    title: '',
    slug: slug,
    contents,
    created_at: '',
    updated_at: '',
    current_page: v3.meta?.current_page,
    total_pages: v3.meta?.total_pages,
  } as ArenaChannelResponse
}

// Channel connections - uses v3 API
export async function fetchChannelConnectionsPage(
  channelId: string | number,
  page: number,
  per: number,
  opts: { signal?: AbortSignal } = {}
): Promise<ArenaChannelListResponse> {
  const url = `https://api.are.na/v3/channels/${encodeURIComponent(String(channelId))}/connections?page=${page}&per=${per}`
  const res = await arenaFetch(url, { headers: getAuthHeaders(), mode: 'cors', signal: opts.signal })
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(`Are.na fetch failed (401 Unauthorized). Please log in to Arena. URL: ${url}`)
    }
    throw httpError(res, url)
  }
  const v3 = (await res.json()) as { data: any[]; meta: { current_page: number; total_pages?: number; per_page: number } }

  // Transform v3 to v2-compatible shape
  const channels = (v3.data ?? []).map((c: any) => ({
    id: c.id,
    title: c.title ?? '',
    slug: c.slug ?? String(c.id),
    length: c.counts?.contents ?? 0,
    created_at: c.created_at,
    updated_at: c.updated_at,
    added_to_at: c.updated_at,
    published: true,
    open: false,
    collaboration: false,
    collaborator_count: c.counts?.collaborators ?? 0,
    kind: 'default',
    status: c.visibility ?? 'public',
    follower_count: 0,
    can_index: true,
    owner_type: c.owner?.type ?? 'User',
    owner_id: c.owner?.id,
    owner_slug: c.owner?.slug,
    'nsfw?': false,
    state: c.state ?? 'available',
    share_link: null,
    metadata: c.description ? { description: c.description.plain } : null,
    user: c.owner ? {
      id: c.owner.id,
      username: c.owner.slug ?? c.owner.username,
      full_name: c.owner.name ?? c.owner.full_name,
      avatar: c.owner.avatar,
      avatar_image: typeof c.owner.avatar === 'string' ? { thumb: c.owner.avatar } : undefined,
    } : undefined,
  }))

  return {
    length: channels.length,
    total_pages: v3.meta?.total_pages ?? 1,
    current_page: v3.meta?.current_page ?? page,
    per: v3.meta?.per_page ?? per,
    channel_title: '',
    id: typeof channelId === 'number' ? channelId : 0,
    base_class: 'Channel',
    class: 'Channel',
    channels,
  } as ArenaChannelListResponse
}

// Block connections - uses v3 API
export async function fetchBlockConnectionsPage(
  blockId: number,
  page: number,
  per: number,
  opts: { signal?: AbortSignal } = {}
): Promise<ArenaChannelListResponse> {
  const url = `https://api.are.na/v3/blocks/${encodeURIComponent(String(blockId))}/connections?page=${page}&per=${per}`
  const res = await arenaFetch(url, { headers: getAuthHeaders(), mode: 'cors', signal: opts.signal })
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(`Are.na fetch failed (401 Unauthorized). Please log in to Arena. URL: ${url}`)
    }
    throw httpError(res, url)
  }
  const v3 = (await res.json()) as { data: any[]; meta: { current_page: number; total_pages?: number; per_page: number } }

  // Transform v3 to v2-compatible shape
  const channels = (v3.data ?? []).map((c: any) => ({
    id: c.id,
    title: c.title ?? '',
    slug: c.slug ?? String(c.id),
    length: c.counts?.contents ?? 0,
    created_at: c.created_at,
    updated_at: c.updated_at,
    added_to_at: c.updated_at,
    published: true,
    open: false,
    collaboration: false,
    collaborator_count: c.counts?.collaborators ?? 0,
    kind: 'default',
    status: c.visibility ?? 'public',
    follower_count: 0,
    can_index: true,
    owner_type: c.owner?.type ?? 'User',
    owner_id: c.owner?.id,
    owner_slug: c.owner?.slug,
    'nsfw?': false,
    state: c.state ?? 'available',
    share_link: null,
    metadata: c.description ? { description: c.description.plain } : null,
    user: c.owner ? {
      id: c.owner.id,
      username: c.owner.slug ?? c.owner.username,
      full_name: c.owner.name ?? c.owner.full_name,
      avatar: c.owner.avatar,
      avatar_image: typeof c.owner.avatar === 'string' ? { thumb: c.owner.avatar } : undefined,
    } : undefined,
  }))

  return {
    length: channels.length,
    total_pages: v3.meta?.total_pages ?? 1,
    current_page: v3.meta?.current_page ?? page,
    per: v3.meta?.per_page ?? per,
    channel_title: '',
    id: blockId,
    base_class: 'Block',
    class: 'Block',
    channels,
  } as ArenaChannelListResponse
}

// Block details - uses v3 API
export async function fetchBlockDetails(
  blockId: number,
  opts: { signal?: AbortSignal } = {}
): Promise<ArenaBlock> {
  const url = `https://api.are.na/v3/blocks/${encodeURIComponent(String(blockId))}`
  const res = await arenaFetch(url, { headers: getAuthHeaders(), mode: 'cors', signal: opts.signal })
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(`Are.na fetch failed (401 Unauthorized). Please log in to Arena. URL: ${url}`)
    }
    throw httpError(res, url)
  }
  const b = (await res.json()) as any

  // Transform v3 image to v2-compatible shape with aspect_ratio
  const image = b.image ? {
    filename: b.image.filename,
    content_type: b.image.content_type,
    updated_at: b.image.updated_at,
    aspect_ratio: b.image.aspect_ratio,
    width: b.image.width,
    height: b.image.height,
    blurhash: b.image.blurhash,
    alt_text: b.image.alt_text,
    thumb: b.image.small ? { url: b.image.small.src } : undefined,
    display: b.image.medium ? { url: b.image.medium.src } : undefined,
    large: b.image.large ? { url: b.image.large.src } : undefined,
    square: b.image.square ? { url: b.image.square.src } : undefined,
    small: b.image.small,
    medium: b.image.medium,
    original: b.image.original,
  } : undefined

  return {
    blockId: String(b.id),
    id: b.id,
    class: b.type === 'Embed' ? 'Media' : b.type,
    type: b.type,
    title: b.title,
    created_at: b.created_at,
    updated_at: b.updated_at,
    content: b.content?.html ?? b.content?.markdown,
    content_html: b.content?.html,
    description: b.description?.plain,
    description_html: b.description?.html,
    image,
    source: b.source,
    embed: b.embed,
    attachment: b.attachment,
    user: b.user ? {
      id: b.user.id,
      username: b.user.slug ?? b.user.username,
      full_name: b.user.name ?? b.user.full_name,
      avatar: b.user.avatar,
      avatar_image: typeof b.user.avatar === 'string' ? { thumb: b.user.avatar } : undefined,
    } : undefined,
  } as ArenaBlock
}

// =============================================================================
// User/Author API
// =============================================================================

export type ArenaUserDetails = {
  id: number
  slug: string
  username: string
  first_name?: string
  last_name?: string
  full_name?: string
  avatar?: string
  avatar_image?: { thumb?: string; display?: string }
  channel_count?: number
  following_count?: number
  follower_count?: number
  profile_id?: number
  class: 'User'
  initials?: string
  can_index?: boolean
  metadata?: { description?: string | null }
  is_premium?: boolean
  is_lifetime_premium?: boolean
  is_supporter?: boolean
  is_exceeding_connections_limit?: boolean
  is_confirmed?: boolean
  is_pending_reconfirmation?: boolean
  is_pending_confirmation?: boolean
  badge?: string | null
  base_class: 'User'
  created_at?: string
}

/**
 * Fetch user profile details from Arena.
 * Endpoint: GET /v2/users/:id or /v2/users/:slug
 */
export async function fetchUserDetails(
  userIdOrSlug: number | string,
  opts: { signal?: AbortSignal } = {}
): Promise<ArenaUserDetails> {
  const url = `https://api.are.na/v2/users/${encodeURIComponent(String(userIdOrSlug))}`
  const res = await arenaFetch(url, { headers: getAuthHeaders(), mode: 'cors', signal: opts.signal })
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(`Are.na fetch failed (401 Unauthorized). Please log in to Arena. URL: ${url}`)
    }
    if (res.status === 404) {
      throw new Error(`User not found: ${userIdOrSlug}`)
    }
    throw httpError(res, url)
  }
  return (await res.json()) as ArenaUserDetails
}

/**
 * Fetch a page of user's channels from Arena.
 * Endpoint: GET /v2/users/:id/channels
 * Note: Response includes partial contents (first ~6 blocks) per channel.
 */
export async function fetchUserChannelsPage(
  userIdOrSlug: number | string,
  page: number,
  per: number,
  opts: { signal?: AbortSignal } = {}
): Promise<ArenaChannelListResponse> {
  const url = `https://api.are.na/v2/users/${encodeURIComponent(String(userIdOrSlug))}/channels?page=${page}&per=${per}`
  const res = await arenaFetch(url, { headers: getAuthHeaders(), mode: 'cors', signal: opts.signal })
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(`Are.na fetch failed (401 Unauthorized). Please log in to Arena. URL: ${url}`)
    }
    if (res.status === 404) {
      throw new Error(`User not found: ${userIdOrSlug}`)
    }
    throw httpError(res, url)
  }
  return (await res.json()) as ArenaChannelListResponse
}
