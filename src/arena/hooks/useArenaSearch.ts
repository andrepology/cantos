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

    const per = 50
    const pages = [1, 2]

    Promise.all(
      pages.map((page) => searchArena(q, { page, per, signal }))
    )
      .then((pagesResults) => {
        const mergedMap = new Map<string, SearchResult>()
        for (const results of pagesResults) {
          for (const item of results) {
            const key = `${(item as any).kind}-${(item as any).id}`
            if (!mergedMap.has(key)) mergedMap.set(key, item)
          }
        }
        const merged = Array.from(mergedMap.values())
        // Log for verification
        try {
          // eslint-disable-next-line no-console
          console.log('[arena] useArenaSearch merged', { query: q, per, pages: pages.length, mergedCount: merged.length })
        } catch {}
        setState({ loading: false, error: null, results: merged })
      })
      .catch((e) => {
        if (e.name === 'AbortError') return
        setState({ loading: false, error: e.message ?? 'Error', results: [] })
      })

    return () => controller.abort()
  }, [debouncedQuery])

  return state
}
