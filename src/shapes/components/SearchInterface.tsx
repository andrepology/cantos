import { useEffect, useRef, useState, useMemo, useLayoutEffect } from 'react'
import type React from 'react'
import { stopEventPropagation } from 'tldraw'
import * as Popover from '@radix-ui/react-popover'
import { useSessionUserChannels, fuzzySearchChannels } from '../../arena/userChannelsStore'
import { useArenaSearch } from '../../arena/hooks/useArenaSearch'
import { SearchPopover, ArenaSearchPanel } from '../../arena/ArenaSearchResults'
import { SHAPE_BACKGROUND, TEXT_SECONDARY } from '../../arena/constants'
import type { SearchResult } from '../../arena/types'

// Note: SearchPortal.tsx handles portal mode for performance.
// This file (SearchInterface.tsx) only handles inline label editing mode.

// Minimum container width to show chat metadata (profile circles, names, dates)
const CHAT_METADATA_MIN_WIDTH = 216

export interface SearchInterfaceProps {
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

  // Positioning
  portal?: boolean
}

export function SearchInterface({
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
  portal = true,
}: SearchInterfaceProps) {
  // This component only handles inline label editing mode.
  // Portal mode is handled by SearchPortal.tsx for performance reasons.

  // Internal search state for inline mode
  const [labelQuery, setLabelQuery] = useState(initialValue)
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)
  const [isFocused, setIsFocused] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const resultsContainerRef = useRef<HTMLDivElement>(null)

  // Get cached user channels (minimal fetch for inline mode)
  const { channels: cachedChannels } = useSessionUserChannels({ autoFetch: false })

  // Fuzzy search cached channels only
  const filteredCachedChannels = useMemo(() => {
    if (!labelQuery.trim()) return cachedChannels
    return fuzzySearchChannels(cachedChannels, labelQuery)
  }, [cachedChannels, labelQuery])

  // API search for inline mode - DISABLED to avoid continuous API calls
  // const { loading: searching, error: searchError, results: apiResults } = useArenaSearch(labelQuery)
  const searching = false
  const searchError = null
  const apiResults: SearchResult[] = []

  // Convert filtered cached channels to SearchResult format
  const cachedChannelsAsResults = useMemo(() => {
    return filteredCachedChannels.map(channel => ({
      kind: 'channel' as const,
      id: channel.id,
      title: channel.title,
      slug: channel.slug,
      author: channel.author,
      description: undefined,
      length: channel.length,
      updatedAt: channel.updatedAt,
      status: channel.status,
      open: channel.open
    }))
  }, [filteredCachedChannels])

  // Combine results: cached channels first, then API results
  const results = useMemo(() => {
    return [...cachedChannelsAsResults, ...apiResults]
  }, [cachedChannelsAsResults, apiResults])

  // Reset highlight as results change
  useEffect(() => {
    setHighlightedIndex(results.length > 0 ? 0 : -1)
  }, [results.length])

  // Keep highlighted row in view
  useEffect(() => {
    const container = resultsContainerRef.current
    if (!container) return
    const el = container.querySelector(`[data-index="${highlightedIndex}"]`)
    if (el && 'scrollIntoView' in el) {
      ;(el as HTMLElement).scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex])

  // Autofocus input when selected
  // useLayoutEffect(() => {
  //   if (isSelected) {
  //     const input = inputType === 'textarea' ? textareaRef.current : inputRef.current
  //     if (input) {
  //       // Small delay to ensure popover is fully rendered
  //       setTimeout(() => {
  //         input.focus()
  //       }, 0)
  //     }
  //   }
  // }, [isSelected, inputType])

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
    onFocus: () => {
      setIsFocused(true)
      if (!isSelected) editor.setSelectedShapes([shapeId])
    },
    onBlur: () => setIsFocused(false),
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

  // Inline rendering for label editing
  return (
    <div
      data-interactive="search"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        ...containerStyle,
      }}
    >
      {/* Fixed search input at top */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'transparent',
          padding: '8px',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div style={{ position: 'relative', width: '100%', maxWidth: '280px' }}>
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

      {/* Scrollable content area */}
      <div
        data-interactive="feed"
        style={{
          flex: 1,
          minHeight: 0, // Important for flex child scrolling
          overflow: 'auto',
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
        onWheelCapture={(e) => {
          // Allow ctrl+wheel for zooming, but prevent wheel events from becoming canvas pan gestures
          if (e.ctrlKey) return
          e.stopPropagation()
        }}
        onPointerDown={(e) => {
          // Prevent canvas interaction when clicking on feed content
          // Allow scrolling gestures to pass through
          if (e.target !== e.currentTarget) {
            e.stopPropagation()
          }
        }}
        onPointerUp={(e) => {
          // Prevent canvas interaction when releasing on feed content
          if (e.target !== e.currentTarget) {
            e.stopPropagation()
          }
        }}
      >
        {/* Recent Activity section - DISABLED to avoid any continuous logic */}
        {/* {isEditingLabel && !labelQuery.trim() && (
          <div
            style={{
              width: '100%',
              maxWidth: '400px',
              padding: '16px',
              background: SHAPE_BACKGROUND,
              borderRadius: 8,
              border: `1px solid rgba(255, 255, 255, 0.1)`,
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: TEXT_SECONDARY,
                marginBottom: 16,
                paddingBottom: 8,

              }}
            >
              Recent Activity
            </div>
            <div style={{ fontSize: 12, color: TEXT_SECONDARY, textAlign: 'center', padding: '16px 0' }}>
              Inline editing mode - no feed data available
            </div>
          </div>
        )} */}
      </div>
    </div>
  )
}
