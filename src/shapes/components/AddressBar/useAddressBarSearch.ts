import { useState, useEffect, useMemo, useRef } from 'react'
import type { PortalSourceOption } from '../../../arena/search/portalSearchTypes'
import { fuzzySearchChannels } from '../../../arena/utils/fuzzySearch'
import { searchArena } from '../../../arena/api'
import type { SearchResult } from '../../../arena/types'

type SearchableOption = {
  option: PortalSourceOption
  title?: string
  slug?: string
}

type ArenaSearchState = {
  results: PortalSourceOption[]
  loading: boolean
}

const MIN_REMOTE_QUERY_LEN = 2

function optionKey(option: PortalSourceOption): string {
  if (option.kind === 'channel') {
    return `channel:${option.channel.slug || option.channel.id}`
  }
  return `author:${option.author.id}`
}

export function useAddressBarSearch(options: PortalSourceOption[], initialQuery: string = '') {
  const [query, setQuery] = useState(initialQuery)
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery)
  const [arenaSearch, setArenaSearch] = useState<ArenaSearchState>({
    results: [],
    loading: false,
  })
  const isFirstRun = useRef(true)

  const searchableOptions = useMemo<SearchableOption[]>(() => {
    const channelOptions = options.filter((option) => option.kind === 'channel')
    return channelOptions.map((option) => ({
      option,
      title: option.kind === 'channel' ? option.channel.title : undefined,
      slug: option.kind === 'channel' ? option.channel.slug : undefined,
    }))
  }, [options])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const q = debouncedQuery.trim()
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    if (!q) {
      setArenaSearch({ results: [], loading: false })
      return
    }
    if (q.length < MIN_REMOTE_QUERY_LEN) {
      setArenaSearch({ results: [], loading: false })
      return
    }

    const controller = new AbortController()
    setArenaSearch({ results: [], loading: true })

    searchArena(q, { page: 1, per: 20, signal: controller.signal })
      .then((results) => {
        if (controller.signal.aborted) return

        const mapped: PortalSourceOption[] = results.map((item: SearchResult) => {
          if (item.kind === 'channel') {
            return {
              kind: 'channel',
              channel: {
                id: item.id,
                title: item.title,
                slug: item.slug,
                length: item.length,
                author: item.author
                  ? {
                      id: item.author.id,
                      fullName: item.author.full_name,
                      avatarThumb:
                        typeof item.author.avatar === 'string'
                          ? item.author.avatar
                          : item.author.avatar?.thumb,
                    }
                  : undefined,
              },
            }
          }
          return {
            kind: 'author',
            author: {
              id: item.id,
              fullName: item.full_name,
              avatarThumb: item.avatar || undefined,
            },
          }
        })

        setArenaSearch({ results: mapped, loading: false })
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        console.error('AddressBar search failed:', err)
        setArenaSearch({ results: [], loading: false })
      })

    return () => controller.abort()
  }, [debouncedQuery])

  // Determine which options to show
  const filteredOptions = useMemo(() => {
    const q = query.trim()
    if (!q) return options

    const matches = fuzzySearchChannels(searchableOptions, q)
    const localMatches = matches.map((match) => match.option)
    if (arenaSearch.results.length === 0) return localMatches

    const seen = new Set(localMatches.map(optionKey))
    const merged = [...localMatches]
    for (const option of arenaSearch.results) {
      const key = optionKey(option)
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(option)
    }
    return merged
  }, [options, query, arenaSearch.results, searchableOptions])

  // Highlight logic
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  // Reset highlight when options change, but only if not already highlighted
  useEffect(() => {
    setHighlightedIndex((prev) => {
      if (filteredOptions.length === 0) return -1
      if (prev === -1) return 0
      if (prev >= filteredOptions.length) return filteredOptions.length - 1
      return prev
    })
  }, [filteredOptions])

  return {
    query,
    setQuery,
    filteredOptions,
    highlightedIndex,
    setHighlightedIndex,
    loading: arenaSearch.loading,
  }
}
