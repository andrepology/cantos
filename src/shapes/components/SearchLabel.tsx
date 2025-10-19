import { useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { stopEventPropagation } from 'tldraw'
import { useSessionUserChannels, fuzzySearchChannels } from '../../arena/userChannelsStore'
import { useArenaSearch } from '../../arena/hooks/useArenaSearch'
import { SearchPopover, ArenaSearchPanel } from '../../arena/ArenaSearchResults'
import { Avatar } from '../../arena/icons'
import type { SearchResult } from '../../arena/types'

export interface SearchLabelProps {
  // Text and visual
  initialValue?: string
  displayText?: string
  placeholder: string
  inputStyle: React.CSSProperties
  containerWidth?: number

  // Editor/selection context
  isSelected: boolean
  editor: any
  shapeId: string

  // Control
  editing: boolean
  onSelect: (result: SearchResult | null) => void
  onCancel: () => void

  // External ref for caret placement from parent
  inputRef?: React.RefObject<HTMLInputElement | null>

  // Author chip (visible when selected)
  author?: any
  labelIconPx?: number
  zoomAwareFontPx?: number
  authorColor?: string
  onAuthorSelect?: (userId: number, userName: string, userAvatar?: string) => void
}

export function SearchLabel({
  initialValue = '',
  displayText,
  placeholder,
  inputStyle,
  containerWidth,
  isSelected,
  editor,
  shapeId,
  editing,
  onSelect,
  onCancel,
  inputRef,
  author,
  labelIconPx,
  zoomAwareFontPx,
  authorColor,
  onAuthorSelect,
}: SearchLabelProps) {
  const localInputRef = useRef<HTMLInputElement>(null)
  const mergedInputRef = inputRef ?? localInputRef
  const resultsContainerRef = useRef<HTMLDivElement>(null)

  const [labelQuery, setLabelQuery] = useState<string>(initialValue)
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)
  const [isFocused, setIsFocused] = useState<boolean>(false)

  // Cached channels (no auto fetch here)
  const { channels: cachedChannels } = useSessionUserChannels({ autoFetch: false })
  const filteredCachedChannels = useMemo(() => {
    if (!labelQuery.trim()) return cachedChannels
    return fuzzySearchChannels(cachedChannels, labelQuery)
  }, [cachedChannels, labelQuery])

  // Live API search
  const { loading: searching, error: searchError, results: apiResults } = useArenaSearch(labelQuery)

  // Dedup API results against cached channels
  const dedupedApiResults = useMemo(() => {
    if (!apiResults.length || !cachedChannels.length) return apiResults
    const cachedSlugs = new Set(cachedChannels.map((c) => c.slug))
    return apiResults.filter((r) => (r.kind === 'channel' ? !cachedSlugs.has((r as any).slug) : true))
  }, [apiResults, cachedChannels])

  // Combined results: cached first, then API
  const results = useMemo(() => {
    return [
      ...filteredCachedChannels.map((channel) => ({
        kind: 'channel' as const,
        id: channel.id,
        title: channel.title,
        slug: channel.slug,
        author: channel.author,
        description: undefined,
        length: channel.length,
        updatedAt: channel.updatedAt,
        status: channel.status,
        open: channel.open,
      })),
      ...dedupedApiResults,
    ]
  }, [filteredCachedChannels, dedupedApiResults])

  // Reset highlight when query/results change
  useEffect(() => {
    setHighlightedIndex(results.length > 0 ? 0 : -1)
  }, [labelQuery, results.length])

  // When editing starts, initialize query from the latest display text
  useEffect(() => {
    if (editing) {
      setLabelQuery(displayText ?? initialValue)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  // Keep highlighted item in view
  useEffect(() => {
    const container = resultsContainerRef.current
    if (!container) return
    const el = container.querySelector(`[data-index="${highlightedIndex}"]`)
    if (el && 'scrollIntoView' in el) {
      ;(el as HTMLElement).scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!results.length) return
      const next = highlightedIndex < 0 ? 0 : (highlightedIndex + 1) % results.length
      setHighlightedIndex(next)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!results.length) return
      const prev = highlightedIndex <= 0 ? results.length - 1 : highlightedIndex - 1
      setHighlightedIndex(prev)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const chosen = highlightedIndex >= 0 && highlightedIndex < results.length ? results[highlightedIndex] : null
      onSelect(chosen)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  const commonInputProps = {
    value: labelQuery,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setLabelQuery(e.target.value),
    placeholder,
    onPointerDown: stopEventPropagation,
    onPointerUp: stopEventPropagation,
    onFocus: () => {
      setIsFocused(true)
      if (!isSelected) editor.setSelectedShapes([shapeId])
    },
    onBlur: () => setIsFocused(false),
    onWheel: (e: React.WheelEvent) => {
      e.stopPropagation()
    },
    onKeyDown: handleKeyDown,
    style: inputStyle,
  }

  const authorName = author?.full_name || author?.username || ''
  const authorAvatar = author?.avatar || ''

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        minWidth: 0,
        gap: 4,
      }}
    >
      {/* Primary label area with optional editing overlay */}
      <div style={{ position: 'relative', flex: '0 1 auto', minWidth: 0 }}>
        <span
          data-label-text
          style={{
            ...inputStyle,
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            overflow: 'hidden',
            display: 'block',
            width: '100%',
            pointerEvents: editing ? 'none' : 'auto',
            visibility: editing ? 'hidden' : 'visible',
          }}
        >
          {displayText ?? initialValue ?? ''}
        </span>

        {editing && (
          <div
            data-interactive="search"
            style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}
            onPointerDown={(e) => {
              // Allow parent label row to manage selection; prevent canvas gestures from starting in the input
            }}
            onPointerUp={stopEventPropagation}
            onWheel={(e) => { e.stopPropagation() }}
          >
            <SearchPopover
              open={editing && isFocused}
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
              onSelect={(r: any) => onSelect(r)}
              containerRef={resultsContainerRef}
            >
              <input
                data-interactive="input"
                ref={mergedInputRef}
                {...commonInputProps}
                style={{
                  ...inputStyle,
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  background: 'transparent',
                }}
                onBlur={() => {
                  commonInputProps.onBlur?.()
                  onCancel()
                }}
              />
            </SearchPopover>
          </div>
        )}
      </div>

      {/* Author chip (visible when selected and author exists) */}
      {isSelected && authorName ? (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            minWidth: 0,
            overflow: 'hidden',
            flex: '0 1 auto',
          }}
        >
          <span style={{
            fontSize: `${zoomAwareFontPx ?? 12}px`,
            color: authorColor,
            flexShrink: 0,
            marginRight: 1.5,
          }}>by </span>
          <span
            data-interactive="button"
            data-tactile
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              minWidth: 0,
              overflow: 'hidden',
              cursor: 'pointer',
              pointerEvents: 'auto',
            }}
            onPointerUp={(e) => {
              stopEventPropagation(e)
              if (!e.metaKey && author?.id && onAuthorSelect) {
                onAuthorSelect(author.id, author.username || author.full_name || '', authorAvatar || undefined)
              }
            }}
          >
            <div style={{ transform: 'translateY(-1px)', flexShrink: 0 }}>
              <Avatar src={authorAvatar} size={labelIconPx ?? 12} />
            </div>
            <span style={{
              fontSize: `${zoomAwareFontPx ?? 12}px`,
              color: authorColor,
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}>{authorName}</span>
          </span>
        </div>
      ) : null}
    </div>
  )
}


