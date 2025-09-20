import { useEffect, useState } from 'react'
import { fetchArenaChannel, searchArenaChannels, searchArena, fetchArenaUserChannels } from './api'
import type { Card, ArenaUser, ChannelSearchResult, SearchResult, UserChannelListItem } from './types'

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

