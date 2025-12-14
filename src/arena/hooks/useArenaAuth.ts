import { useEffect, useMemo, useRef, useState } from 'react'
import { useAccount } from 'jazz-tools/react'
import { Account, ArenaPrivate } from '../../jazz/schema'
import { 
  buildArenaAuthorizeUrl, 
  fetchArenaMe, 
  parseArenaTokenFromHash, 
  parseArenaTokenFromSearch 
} from '../auth'
import type { ArenaUser } from '../types'
import { setArenaAccessTokenProvider } from '../token'

export type ArenaAuthState =
  | { status: 'idle' }
  | { status: 'authorizing' }
  | { status: 'authorized'; me: ArenaUser }
  | { status: 'error'; error: string }

function ensureArenaPrivate(me: any) {
  const root = me?.root
  if (!root) return null
  if (!root.arena) {
    try {
      root.$jazz.set('arena', ArenaPrivate.create({}))
    } catch {}
  }
  return root.arena ?? null
}

function writeArenaPrivate(me: any, data: {
  accessToken?: string
  userId?: number
  slug?: string
  name?: string
  avatarUrl?: string | null
  authorizedAt?: number
}) {
  if (!me?.$isLoaded) return
  const arena = ensureArenaPrivate(me)
  if (!arena) return
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) {
      try {
        arena.$jazz.delete(k as any)
      } catch {}
      continue
    }
    try {
      arena.$jazz.set(k as any, v as any)
    } catch {}
  }
}

function clearArenaPrivate(me: any) {
  if (!me?.$isLoaded) return
  const arena = ensureArenaPrivate(me)
  if (!arena) return
  for (const k of ['accessToken', 'userId', 'slug', 'name', 'avatarUrl', 'authorizedAt'] as const) {
    try {
      arena.$jazz.delete(k as any)
    } catch {}
  }
}

export function useArenaAuth() {
  const me = useAccount(Account, { resolve: { root: { arena: true } } } as any)
  const [state, setState] = useState<ArenaAuthState>({ status: 'idle' })
  const lastValidatedTokenRef = useRef<string | null>(null)
  const appliedUrlTokenRef = useRef(false)
  const verifyingTokenRef = useRef<string | null>(null)


  const cachedUser: ArenaUser | null = useMemo(() => {
    if (!me?.$isLoaded) return null
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
    try {
      const dbgMeStatus = me?.$isLoaded ? 'loaded' : 'loading'
      // register token provider - no logging
    } catch {}
    setArenaAccessTokenProvider(() => {
      const t = (me as any)?.root?.arena?.accessToken as string | undefined
       try {
         // token provider invoked - no logging
       } catch {}
      return t && t.trim() ? t.trim() : undefined
    })
    return () => setArenaAccessTokenProvider(null)
  }, [me])

  // 1) Apply URL token once:
  //    - persist to localStorage immediately
  //    - clean the URL immediately (avoid getting "stuck" with query params)
  //    - write into Jazz when the account is available
  useEffect(() => {
    const parsed = parseArenaTokenFromSearch(window.location.search) || parseArenaTokenFromHash(window.location.hash)
    const tokenFromUrl = parsed?.accessToken?.trim()
    if (!tokenFromUrl) return
    if (appliedUrlTokenRef.current) return
    try { /* applyUrl: writing token to Jazz - no logging */ } catch {}
    try { window.localStorage.setItem('arenaAccessToken', tokenFromUrl) } catch {}
    appliedUrlTokenRef.current = true
    try {
      const url = new URL(window.location.href)
      url.hash = ''
      url.searchParams.delete('arena_access_token')
      url.searchParams.delete('state')
      window.history.replaceState(null, document.title, `${url.pathname}${url.search}`)
    } catch {}
    if (me?.$isLoaded) {
      writeArenaPrivate(me, { accessToken: tokenFromUrl, authorizedAt: Date.now() })
    }
  }, [me])

  // 2) Verify Jazz token once (optional), set authorized state (optimistic from cache)
  useEffect(() => {
    if (!me?.$isLoaded) return
    let token = ((me as any)?.root?.arena?.accessToken as string | undefined)?.trim()
    try { /* verify: token present - no logging */ } catch {}
    if (!token) {
      // Durability fallback: hydrate from localStorage if Jazz hasn't synced yet
      try {
        const ls = window.localStorage.getItem('arenaAccessToken') || ''
        if (ls && ls.trim() && me) {
          token = ls.trim()
          // verify: hydrating token from localStorage fallback - no logging
          writeArenaPrivate(me, { accessToken: token, authorizedAt: Date.now() })
        }
      } catch {}
      if (!token) {
        setState({ status: 'idle' })
        return
      }
    }
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
        writeArenaPrivate(me, {
          accessToken: token,
          userId: who.id,
          slug: who.username,
          name: who.full_name,
          avatarUrl: who.avatar ?? null,
          authorizedAt: Date.now(),
        })
        try {
          if (me?.profile && who?.full_name) {
            me.profile.$jazz.set('name', who.full_name)
          }
        } catch {}
        try { /* verify: success - no logging */ } catch {}
      })
      .catch((e: any) => {
        verifyingTokenRef.current = null
        try { /* verify: error - no logging */ } catch {}
        // Keep optimistic authorized if we had cache; otherwise surface error
        if (!cachedUser) setState({ status: 'error', error: e?.message ?? 'Auth failed' })
      })
  }, [me, cachedUser])

  // No pending write path; URL token write happens only when present



  // Short-lived sampler after mount to track arena token changes (helps diagnose refresh clears)
  useEffect(() => {
    if (!me?.$isLoaded) return
    let last = (me as any)?.root?.arena?.accessToken || null
    let ticks = 0
    const id = setInterval(() => {
      ticks++
      const cur = (me as any)?.root?.arena?.accessToken || null
      if (cur !== last) {
        try {
          // sampler: arena.accessToken changed - no logging
        } catch {}
        last = cur
      }
      if (ticks >= 8) clearInterval(id) // ~4s
    }, 500)
    return () => clearInterval(id)
  }, [me])

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
        try { /* logout invoked - no logging */ } catch {}
        if (me?.$isLoaded) clearArenaPrivate(me)
        try { window.localStorage.removeItem('arenaAccessToken') } catch {}
        setState({ status: 'idle' })
      },
      refresh: async () => {
        if (!me?.$isLoaded) return
        const token = (me as any)?.root?.arena?.accessToken as string | undefined
        if (!token) return
        setState({ status: 'authorizing' })
        try {
          const who = await fetchArenaMe(token)
          setState({ status: 'authorized', me: who })
          writeArenaPrivate(me, {
            accessToken: token,
            userId: who.id,
            slug: who.username,
            name: who.full_name,
            avatarUrl: who.avatar ?? null,
            authorizedAt: Date.now(),
          })
          try {
            if (me?.profile && who?.full_name) {
              me.profile.$jazz.set('name', who.full_name)
            }
          } catch {}
        } catch (e: any) {
          setState({ status: 'error', error: e?.message ?? 'Refresh failed' })
        }
      },
    }
  }, [state, me])

  return api
}

