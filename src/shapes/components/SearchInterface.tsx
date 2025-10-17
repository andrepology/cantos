import { useEffect, useRef, useState, useMemo, useLayoutEffect } from 'react'
import type React from 'react'
import { stopEventPropagation } from 'tldraw'
import * as Popover from '@radix-ui/react-popover'
import { useSessionUserChannels, fuzzySearchChannels } from '../../arena/userChannelsStore'
import { useArenaSearch } from '../../arena/hooks/useArenaSearch'
import { SearchPopover, ArenaSearchPanel } from '../../arena/ArenaSearchResults'
import { SHAPE_BACKGROUND, TEXT_SECONDARY } from '../../arena/constants'
import type { SearchResult } from '../../arena/types'

export interface SearchInterfaceProps {
  // Initial value and callbacks
  initialValue?: string
  onSearchSelection: (result: any) => void

  // UI state
  isSelected: boolean
  editor: any
  shapeId: string

  // Input configuration
  inputType: 'input' | 'textarea'
  placeholder: string
  inputStyle: React.CSSProperties

  // Container styling
  containerStyle?: React.CSSProperties

  // Positioning
  portal?: boolean
}

export function SearchInterface({
  initialValue = '',
  onSearchSelection,
  isSelected,
  editor,
  shapeId,
  inputType,
  placeholder,
  inputStyle,
  containerStyle = {},
  portal = true,
}: SearchInterfaceProps) {
  // Internal search state
  const [labelQuery, setLabelQuery] = useState(initialValue)
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)

  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const resultsContainerRef = useRef<HTMLDivElement>(null)

  // Get cached user channels (no auto-fetch)
  const { channels: cachedChannels } = useSessionUserChannels({ autoFetch: false })

  // Fuzzy search cached channels
  const filteredCachedChannels = useMemo(() => {
    if (!labelQuery.trim()) return cachedChannels
    return fuzzySearchChannels(cachedChannels, labelQuery)
  }, [cachedChannels, labelQuery])

  // API search runs in parallel
  const { loading: searching, error: searchError, results: apiResults } = useArenaSearch(labelQuery)

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
    placeholder,
    onPointerDown: stopEventPropagation,
    onPointerUp: stopEventPropagation,
    onFocus: () => { if (!isSelected) editor.setSelectedShapes([shapeId]) },
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

  if (portal) {
    return (
      <div
        data-interactive="search"
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          ...containerStyle,
        }}
        onPointerDown={(e) => {
          // Allow events to bubble up for HTMLContainer to handle via isInteractiveTarget
          // Only stop propagation for elements that should be handled locally
        }}
        onPointerUp={stopEventPropagation}
        onWheel={(e) => { e.stopPropagation() }}
        onTouchStart={(e) => { e.preventDefault() }}
        onTouchMove={(e) => { e.preventDefault() }}
        onTouchEnd={(e) => { e.preventDefault() }}
      >
        <SearchPopover
          open={isSelected}
          side="bottom"
          align="start"
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
    )
  }

  // Inline rendering for label editing
  return (
    <div
      data-interactive="search"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        ...containerStyle,
      }}
      onPointerDown={(e) => {
        // Allow events to bubble up for HTMLContainer to handle via isInteractiveTarget
        // Only stop propagation for elements that should be handled locally
      }}
      onPointerUp={stopEventPropagation}
      onWheel={(e) => { e.stopPropagation() }}
      onTouchStart={(e) => { e.preventDefault() }}
      onTouchMove={(e) => { e.preventDefault() }}
      onTouchEnd={(e) => { e.preventDefault() }}
    >
      <div style={{ position: 'relative', width: '100%' }}>
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

        {isSelected && results.length > 0 && (
          <div
            ref={resultsContainerRef}
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 1000,
              background: SHAPE_BACKGROUND,
              borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              maxHeight: 200,
              overflow: 'auto',
              width: 240,
              padding: '8px 0',
              touchAction: 'none',
            }}
            onPointerDown={(e) => stopEventPropagation(e)}
            onPointerUp={(e) => stopEventPropagation(e)}
            onWheel={(e) => {
              if ((e as any).ctrlKey) {
                ;(e as any).preventDefault()
              } else {
                ;(e as any).stopPropagation()
              }
            }}
          >
            <ArenaSearchPanel
              query={labelQuery}
              searching={searching}
              error={searchError}
              results={results}
              highlightedIndex={highlightedIndex}
              onHoverIndex={setHighlightedIndex}
              onSelect={(r: any) => onSearchSelection(r)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
