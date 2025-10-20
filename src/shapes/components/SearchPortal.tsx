import { useEffect, useRef, useState, useMemo, useLayoutEffect } from 'react'
import type React from 'react'
import { stopEventPropagation } from 'tldraw'
import * as Popover from '@radix-ui/react-popover'
import { useSessionUserChannels, fuzzySearchChannels } from '../../arena/userChannelsStore'
import { useArenaSearch } from '../../arena/hooks/useArenaSearch'
import { useArenaAuth } from '../../arena/hooks/useArenaAuth'
import { useArenaFeed } from '../../arena/hooks/useArenaData'
import { SearchPopover, ArenaSearchPanel } from '../../arena/ArenaSearchResults'
import { CardView } from '../../arena/components/CardRenderer'
import { ProfileCircle } from '../../arena/icons'
import { SHAPE_BACKGROUND, TEXT_SECONDARY, CARD_BACKGROUND, CARD_BORDER_RADIUS, CARD_SHADOW, PROFILE_CIRCLE_BORDER, PROFILE_CIRCLE_SHADOW } from '../../arena/constants'
import type { SearchResult, FeedItem, Card } from '../../arena/types'

// Minimum container width to show chat metadata (profile circles, names, dates)
const CHAT_METADATA_MIN_WIDTH = 216

export interface SearchPortalProps {
  // Initial value and callbacks
  initialValue?: string
  onSearchSelection: (result: any) => void

  // UI state
  isSelected: boolean
  isEditingLabel?: boolean
  editor: any
  shapeId: string

  // Input configuration
  inputType: 'input' | 'textarea'
  placeholder: string
  inputStyle: React.CSSProperties

  // Container styling
  containerStyle?: React.CSSProperties
  containerWidth?: number
  containerHeight?: number
}

export function SearchPortal({
  initialValue = '',
  onSearchSelection,
  isSelected,
  isEditingLabel = false,
  editor,
  shapeId,
  inputType,
  placeholder,
  inputStyle,
  containerStyle = {},
  containerWidth,
  containerHeight,
}: SearchPortalProps) {
  // Internal search state
  const [labelQuery, setLabelQuery] = useState(initialValue)
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)
  const [isFocused, setIsFocused] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const resultsContainerRef = useRef<HTMLDivElement>(null)

  // Get cached user channels (auto-fetch if needed)
  const { channels: cachedChannels } = useSessionUserChannels({ autoFetch: true })

  // Fuzzy search cached channels
  const filteredCachedChannels = useMemo(() => {
    if (!labelQuery.trim()) return cachedChannels
    return fuzzySearchChannels(cachedChannels, labelQuery)
  }, [cachedChannels, labelQuery])

  // API search runs in parallel - DISABLED to avoid continuous API calls
  // const { loading: searching, error: searchError, results: apiResults } = useArenaSearch(labelQuery)
  const searching = false
  const searchError = null
  const apiResults: SearchResult[] = []

  // Get authenticated user for feed
  const { state: authState } = useArenaAuth()
  const userId = authState.status === 'authorized' ? authState.me.id : undefined

  // Prefetch feed once on mount - DISABLED to avoid continuous API calls
  // const { loading: feedLoading, error: feedError, items: feedItems } = useArenaFeed(1, 20)
  const feedLoading = false
  const feedError = null
  const feedItems: FeedItem[] = []

  // Filter out user's own activity - show only activity from followed users
  // Reverse for reverse chronological order (newest first)
  const filteredFeedItems = useMemo(() => {
    return feedItems.filter(item => item.user.id !== userId).reverse()
  }, [feedItems, userId])

  // Convert feed items to cards for rendering
  const feedCards = useMemo(() => {
    return filteredFeedItems.map((item: FeedItem): Card => {
      const baseCard = {
        id: item.item_id,
        createdAt: item.created_at,
        user: item.user,
      }

      if (item.item_type === 'Block') {
        const block = item.item as any
        switch (block.class) {
          case 'Image':
            return {
              ...baseCard,
              type: 'image',
              title: block.title || '',
              url: block.image?.original?.url || block.image?.display?.url || '',
              alt: block.title || 'Image',
              originalDimensions: block.image?.original ? {
                width: block.image?.original?.width || 0,
                height: block.image?.original?.height || 0,
              } : undefined,
            }
          case 'Link':
            return {
              ...baseCard,
              type: 'link',
              title: block.title || block.generated_title || '',
              url: block.source?.url || '',
              imageUrl: block.image?.thumb?.url || block.image?.display?.url,
              provider: block.source?.provider?.name,
            }
          case 'Text':
            return {
              ...baseCard,
              type: 'text',
              title: block.title || '',
              content: block.content || '',
            }
          case 'Media':
            return {
              ...baseCard,
              type: 'media',
              title: block.title || '',
              embedHtml: block.embed?.html || '',
              thumbnailUrl: block.image?.thumb?.url,
              provider: block.source?.provider?.name,
              originalUrl: block.source?.url,
            }
          default:
            return {
              ...baseCard,
              type: 'text',
              title: block.title || 'Block',
              content: block.content || '',
            }
        }
      } else {
        // Channel
        const channel = item.item as any
        return {
          ...baseCard,
          type: 'channel',
          title: channel.title || '',
          slug: channel.slug,
          length: channel.length || 0,
          updatedAt: channel.updated_at,
        }
      }
    })
  }, [filteredFeedItems])

  // Deduplicate API results against cached channels
  const dedupedApiResults = useMemo(() => {
    if (!apiResults.length || !cachedChannels.length) return apiResults
    const cachedChannelSlugs = new Set(cachedChannels.map(ch => ch.slug))
    return apiResults.filter(result =>
      result.kind === 'channel' ? !cachedChannelSlugs.has((result as any).slug) : true
    )
  }, [apiResults, cachedChannels])

  // Convert filtered cached channels to SearchResult format
  const cachedChannelsAsResults = useMemo(() => {
    return filteredCachedChannels.map(channel => ({
      kind: 'channel' as const,
      id: channel.id,
      title: channel.title,
      slug: channel.slug,
      author: channel.author,
      description: undefined, // UserChannelListItem doesn't have description
      length: channel.length,
      updatedAt: channel.updatedAt,
      status: channel.status,
      open: channel.open
    }))
  }, [filteredCachedChannels])

  // Combine results: cached channels first, then deduped API results
  const results = useMemo(() => {
    return [...cachedChannelsAsResults, ...dedupedApiResults]
  }, [cachedChannelsAsResults, dedupedApiResults])

  // Reset highlight as query / results change
  useEffect(() => {
    setHighlightedIndex(results.length > 0 ? 0 : -1)
  }, [labelQuery, results.length])

  // Keep highlighted row in view
  useEffect(() => {
    const container = resultsContainerRef.current
    if (!container) return
    const el = container.querySelector(`[data-index="${highlightedIndex}"]`)
    if (el && 'scrollIntoView' in el) {
      ;(el as HTMLElement).scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex])

  // Auto-resize textarea to fit content
  useLayoutEffect(() => {
    if (inputType !== 'textarea') return
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [labelQuery, inputType])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (results.length === 0) return
      const newIndex = highlightedIndex < 0 ? 0 : (highlightedIndex + 1) % results.length
      setHighlightedIndex(newIndex)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (results.length === 0) return
      const newIndex = highlightedIndex <= 0 ? results.length - 1 : highlightedIndex - 1
      setHighlightedIndex(newIndex)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const chosen = highlightedIndex >= 0 && highlightedIndex < results.length ? results[highlightedIndex] : null
      onSearchSelection(chosen)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      // Could add a callback for escape handling if needed
    }
  }

  const commonInputProps = {
    value: labelQuery,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setLabelQuery(e.target.value),
    placeholder: isFocused ? '' : placeholder,
    onPointerDown: stopEventPropagation,
    onPointerUp: stopEventPropagation,
    onFocus: () => {
      setIsFocused(true)
      if (!isSelected) editor.setSelectedShapes([shapeId])
    },
    onBlur: () => {
      setIsFocused(false)
      // If nothing was typed, reset to empty so placeholder shows
      if (!labelQuery.trim()) {
        setLabelQuery('')
      }
    },
    onWheel: (e: React.WheelEvent) => {
      // allow native scrolling inside inputs; just avoid bubbling to the canvas
      e.stopPropagation()
    },
    onTouchStart: (e: React.TouchEvent) => { e.preventDefault() },
    onTouchMove: (e: React.TouchEvent) => { e.preventDefault() },
    onTouchEnd: (e: React.TouchEvent) => { e.preventDefault() },
    onKeyDown: handleKeyDown,
    style: inputStyle,
  }


  return (
    <div
      data-interactive="search"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        ...containerStyle,
      }}
    >
      {/* Search section */}
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
        }}
      >
        <SearchPopover
          open={isFocused}
          side="bottom"
          align="center"
          sideOffset={4}
          avoidCollisions={false}
          query={labelQuery}
          searching={searching}
          error={searchError}
          results={results}
          highlightedIndex={highlightedIndex}
          onHoverIndex={setHighlightedIndex}
          onSelect={(r: any) => onSearchSelection(r)}
          containerRef={resultsContainerRef}
        >
          {inputType === 'textarea' ? (
            <textarea
              data-interactive="input"
              ref={textareaRef}
              rows={1}
              {...commonInputProps}
            />
          ) : (
            <input
              data-interactive="input"
              ref={inputRef}
              {...commonInputProps}
            />
          )}
        </SearchPopover>
      </div>
    </div>
  )
}
