import { useEffect, useState } from 'react'
import { fetchArenaChannel, searchArenaChannels, searchArena, fetchArenaUserChannels, fetchArenaBlockDetails, fetchConnectedChannels } from '../api'
import type { Card, ArenaUser, ChannelSearchResult, SearchResult, UserChannelListItem, ArenaBlockDetails, ConnectedChannel } from '../types'

export type UseArenaState = {
  loading: boolean
  error: string | null
  cards: Card[]
  author?: ArenaUser
  title?: string
}

export function useArenaChannel(slug: string | undefined): UseArenaState {
  const [state, setState] = useState<UseArenaState>({ loading: false, error: null, cards: [], author: undefined, title: undefined })

  useEffect(() => {
    let cancelled = false
    if (!slug) {
      setState({ loading: false, error: null, cards: [], author: undefined, title: undefined })
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    fetchArenaChannel(slug)
      .then((data) => !cancelled && setState({ loading: false, error: null, cards: data.cards, author: data.author, title: data.title }))
      .catch((e) => !cancelled && setState({ loading: false, error: e.message ?? 'Error', cards: [], author: undefined, title: undefined }))
    return () => {
      cancelled = true
    }
  }, [slug])

  return state
}


export type UseArenaSearchState = {
  loading: boolean
  error: string | null
  results: ChannelSearchResult[]
}

export function useArenaChannelSearch(query: string, debounceMs: number = 250): UseArenaSearchState {
  const [state, setState] = useState<UseArenaSearchState>({ loading: false, error: null, results: [] })
  const [debouncedQuery, setDebouncedQuery] = useState(query)

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), debounceMs)
    return () => clearTimeout(id)
  }, [query, debounceMs])

  useEffect(() => {
    let cancelled = false
    const q = debouncedQuery.trim()
    if (!q) {
      setState({ loading: false, error: null, results: [] })
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    searchArenaChannels(q)
      .then((results) => !cancelled && setState({ loading: false, error: null, results }))
      .catch((e) => !cancelled && setState({ loading: false, error: e.message ?? 'Error', results: [] }))
    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  return state
}


export type UseMixedSearchState = {
  loading: boolean
  error: string | null
  results: SearchResult[]
}

export function useArenaSearch(query: string, debounceMs: number = 250): UseMixedSearchState {
  const [state, setState] = useState<UseMixedSearchState>({ loading: false, error: null, results: [] })
  const [debouncedQuery, setDebouncedQuery] = useState(query)

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), debounceMs)
    return () => clearTimeout(id)
  }, [query, debounceMs])

  useEffect(() => {
    let cancelled = false
    const q = debouncedQuery.trim()
    if (!q) {
      setState({ loading: false, error: null, results: [] })
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    searchArena(q)
      .then((results) => !cancelled && setState({ loading: false, error: null, results }))
      .catch((e) => !cancelled && setState({ loading: false, error: e.message ?? 'Error', results: [] }))
    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  return state
}

export type UseArenaUserChannelsState = {
  loading: boolean
  error: string | null
  channels: UserChannelListItem[]
}

export function useArenaUserChannels(
  userId: number | undefined,
  username: string | undefined,
  page: number = 1,
  per: number = 50
): UseArenaUserChannelsState {
  const [state, setState] = useState<UseArenaUserChannelsState>({ loading: false, error: null, channels: [] })

  useEffect(() => {
    let cancelled = false
    if (!userId) {
      setState({ loading: false, error: null, channels: [] })
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    fetchArenaUserChannels(userId, username, page, per)
      .then((channels) => !cancelled && setState({ loading: false, error: null, channels }))
      .catch((e) => !cancelled && setState({ loading: false, error: e.message ?? 'Error', channels: [] }))
    return () => {
      cancelled = true
    }
  }, [userId, username, page, per])

  return state
}

// Lazily fetch a block's details + connections. Enabled gating prevents extra calls while the
// block isn't selected/visible. Small dedupe avoids simultaneous requests for the same id.
const inflight = new Map<number, Promise<ArenaBlockDetails>>()
export function useArenaBlock(blockId: number | undefined, enabled: boolean): {
  loading: boolean
  error: string | null
  details: ArenaBlockDetails | null
} {
  const [state, setState] = useState<{ loading: boolean; error: string | null; details: ArenaBlockDetails | null }>({ loading: false, error: null, details: null })

  useEffect(() => {
    let cancelled = false
    if (!blockId || !enabled) {
      setState({ loading: false, error: null, details: null })
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))

    const run = () => {
      if (inflight.has(blockId)) return inflight.get(blockId)!
      const p = fetchArenaBlockDetails(blockId)
      inflight.set(blockId, p)
      p.finally(() => inflight.delete(blockId))
      return p
    }

    run()
      .then((details) => !cancelled && setState({ loading: false, error: null, details }))
      .catch((e) => !cancelled && setState({ loading: false, error: e.message ?? 'Error', details: null }))

    return () => {
      cancelled = true
    }
  }, [blockId, enabled])

  return state
}

// For a given channel (id or slug), fetch connected channels list lazily
const inflightChannels = new Map<string | number, Promise<ConnectedChannel[]>>()
export function useConnectedChannels(channelIdOrSlug: number | string | undefined, enabled: boolean): {
  loading: boolean
  error: string | null
  connections: ConnectedChannel[]
} {
  const [state, setState] = useState<{ loading: boolean; error: string | null; connections: ConnectedChannel[] }>({ loading: false, error: null, connections: [] })

  useEffect(() => {
    let cancelled = false
    if (!channelIdOrSlug || !enabled) {
      setState({ loading: false, error: null, connections: [] })
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))

    const key = channelIdOrSlug
    const run = () => {
      if (inflightChannels.has(key)) return inflightChannels.get(key)!
      const p = fetchConnectedChannels(key)
      inflightChannels.set(key, p)
      p.finally(() => inflightChannels.delete(key))
      return p
    }

    run()
      .then((connections) => !cancelled && setState({ loading: false, error: null, connections }))
      .catch((e) => !cancelled && setState({ loading: false, error: e.message ?? 'Error', connections: [] }))

    return () => {
      cancelled = true
    }
  }, [channelIdOrSlug, enabled])

  return state
}

