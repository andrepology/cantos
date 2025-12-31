import { useState, useEffect, useRef, useMemo } from 'react'
import type { PortalSourceOption } from '../../../arena/search/portalSearchTypes'
import { searchArena } from '../../../arena/api'
import type { SearchResult } from '../../../arena/types'
import { useMyChannels } from '../../../arena/hooks/useMyChannels'
import { fuzzySearchChannels } from '../../../arena/utils/fuzzySearch'

export function useAddressBarSearch(_initialOptions: PortalSourceOption[], initialQuery: string = '') {
  const [query, setQuery] = useState(initialQuery)
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery)
  const [loading, setLoading] = useState(false)
  const [fetchedResults, setFetchedResults] = useState<PortalSourceOption[]>([])
  
  // Read user's channels from Jazz (passive - no proactive sync)
  const { channels: myChannels, loading: myChannelsLoading } = useMyChannels()
  
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
    const q = query.trim()
    
    // If user has typed something, first fuzzy-search local channels
    if (q) {
      // Fuzzy search over my channels (just the title/slug)
      const localMatches = fuzzySearchChannels(myChannels, q)
      
      // Convert to PortalSourceOptions
      const localOptions: PortalSourceOption[] = localMatches.map(ch => ({
        kind: 'channel' as const,
        channel: {
          id: 0, // We don't have ID in simplified version - not needed for display
          slug: ch.slug,
          title: ch.title,
          length: ch.length,
        }
      }))
      
      // Combine local + fetched results (local first, avoid duplicates)
      const localSlugs = new Set(localMatches.map(ch => ch.slug))
      const combined: PortalSourceOption[] = [...localOptions]
      
      for (const result of fetchedResults) {
        if (result.kind === 'channel' && !localSlugs.has(result.channel.slug)) {
          combined.push(result)
        } else if (result.kind === 'author') {
          combined.push(result)
        }
      }
      
      return combined
    }
    
    // Default: show my channels as options
    return myChannels.map(ch => ({
      kind: 'channel' as const,
      channel: {
        id: 0, // Not needed for display
        slug: ch.slug,
        title: ch.title,
        length: ch.length,
      }
    }))
  }, [query, myChannels, fetchedResults])

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
    loading: loading || myChannelsLoading
  }
}
