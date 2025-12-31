import { useState, useEffect, useRef, useMemo } from 'react'
import type { PortalSourceOption } from '../../../arena/search/portalSearchTypes'
import { searchArena } from '../../../arena/api'
import type { SearchResult } from '../../../arena/types'

export function useAddressBarSearch(_initialOptions: PortalSourceOption[], initialQuery: string = '') {
  const [query, setQuery] = useState(initialQuery)
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery)
  const [loading, setLoading] = useState(false)
  const [fetchedResults, setFetchedResults] = useState<PortalSourceOption[]>([])
  
  // Debounce query updates
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const isFirstRun = useRef(true)

  // Async search effect
  useEffect(() => {
    const q = debouncedQuery.trim()
    
    // Skip the very first run to avoid fetching the same channel
    // unless the user explicitly cleared it or typed something new.
    if (isFirstRun.current) {
      isFirstRun.current = false
      return 
    }
    
    // If empty, reset results
    if (!q) {
      setLoading(false)
      setFetchedResults([])
      return
    }

    setLoading(true)
    const controller = new AbortController()

    searchArena(q, { page: 1, per: 20, signal: controller.signal })
      .then((results) => {
        if (controller.signal.aborted) return

        // Map SearchResult[] -> PortalSourceOption[]
        const mapped: PortalSourceOption[] = results.map((item: SearchResult) => {
          if (item.kind === 'channel') {
            return {
              kind: 'channel',
              channel: {
                id: item.id,
                title: item.title,
                slug: item.slug,
                length: item.length,
                author: item.author ? {
                  id: item.author.id,
                  fullName: item.author.full_name,
                  avatarThumb: typeof item.author.avatar === 'string' ? item.author.avatar : item.author.avatar?.thumb
                } : undefined
              }
            }
          } else {
            return {
              kind: 'author',
              author: {
                id: item.id,
                fullName: item.full_name,
                avatarThumb: item.avatar || undefined
              }
            }
          }
        })
        
        setFetchedResults(mapped)
        setLoading(false)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        console.error('AddressBar search failed:', err)
        setFetchedResults([])
        setLoading(false)
      })

    return () => {
        controller.abort()
    }
  }, [debouncedQuery])

  // Determine which options to show
  const filteredOptions = useMemo(() => {
    // Show fetched results from Arena API search
    return fetchedResults
  }, [fetchedResults])

  // Highlight logic
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  // Reset highlight when options change
  useEffect(() => {
    setHighlightedIndex(filteredOptions.length > 0 ? 0 : -1)
  }, [filteredOptions])

  return {
    query,
    setQuery,
    filteredOptions,
    highlightedIndex,
    setHighlightedIndex,
    loading
  }
}
