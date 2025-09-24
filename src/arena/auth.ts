import type { ArenaUser } from './types'
import { arenaFetch } from './http'

export type ArenaAuthConfig = {
  authHost: string
  apiBase: string
  clientId: string
  redirectUri: string
}

export function getArenaConfig(): ArenaAuthConfig {
  const authHost = (import.meta as any).env?.VITE_ARENA_AUTH_HOST || 'https://dev.are.na'
  const apiBase = (import.meta as any).env?.VITE_ARENA_API_BASE || 'https://api.are.na/v2'
  const clientId = (import.meta as any).env?.VITE_ARENA_CLIENT_ID
  const redirectUri = (import.meta as any).env?.VITE_ARENA_REDIRECT_URI || `${window.location.origin}/api/arena/callback`
  if (!clientId) {
    console.warn('[arena] VITE_ARENA_CLIENT_ID is not set; login will not work.')
  }
  return { authHost, apiBase, clientId, redirectUri }
}

export function buildArenaAuthorizeUrl(state?: string): string {
  const { authHost, clientId, redirectUri } = getArenaConfig()
  if (!clientId) {
    throw new Error('[arena] Missing VITE_ARENA_CLIENT_ID. Set it in your .env.local')
  }
  const returnTo = window.location.origin
  const composedState = state ? `${state}::${encodeURIComponent(returnTo)}` : `::${encodeURIComponent(returnTo)}`
  const params = new URLSearchParams()
  params.set('client_id', clientId)
  params.set('redirect_uri', redirectUri)
  params.set('response_type', 'code')
  params.set('state', composedState)
  return `${authHost}/oauth/authorize?${params.toString()}`
}

export function parseArenaTokenFromHash(hash: string): { accessToken: string; state?: string } | null {
  const frag = hash.startsWith('#') ? hash.slice(1) : hash
  const params = new URLSearchParams(frag)
  const accessToken = params.get('access_token') || undefined
  const state = params.get('state') || undefined
  if (!accessToken) return null
  return { accessToken, state }
}

export function parseArenaTokenFromSearch(search: string): { accessToken: string; state?: string } | null {
  const q = search.startsWith('?') ? search : `?${search}`
  const params = new URLSearchParams(q)
  const accessToken = params.get('arena_access_token') || undefined
  const state = params.get('state') || undefined
  if (!accessToken) return null
  return { accessToken, state }
}

export async function fetchArenaMe(accessToken: string): Promise<ArenaUser> {
  const { apiBase } = getArenaConfig()
  const res = await arenaFetch(`${apiBase}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    mode: 'cors',
  })
  if (!res.ok) {
    throw new Error(`Are.na /me failed: ${res.status} ${res.statusText}`)
  }
  const u = (await res.json()) as any
  const fullName = u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.full_name || u.username || ''
  return {
    id: u.id,
    username: u.username,
    full_name: fullName,
    avatar: u.avatar?.thumb ?? u.avatar_image?.thumb ?? null,
    channel_count: u.channel_count ?? u.channels_count ?? undefined,
    follower_count: typeof u.follower_count === 'number' ? u.follower_count : undefined,
    following_count: typeof u.following_count === 'number' ? u.following_count : undefined,
  }
}

export function clearUrlHash(): void {
  try {
    const url = window.location.pathname + window.location.search
    window.history.replaceState(null, document.title, url)
  } catch {}
}


