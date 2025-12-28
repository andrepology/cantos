import { useState, useMemo, useCallback, useEffect } from 'react'
import type { PortalSourceOption } from '../../../arena/search/portalSearchTypes'

export function useAddressBarSearch(options: PortalSourceOption[], initialQuery: string = '') {
  const [query, setQuery] = useState(initialQuery)
  
  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options
    const lower = query.trim().toLowerCase()
    return options.filter((option) => {
      const title =
        option.kind === 'channel'
          ? option.channel.title || option.channel.slug
          : option.author.fullName
      return title?.toLowerCase().includes(lower)
    })
  }, [options, query])

  const [highlightedIndex, setHighlightedIndex] = useState(() =>
    filteredOptions.length > 0 ? 0 : -1
  )

  useEffect(() => {
    setHighlightedIndex(filteredOptions.length > 0 ? 0 : -1)
  }, [filteredOptions])

  const updateQuery = useCallback((value: string) => {
    setQuery(value)
  }, [])

  return {
    query,
    setQuery: updateQuery,
    filteredOptions,
    highlightedIndex,
    setHighlightedIndex,
  }
}
