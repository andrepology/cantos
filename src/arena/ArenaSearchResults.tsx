import React, { useRef } from 'react'
import type { SearchResult } from './types'
import { stopEventPropagation } from 'tldraw'
import { Avatar, ChannelIcon } from './icons'
import { CARD_BORDER_RADIUS, SHAPE_BACKGROUND, CARD_BACKGROUND, COMPONENT_STYLES } from './constants'
import * as Popover from '@radix-ui/react-popover'

export type ArenaSearchPanelProps = {
  query: string
  searching: boolean
  error: string | null
  results: SearchResult[]
  highlightedIndex: number
  onHoverIndex: (index: number) => void
  onSelect: (result: SearchResult) => void
  containerRef?: React.RefObject<HTMLDivElement | null>
  onChannelPointerDown?: (info: { slug: string; id: number; title: string }, e: React.PointerEvent) => void
  onChannelPointerMove?: (info: { slug: string; id: number; title: string }, e: React.PointerEvent) => void
  onChannelPointerUp?: (info: { slug: string; id: number; title: string }, e: React.PointerEvent) => void
}

export type SearchPopoverProps = {
  open: boolean
  children: React.ReactNode // The anchor/children content
  side?: 'top' | 'bottom'
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  avoidCollisions?: boolean
  maxHeight?: number
  windowHeight?: number
} & ArenaSearchPanelProps

/**
 * Dead-simple window virtualization: only render visible items
 * Dramatically reduces DOM nodes and improves pan performance
 */
function useVirtualization(itemCount: number, itemHeight: number, containerHeight: number, scrollY: number) {
  const startIndex = Math.max(0, Math.floor(scrollY / itemHeight) - 1)
  const endIndex = Math.min(itemCount, Math.ceil((scrollY + containerHeight) / itemHeight) + 1)
  const visibleCount = Math.max(0, endIndex - startIndex)
  
  return { startIndex, endIndex, visibleCount, offsetY: startIndex * itemHeight }
}

export function ArenaSearchPanel(props: ArenaSearchPanelProps) {
  const { query, searching, error, results, highlightedIndex, onHoverIndex, onSelect, containerRef, onChannelPointerDown, onChannelPointerMove, onChannelPointerUp } = props

  const dragStartedRefs = useRef<(React.MutableRefObject<boolean> | null)[]>([])
  const [scrollY, setScrollY] = React.useState(0)
  
  // Item height constant (matches button height in styles below)
  const ITEM_HEIGHT = 44
  const CONTAINER_HEIGHT = 400 // matches maxHeight in SearchPopover
  
  // Calculate visible range
  const { startIndex, endIndex, offsetY } = useVirtualization(results.length, ITEM_HEIGHT, CONTAINER_HEIGHT, scrollY)

  const handleScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollY(e.currentTarget.scrollTop)
  }, [])

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        flex: 1,
        minHeight: 40,
        maxHeight: '100%',
        overflow: 'auto',
        border: 'none',
        borderRadius: CARD_BORDER_RADIUS,
        background: SHAPE_BACKGROUND,
        padding: 0,
        touchAction: 'none',
      }}
      onScroll={handleScroll}
      onPointerDown={(e) => stopEventPropagation(e as any)}
      onPointerUp={(e) => stopEventPropagation(e as any)}
      onWheelCapture={(e) => {
        if ((e as any).ctrlKey) {
          ;(e as any).preventDefault()
          return
        }
        ;(e as any).stopPropagation()
      }}
    >
      {error ? <div style={{ color: '#999', fontSize: 12, padding: 8 }}>error: {error}</div> : null}
      {!searching && !error && results.length === 0 && query.trim() ? (
        <div style={{ color: '#999', fontSize: 12, padding: 8 }}>no results</div>
      ) : null}
      
      {/* Virtualized list container */}
      <div
        ref={containerRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: results.length * ITEM_HEIGHT,
          position: 'relative',
        }}
      >
        {/* Spacer before visible items */}
        {startIndex > 0 && (
          <div style={{ height: startIndex * ITEM_HEIGHT, flexShrink: 0 }} />
        )}

        {/* Visible items */}
        {results.slice(startIndex, endIndex).map((r, visibleIdx) => {
          const idx = startIndex + visibleIdx
          
          // Initialize ref for this index if it doesn't exist
          if (!dragStartedRefs.current[idx]) {
            dragStartedRefs.current[idx] = { current: false }
          }
          const dragStartedRef = dragStartedRefs.current[idx]!

          return (
            <button
              key={`${r.kind}-${(r as any).id}`}
              data-index={idx}
              type="button"
              data-interactive="button"
              data-card-type={r.kind === 'channel' ? 'channel' : undefined}
              data-card-title={r.kind === 'channel' ? (r as any).title : undefined}
              data-channel-slug={r.kind === 'channel' ? (r as any).slug : undefined}
              data-channel-author={r.kind === 'channel' ? String((r as any).author?.full_name || (r as any).author?.username || '') : undefined}
              data-channel-updated-at={r.kind === 'channel' ? String((r as any).updatedAt ?? '') : undefined}
              data-channel-block-count={r.kind === 'channel' ? String((r as any).length ?? 0) : undefined}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                // Don't select if drag occurred
                if (!dragStartedRef.current) {
                  onSelect(r)
                }
                // Reset drag flag after click
                dragStartedRef.current = false
              }}
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              onMouseEnter={() => onHoverIndex(idx)}
              onPointerDown={(e) => {
                stopEventPropagation(e as any)
                if (r.kind === 'channel') {
                  dragStartedRef.current = false // Reset drag flag on new interaction
                  onChannelPointerDown?.({ slug: (r as any).slug, id: (r as any).id, title: (r as any).title }, e)
                }
              }}
              onPointerMove={(e) => {
                if (r.kind === 'channel' && e.buttons > 0) {
                  // Only process pointer move during active drag (buttons down)
                  dragStartedRef.current = true
                  onChannelPointerMove?.({ slug: (r as any).slug, id: (r as any).id, title: (r as any).title }, e)
                  stopEventPropagation(e as any) // Stop propagation during drag
                }
              }}
              onPointerUp={(e) => {
                if (r.kind === 'channel') {
                  onChannelPointerUp?.({ slug: (r as any).slug, id: (r as any).id, title: (r as any).title }, e)
                }
                stopEventPropagation(e as any)
              }}
              style={{
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                height: ITEM_HEIGHT,
                padding: '0 12px',
                border: 'none',
                borderBottom: '1px solid #f0f0f0',
                borderRadius: 0,
                background: idx === highlightedIndex ? CARD_BACKGROUND : 'transparent',
                cursor: r.kind === 'channel' ? 'grab' : 'pointer',
                color: '#333',
                flexShrink: 0,
              }}
              draggable={false}
            >
              {r.kind === 'user' ? (
                <>
                  <Avatar src={(r as any).avatar} size={12} />
                  <div style={{ overflow: 'hidden', display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#333', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {(r as any).full_name || (r as any).username}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <ChannelIcon size={12} color="#ccc" />
                  <div style={{ overflow: 'hidden', display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#333', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {((r as any).title || (r as any).slug) ?? ''}
                    </span>
                    <span style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {(r as any).author ? ` / ${(((r as any).author.full_name || (r as any).author.username) ?? '')}` : ''}
                    </span>
                  </div>
                </>
              )}
            </button>
          )
        })}

        {/* Spacer after visible items */}
        {endIndex < results.length && (
          <div style={{ height: (results.length - endIndex) * ITEM_HEIGHT, flexShrink: 0 }} />
        )}
      </div>
    </div>
  )
}

export function SearchPopover(props: SearchPopoverProps) {
  const {
    open,
    children,
    side = 'top',
    align = 'center',
    sideOffset = 4,
    avoidCollisions = false,
    maxHeight = 400,
    windowHeight = 800,
    ...searchProps
  } = props

  return (
    <Popover.Root open={open}>
      <Popover.Anchor asChild>
        {children}
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          avoidCollisions={avoidCollisions}
          onOpenAutoFocus={(e) => e.preventDefault()}
          style={{
            ...COMPONENT_STYLES.overlays.searchPopover,
            height: Math.min(maxHeight, windowHeight * 0.8),
            width: 280,
            padding: 0,
            borderRadius: 8,
            background: SHAPE_BACKGROUND
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
          <ArenaSearchPanel {...searchProps} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}






