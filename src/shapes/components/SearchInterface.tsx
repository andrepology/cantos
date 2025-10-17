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
import { SHAPE_BACKGROUND, TEXT_SECONDARY, CARD_BACKGROUND, CARD_BORDER_RADIUS, CARD_SHADOW } from '../../arena/constants'
import type { SearchResult, FeedItem, Card } from '../../arena/types'

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
  portal = true,
}: SearchInterfaceProps) {
  // Internal search state
  const [labelQuery, setLabelQuery] = useState(initialValue)
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)
  const [isFocused, setIsFocused] = useState(false)

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

  // Get authenticated user for feed
  const { state: authState } = useArenaAuth()
  const userId = authState.status === 'authorized' ? authState.me.id : undefined

  // Prefetch feed once on mount (no dependencies to avoid refetching)
  const { loading: feedLoading, error: feedError, items: feedItems } = useArenaFeed(1, 20)

  // Filter out user's own activity - show only activity from followed users
  const filteredFeedItems = useMemo(() => {
    return feedItems.filter(item => item.user.id !== userId)
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

  if (portal) {
    return (
      <div
        data-interactive="search"
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
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
          <SearchPopover
            open={isFocused}
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
          onWheel={(e) => {
            // Allow scrolling in this container
            e.stopPropagation()
          }}
          onPointerDown={(e) => {
            // Prevent canvas interaction when clicking on feed content
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
          {isEditingLabel && !labelQuery.trim() && (
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
                  borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                  textAlign: 'center',
                }}
              >
                Recent Activity
              </div>
              {feedLoading ? (
                <div style={{ fontSize: 12, color: TEXT_SECONDARY, textAlign: 'center', padding: '16px 0' }}>
                  Loading...
                </div>
              ) : feedError ? (
                <div style={{ fontSize: 12, color: '#ff6b6b', textAlign: 'center', padding: '16px 0' }}>
                  Error loading feed
                </div>
            ) : filteredFeedItems.length === 0 ? (
              <div style={{ fontSize: 12, color: TEXT_SECONDARY, textAlign: 'center', padding: '16px 0' }}>
                No recent activity
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {filteredFeedItems.slice(0, 20).map((item: FeedItem, index: number) => {
                    const card = feedCards[index]
                    return (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex',
                          gap: 12,
                          alignItems: 'flex-start',
                          padding: '8px',
                          borderRadius: 6,
                          background: 'rgba(255, 255, 255, 0.02)',
                        }}
                      >
                        {/* Small card preview */}
                        <div
                          style={{
                            width: 48,
                            height: 48,
                            flexShrink: 0,
                            borderRadius: CARD_BORDER_RADIUS,
                            overflow: 'hidden',
                            background: CARD_BACKGROUND,
                            boxShadow: CARD_SHADOW,
                          }}
                        >
                          <CardView
                            card={card}
                            compact={true}
                            sizeHint={{ w: 48, h: 48 }}
                          />
                        </div>

                        {/* Content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* User + action */}
                          <div style={{ fontSize: 11, marginBottom: 4 }}>
                            <span style={{ fontWeight: 600, color: '#fff' }}>
                              {item.user.full_name || item.user.username}
                            </span>
                            {' '}
                            <span style={{ color: TEXT_SECONDARY }}>
                              {item.action}
                            </span>
                          </div>

                          {/* Card title */}
                          <div style={{ fontSize: 12, color: '#fff', fontWeight: 500, marginBottom: 2 }}>
                            {card.title || 'Untitled'}
                          </div>

                          {/* Target channel */}
                          <div style={{ fontSize: 10, color: TEXT_SECONDARY, marginBottom: 3 }}>
                            in{' '}
                            <span style={{ fontWeight: 500 }}>
                              {(item.target as any)?.title || 'a channel'}
                            </span>
                          </div>

                          {/* Date */}
                          <div style={{ fontSize: 10, color: TEXT_SECONDARY, opacity: 0.7 }}>
                            {new Date(item.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
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
        position: 'relative',
        overflow: 'hidden',
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
        onWheel={(e) => {
          // Allow scrolling in this container
          e.stopPropagation()
        }}
        onPointerDown={(e) => {
          // Prevent canvas interaction when clicking on feed content
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
        {isEditingLabel && !labelQuery.trim() && (
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
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                textAlign: 'center',
              }}
            >
              Recent Activity
            </div>
            {feedLoading ? (
              <div style={{ fontSize: 12, color: TEXT_SECONDARY, textAlign: 'center', padding: '16px 0' }}>
                Loading...
              </div>
            ) : feedError ? (
              <div style={{ fontSize: 12, color: '#ff6b6b', textAlign: 'center', padding: '16px 0' }}>
                Error loading feed
              </div>
            ) : filteredFeedItems.length === 0 ? (
              <div style={{ fontSize: 12, color: TEXT_SECONDARY, textAlign: 'center', padding: '16px 0' }}>
                No recent activity
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {filteredFeedItems.slice(0, 20).map((item: FeedItem, index: number) => {
                  const card = feedCards[index]
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        gap: 12,
                        alignItems: 'flex-start',
                        padding: '8px',
                        borderRadius: 6,
                        background: 'rgba(255, 255, 255, 0.02)',
                      }}
                    >
                      {/* Small card preview */}
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          flexShrink: 0,
                          borderRadius: CARD_BORDER_RADIUS,
                          overflow: 'hidden',
                          background: CARD_BACKGROUND,
                          boxShadow: CARD_SHADOW,
                        }}
                      >
                        <CardView
                          card={card}
                          compact={true}
                          sizeHint={{ w: 48, h: 48 }}
                        />
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* User + action */}
                        <div style={{ fontSize: 11, marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, color: '#fff' }}>
                            {item.user.full_name || item.user.username}
                          </span>
                          {' '}
                          <span style={{ color: TEXT_SECONDARY }}>
                            {item.action}
                          </span>
                        </div>

                        {/* Card title */}
                        <div style={{ fontSize: 12, color: '#fff', fontWeight: 500, marginBottom: 2 }}>
                          {card.title || 'Untitled'}
                        </div>

                        {/* Target channel */}
                        <div style={{ fontSize: 10, color: TEXT_SECONDARY, marginBottom: 3 }}>
                          in{' '}
                          <span style={{ fontWeight: 500 }}>
                            {(item.target as any)?.title || 'a channel'}
                          </span>
                        </div>

                        {/* Date */}
                        <div style={{ fontSize: 10, color: TEXT_SECONDARY, opacity: 0.7 }}>
                          {new Date(item.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
