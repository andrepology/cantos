import { useEffect, useRef, useState } from 'react'
import { searchArena } from '../api'
import type { SearchResult } from '../types'

export type UseArenaSearchState = {
  loading: boolean
  error: string | null
  results: SearchResult[]
}

export function useArenaSearch(query: string, debounceMs: number = 100): UseArenaSearchState {
  const [state, setState] = useState<UseArenaSearchState>({ loading: false, error: null, results: [] })
  const [debouncedQuery, setDebouncedQuery] = useState(query)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Debounce effect
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), debounceMs)
    return () => clearTimeout(id)
  }, [query, debounceMs])

  // Search effect
  useEffect(() => {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    const { signal } = controller

    const q = debouncedQuery.trim()
    if (!q) {
      setState({ loading: false, error: null, results: [] })
      return
    }

    setState((s) => ({ ...s, loading: true, error: null }))

    const per = 100
    const mergedMap = new Map<string, SearchResult>()

    // Fetch page 1 first to render immediately
    searchArena(q, { page: 1, per, signal })
      .then((page1) => {
        for (const item of page1) {
          const key = `${(item as any).kind}-${(item as any).id}`
          if (!mergedMap.has(key)) mergedMap.set(key, item)
        }
        const first = Array.from(mergedMap.values())
        try {
          // eslint-disable-next-line no-console
          console.log('[arena] useArenaSearch page1', { query: q, per, count: first.length })
        } catch {}
        // Show page 1 immediately
        setState({ loading: false, error: null, results: first })

        // Then fetch page 2 and merge when ready
        return searchArena(q, { page: 2, per, signal })
      })
      .then((page2) => {
        if (!page2) return
        for (const item of page2) {
          const key = `${(item as any).kind}-${(item as any).id}`
          if (!mergedMap.has(key)) mergedMap.set(key, item)
        }
        const merged = Array.from(mergedMap.values())
        try {
          // eslint-disable-next-line no-console
          console.log('[arena] useArenaSearch merged2', { query: q, per, mergedCount: merged.length })
        } catch {}
        setState((s) => ({ ...s, results: merged }))
      })
      .catch((e) => {
        if (e.name === 'AbortError') return
        setState({ loading: false, error: e.message ?? 'Error', results: [] })
      })

    return () => controller.abort()
  }, [debouncedQuery])

  return state
}
