import { useEffect, useMemo, useRef, useState } from 'react'
import { useAccount } from 'jazz-tools/react'
import { Account } from '../../jazz/schema'
import { 
  buildArenaAuthorizeUrl, 
  clearUrlHash, 
  fetchArenaMe, 
  getArenaConfig, 
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
    try {
      const dbgMeStatus = me === undefined ? 'undefined' : me ? 'present' : 'null'
      // register token provider - no logging
    } catch {}
    setArenaAccessTokenProvider(() => {
      const t = me?.root?.arena?.accessToken as string | undefined
       try {
         // token provider invoked - no logging
       } catch {}
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
    try { /* applyUrl: writing token to Jazz - no logging */ } catch {}
    writeArenaPrivate(me, { accessToken: tokenFromUrl, authorizedAt: Date.now() })
    try { window.localStorage.setItem('arenaAccessToken', tokenFromUrl) } catch {}
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
    if (me === undefined) return
    let last = me?.root?.arena?.accessToken || null
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


