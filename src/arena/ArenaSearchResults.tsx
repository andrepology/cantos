import React from 'react'
import type { SearchResult } from './types'
import { stopEventPropagation } from 'tldraw'
import { Avatar, ChannelIcon } from './icons'

export type ArenaSearchPanelProps = {
  query: string
  searching: boolean
  error: string | null
  results: SearchResult[]
  highlightedIndex: number
  onHoverIndex: (index: number) => void
  onSelect: (result: SearchResult) => void
  containerRef?: React.RefObject<HTMLDivElement | null>
}

export function ArenaSearchPanel(props: ArenaSearchPanelProps) {
  const { query, searching, error, results, highlightedIndex, onHoverIndex, onSelect, containerRef } = props

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
        borderRadius: 0,
        background: '#fff',
        padding: 0,
        touchAction: 'none',
      }}
      onPointerDown={(e) => stopEventPropagation(e as any)}
      onPointerMove={(e) => stopEventPropagation(e as any)}
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
        {results.map((r, idx) => (
          <button
            key={`${r.kind}-${(r as any).id}`}
            data-index={idx}
            type="button"
            data-interactive="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onSelect(r)
            }}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onSelect(r)
            }}
            onMouseEnter={() => onHoverIndex(idx)}
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
              cursor: 'pointer',
              color: '#333',
            }}
            onPointerDown={(e) => stopEventPropagation(e as any)}
            onPointerMove={(e) => stopEventPropagation(e as any)}
            onPointerUp={(e) => stopEventPropagation(e as any)}
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
        ))}
      </div>
    </div>
  )
}






