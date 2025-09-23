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

  // Handle callback hash once on mount
  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true
    const parsed = parseArenaTokenFromSearch(window.location.search) || parseArenaTokenFromHash(window.location.hash)
    if (parsed?.accessToken) {
      setState({ status: 'authorizing' })
      ;(async () => {
        try {
          const who = await fetchArenaMe(parsed.accessToken)
          try { window.localStorage.setItem('arenaAccessToken', parsed.accessToken) } catch {}
          if (me) {
            writeArenaPrivate(me, {
              accessToken: parsed.accessToken,
              userId: who.id,
              slug: who.username,
              name: who.full_name,
              avatarUrl: who.avatar ?? undefined,
              authorizedAt: Date.now(),
            })
          }
          setState({ status: 'authorized', me: who })
        } catch (e: any) {
          setState({ status: 'error', error: e?.message ?? 'Auth failed' })
        } finally {
          try {
            const url = new URL(window.location.href)
            url.hash = ''
            url.searchParams.delete('arena_access_token')
            url.searchParams.delete('state')
            window.history.replaceState(null, document.title, `${url.pathname}${url.search}`)
          } catch {}
        }
      })()
      return
    }
  }, [me])

  // Validate stored token on boot (when present)
  useEffect(() => {
    const fromAccount = me?.root?.arena?.accessToken as string | undefined
    let token: string | undefined = fromAccount
    if (!token) {
      try { token = window.localStorage.getItem('arenaAccessToken') || undefined } catch {}
    }
    if (!token) return
    setState((s) => (s.status === 'idle' ? { status: 'authorizing' } : s))
    ;(async () => {
      try {
        const who = await fetchArenaMe(token!)
        if (me && !fromAccount) {
          writeArenaPrivate(me, { accessToken: token!, authorizedAt: Date.now() })
        }
        setState({ status: 'authorized', me: who })
      } catch (e) {
        if (me) clearArenaPrivate(me)
        try { window.localStorage.removeItem('arenaAccessToken') } catch {}
        setState({ status: 'idle' })
      }
    })()
  }, [me?.root?.arena?.accessToken])

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


