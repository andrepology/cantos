import React, { useRef } from 'react'
import type { SearchResult } from './types'
import { stopEventPropagation } from 'tldraw'
import { Avatar, ChannelIcon } from './icons'
import { CARD_BORDER_RADIUS } from './constants'

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

export function ArenaSearchPanel(props: ArenaSearchPanelProps) {
  const { query, searching, error, results, highlightedIndex, onHoverIndex, onSelect, containerRef, onChannelPointerDown, onChannelPointerMove, onChannelPointerUp } = props

  const dragStartedRefs = useRef<(React.MutableRefObject<boolean> | null)[]>([])

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
        background: '#fff',
        padding: 0,
        touchAction: 'none',
      }}
      onPointerDown={(e) => stopEventPropagation(e as any)}
      // Allow pointermove to propagate for MotionCursor position tracking
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
      <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column' }}>
        {results.map((r, idx) => {
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
              data-channel-slug={r.kind === 'channel' ? (r as any).slug : undefined}
              data-channel-title={r.kind === 'channel' ? (r as any).title : undefined}
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
                // Allow pointermove to propagate when not dragging for MotionCursor position tracking
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
                height: 44,
                padding: '0 12px',
                border: 'none',
                borderBottom: '1px solid #f0f0f0',
                borderRadius: 0,
                background: idx === highlightedIndex ? 'rgba(0,0,0,.06)' : 'transparent',
                cursor: r.kind === 'channel' ? 'grab' : 'pointer',
                color: '#333',
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
      </div>
    </div>
  )
}






