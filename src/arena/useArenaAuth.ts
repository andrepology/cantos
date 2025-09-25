import { useEffect, useMemo, useRef, useState } from 'react'
import { useAccount } from 'jazz-tools/react'
import { Account } from '../jazz/schema'
import { buildArenaAuthorizeUrl, clearUrlHash, fetchArenaMe, getArenaConfig, parseArenaTokenFromHash, parseArenaTokenFromSearch } from './auth'
import type { ArenaUser } from './types'
import { setArenaAccessTokenProvider } from './token'

export type ArenaAuthState =
  | { status: 'idle' }
  | { status: 'authorizing' }
  | { status: 'authorized'; me: ArenaUser }
  | { status: 'error'; error: string }

function writeArenaPrivate(me: any, data: {
  accessToken?: string
  userId?: number
  slug?: string
  name?: string
  avatarUrl?: string | null
  authorizedAt?: number
}) {
  if (!me) return
  const prev = me.root.arena ?? {}
  me.root.$jazz.set('arena', { ...prev, ...data })
}

function clearArenaPrivate(me: any) {
  if (!me) return
  me.root.$jazz.delete('arena')
}

export function useArenaAuth() {
  const { me } = useAccount(Account, { resolve: { root: { arena: true } } } as any)
  const [state, setState] = useState<ArenaAuthState>({ status: 'idle' })
  const lastValidatedTokenRef = useRef<string | null>(null)
  const appliedUrlTokenRef = useRef(false)
  const verifyingTokenRef = useRef<string | null>(null)

  const cachedUser: ArenaUser | null = useMemo(() => {
    const a = me?.root?.arena as any
    if (!a?.accessToken) return null
    if (!a?.userId || !(a?.slug || a?.name)) return null
    return {
      id: a.userId,
      username: a.slug || '',
      full_name: a.name || a.slug || '',
      avatar: a.avatarUrl ?? null,
      channel_count: undefined,
      follower_count: undefined,
      following_count: undefined,
    }
  }, [me])

  // Register token provider from Jazz state for API usage
  useEffect(() => {
    setArenaAccessTokenProvider(() => {
      const t = me?.root?.arena?.accessToken as string | undefined
      return t && t.trim() ? t.trim() : undefined
    })
    return () => setArenaAccessTokenProvider(null)
  }, [me])

  // 1) Apply URL token once by writing to Jazz and cleaning the URL
  useEffect(() => {
    if (me === undefined) return
    const parsed = parseArenaTokenFromSearch(window.location.search) || parseArenaTokenFromHash(window.location.hash)
    const tokenFromUrl = parsed?.accessToken?.trim()
    if (!tokenFromUrl) return
    if (appliedUrlTokenRef.current) return
    if (!me) return
    writeArenaPrivate(me, { accessToken: tokenFromUrl, authorizedAt: Date.now() })
    // removed localStorage persistence; Jazz is the single source of truth
    appliedUrlTokenRef.current = true
    try {
      const url = new URL(window.location.href)
      url.hash = ''
      url.searchParams.delete('arena_access_token')
      url.searchParams.delete('state')
      window.history.replaceState(null, document.title, `${url.pathname}${url.search}`)
    } catch {}
  }, [me])

  // 2) Verify Jazz token once (optional), set authorized state (optimistic from cache)
  useEffect(() => {
    if (me === undefined) return
    let token = (me?.root?.arena?.accessToken as string | undefined)?.trim()
    if (!token) { setState({ status: 'idle' }); return }
    // If we have cached user info, set authorized immediately (optimistic)
    if (cachedUser) {
      setState((prev) => (prev.status === 'authorized' ? prev : { status: 'authorized', me: cachedUser }))
    } else {
      setState((prev) => (prev.status === 'authorized' ? prev : { status: 'authorizing' }))
    }
    if (lastValidatedTokenRef.current === token || verifyingTokenRef.current === token) {
      return
    }
    verifyingTokenRef.current = token
    fetchArenaMe(token)
      .then((who) => {
        lastValidatedTokenRef.current = token
        verifyingTokenRef.current = null
        setState({ status: 'authorized', me: who })
      })
      .catch((e: any) => {
        verifyingTokenRef.current = null
        // Keep optimistic authorized if we had cache; otherwise surface error
        if (!cachedUser) setState({ status: 'error', error: e?.message ?? 'Auth failed' })
      })
  }, [me, cachedUser])

  // No pending write path; URL token write happens only when present

  // (logs removed)

  const api = useMemo(() => {
    return {
      state,
      login: () => {
        try {
          const stateParam = Math.random().toString(36).slice(2)
          const url = buildArenaAuthorizeUrl(stateParam)
          window.location.assign(url)
        } catch (e: any) {
          setState({ status: 'error', error: e?.message ?? 'Missing configuration' })
        }
      },
      logout: () => {
        try { console.debug('[arena-auth] logout invoked') } catch {}
        if (me) clearArenaPrivate(me)
        setState({ status: 'idle' })
      },
      refresh: async () => {
        const token = me?.root?.arena?.accessToken as string | undefined
        if (!token) return
        setState({ status: 'authorizing' })
        try {
          const who = await fetchArenaMe(token)
          setState({ status: 'authorized', me: who })
        } catch (e: any) {
          setState({ status: 'error', error: e?.message ?? 'Refresh failed' })
        }
      },
    }
  }, [state, me])

  return api
}


