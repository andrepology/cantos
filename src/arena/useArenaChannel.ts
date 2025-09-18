import { useEffect, useState } from 'react'
import { fetchArenaChannel, searchArenaChannels } from './api'
import type { Card, ArenaUser, ChannelSearchResult } from './types'

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

