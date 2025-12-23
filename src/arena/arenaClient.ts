import { arenaFetch } from './http'
import { getArenaAccessToken } from './token'
import type { ArenaChannelListResponse, ArenaChannelResponse, ArenaUser } from './types'

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
    }
  | undefined {
  if (!u) return undefined
  const anyUser = u as any
  const avatarThumb =
    anyUser?.avatar?.thumb ??
    u.avatar_image?.thumb ??
    (typeof anyUser?.avatar === 'string' ? (anyUser.avatar as string) : undefined) ??
    (typeof u.avatar === 'string' ? u.avatar : undefined) ??
    undefined

  return {
    id: u.id,
    username: u.username ?? undefined,
    fullName: u.full_name ?? undefined,
    avatarThumb,
  }
}

export async function fetchChannelDetails(
  slug: string,
  opts: { signal?: AbortSignal } = {}
): Promise<{
  id: number
  title: string
  slug: string
  description?: string | null
  created_at: string
  updated_at: string
  length?: number
  user?: ArenaUser
}> {
  const url = `https://api.are.na/v2/channels/${encodeURIComponent(slug)}`
  const res = await arenaFetch(url, { headers: getAuthHeaders(), mode: 'cors', signal: opts.signal })
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(`Are.na fetch failed (401 Unauthorized). Please log in to Arena. URL: ${url}`)
    }
    throw httpError(res, url)
  }
  const json = (await res.json()) as any
  return {
    id: json.id,
    title: json.title,
    slug: json.slug ?? slug,
    description: json.description ?? null,
    created_at: json.created_at,
    updated_at: json.updated_at,
    length: typeof json.length === 'number' ? json.length : undefined,
    user: (json.user as ArenaUser | undefined) ?? undefined,
  }
}

export async function fetchChannelContentsPage(
  slug: string,
  page: number,
  per: number,
  opts: { signal?: AbortSignal } = {}
): Promise<ArenaChannelResponse> {
  const url = `https://api.are.na/v2/channels/${encodeURIComponent(slug)}/contents?page=${page}&per=${per}&sort=position&direction=desc`
  const res = await arenaFetch(url, { headers: getAuthHeaders(), mode: 'cors', signal: opts.signal })
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(`Are.na fetch failed (401 Unauthorized). Please log in to Arena. URL: ${url}`)
    }
    throw httpError(res, url)
  }
  return (await res.json()) as ArenaChannelResponse
}

export async function fetchChannelConnectionsPage(
  channelId: string | number,
  page: number,
  per: number,
  opts: { signal?: AbortSignal } = {}
): Promise<ArenaChannelListResponse> {
  const url = `https://api.are.na/v2/channels/${encodeURIComponent(String(channelId))}/connections?page=${page}&per=${per}`
  const res = await arenaFetch(url, { headers: getAuthHeaders(), mode: 'cors', signal: opts.signal })
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(`Are.na fetch failed (401 Unauthorized). Please log in to Arena. URL: ${url}`)
    }
    throw httpError(res, url)
  }
  return (await res.json()) as ArenaChannelListResponse
}

export async function fetchBlockConnectionsPage(
  blockId: number,
  page: number,
  per: number,
  opts: { signal?: AbortSignal } = {}
): Promise<ArenaChannelListResponse> {
  const url = `https://api.are.na/v2/blocks/${encodeURIComponent(String(blockId))}/channels?page=${page}&per=${per}`
  const res = await arenaFetch(url, { headers: getAuthHeaders(), mode: 'cors', signal: opts.signal })
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(`Are.na fetch failed (401 Unauthorized). Please log in to Arena. URL: ${url}`)
    }
    throw httpError(res, url)
  }
  return (await res.json()) as ArenaChannelListResponse
}

export async function fetchBlockDetails(
  blockId: number,
  opts: { signal?: AbortSignal } = {}
): Promise<{
  id: number
  title?: string
  description?: string | null
  created_at: string
  updated_at: string
  user?: ArenaUser
}> {
  const url = `https://api.are.na/v2/blocks/${encodeURIComponent(String(blockId))}`
  const res = await arenaFetch(url, { headers: getAuthHeaders(), mode: 'cors', signal: opts.signal })
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(`Are.na fetch failed (401 Unauthorized). Please log in to Arena. URL: ${url}`)
    }
    throw httpError(res, url)
  }
  const json = (await res.json()) as any
  return {
    id: json.id,
    title: json.title ?? undefined,
    description: json.description ?? null,
    created_at: json.created_at,
    updated_at: json.updated_at,
    user: (json.user as ArenaUser | undefined) ?? undefined,
  }
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
