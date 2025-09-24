import { useEffect, useMemo, useRef, useState } from 'react'
import { useAccount } from 'jazz-tools/react'
import { Account } from '../jazz/schema'
import { buildArenaAuthorizeUrl, clearUrlHash, fetchArenaMe, getArenaConfig, parseArenaTokenFromHash, parseArenaTokenFromSearch } from './auth'
import type { ArenaUser } from './types'

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
  const { me } = useAccount(Account)
  const [state, setState] = useState<ArenaAuthState>({ status: 'idle' })
  const bootstrapped = useRef(false)

  // Single bootstrap effect: handle token from URL first; otherwise validate stored token.
  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true

    const parsed = parseArenaTokenFromSearch(window.location.search) || parseArenaTokenFromHash(window.location.hash)
    const tokenFromUrl = parsed?.accessToken

    const useToken = async (token: string, cleanupUrl: boolean) => {
      setState({ status: 'authorizing' })
      try {
        const who = await fetchArenaMe(token)
        try { window.localStorage.setItem('arenaAccessToken', token) } catch {}
        if (me) {
          writeArenaPrivate(me, {
            accessToken: token,
            userId: who.id,
            slug: who.username,
            name: who.full_name,
            avatarUrl: who.avatar ?? undefined,
            authorizedAt: Date.now(),
          })
        }
        setState({ status: 'authorized', me: who })
      } catch (e: any) {
        if (me) clearArenaPrivate(me)
        try { window.localStorage.removeItem('arenaAccessToken') } catch {}
        setState({ status: 'error', error: e?.message ?? 'Auth failed' })
      } finally {
        if (cleanupUrl) {
          try {
            const url = new URL(window.location.href)
            url.hash = ''
            url.searchParams.delete('arena_access_token')
            url.searchParams.delete('state')
            window.history.replaceState(null, document.title, `${url.pathname}${url.search}`)
          } catch {}
        }
      }
    }

    if (tokenFromUrl) {
      useToken(tokenFromUrl, true)
      return
    }

    let token: string | undefined = me?.root?.arena?.accessToken as string | undefined
    if (!token) {
      try { token = window.localStorage.getItem('arenaAccessToken') || undefined } catch {}
    }
    if (!token) return
    useToken(token, false)
  }, [me])

  // Passive backfill: if authorized and Jazz lacks the token, write it without network calls.
  useEffect(() => {
    if (state.status !== 'authorized') return
    if (!me) return
    const hasAccountToken = !!me.root?.arena?.accessToken
    if (hasAccountToken) return
    let token: string | undefined
    try { token = window.localStorage.getItem('arenaAccessToken') || undefined } catch {}
    if (token) {
      writeArenaPrivate(me, { accessToken: token, authorizedAt: Date.now() })
    }
  }, [state.status, me])

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
        if (me) clearArenaPrivate(me)
        try { window.localStorage.removeItem('arenaAccessToken') } catch {}
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


