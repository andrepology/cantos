import { useEffect, useRef, useState } from 'react'
import { searchArena } from '../api'
import type { SearchResult } from '../types'

export type UseArenaSearchState = {
  loading: boolean
  error: string | null
  results: SearchResult[]
}

export function useArenaSearch(query: string, debounceMs: number = 50, fallbackTruncateChars: number = 8): UseArenaSearchState {
  const [state, setState] = useState<UseArenaSearchState>({ loading: false, error: null, results: [] })
  const [debouncedQuery, setDebouncedQuery] = useState(query)
  const historyRef = useRef<SearchResult[][]>([])
  const previousQueryRef = useRef<string>('')
  const abortControllerRef = useRef<AbortController | null>(null)

  // Debounce effect
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), debounceMs)
    return () => clearTimeout(id)
  }, [query, debounceMs])

  // Check if current query is a prefix/suffix extension of previous query
  const isRelatedQuery = (current: string, previous: string): boolean => {
    if (!previous) return false
    const currentLower = current.toLowerCase()
    const previousLower = previous.toLowerCase()

    // Check if current is a prefix of previous (typing forward)
    // e.g., 'cellular a' -> 'cellular automa'
    if (previousLower.startsWith(currentLower)) return true

    // Check if current is an extension of previous (adding characters)
    // e.g., 'cellular' -> 'cellular a'
    if (currentLower.startsWith(previousLower)) return true

    // Check if current is a suffix of previous (backspacing)
    // e.g., 'cellular automa' -> 'cellular a'
    if (previousLower.endsWith(currentLower)) return true

    // Check if previous is an extension of current (removing characters)
    // e.g., 'cellular a' -> 'cellular'
    if (previousLower.startsWith(currentLower)) return true

    return false
  }

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

    const mergeWithHistory = (newResults: SearchResult[]): SearchResult[] => {
      // Only merge history if query is related to previous query
      if (!isRelatedQuery(q, previousQueryRef.current)) {
        return newResults
      }

      const map = new Map<string, SearchResult>()
      for (const list of [newResults, ...historyRef.current.slice(0, 2)]) {
        for (const item of list) {
          const key = `${(item as any).kind}-${(item as any).id}`
          if (!map.has(key)) map.set(key, item)
        }
      }
      return Array.from(map.values())
    }

    const updateHistory = (results: SearchResult[]) => {
      historyRef.current = [results, ...historyRef.current].slice(0, 2)
      previousQueryRef.current = q
    }

    searchArena(q, { signal })
      .then((results) => {
        if (results.length > 0) {
          const merged = mergeWithHistory(results)
          setState({ loading: false, error: null, results: merged })
          updateHistory(results)
        } else {
          // Show history, then try fallback
          const historyResults = mergeWithHistory([])
          setState({ loading: false, error: null, results: historyResults })

          // Fallback: truncate tokens to first N chars for fuzzy matching
          // This heuristic tries to find partial matches by shortening search terms,
          // assuming that the first few characters are most distinctive for matching
          const fallbackQuery = q
            .split(/\s+/)
            .map((t) => t.slice(0, fallbackTruncateChars))
            .filter(Boolean)
            .join(' ')

          if (fallbackQuery && fallbackQuery !== q) {
            searchArena(fallbackQuery, { signal })
              .then((fbResults) => {
                if (fbResults.length > 0) {
                  const merged = mergeWithHistory(fbResults)
                  setState({ loading: false, error: null, results: merged })
                  updateHistory(fbResults)
                }
              })
              .catch(() => {}) // Silent fail
          }
        }
      })
      .catch((e) => {
        if (e.name === 'AbortError') return
        const historyResults = mergeWithHistory([])
        setState({ loading: false, error: e.message ?? 'Error', results: historyResults })
      })

    return () => controller.abort()
  }, [debouncedQuery])

  return state
}
