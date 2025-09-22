import React from 'react'
import type { SearchResult } from './types'
import { stopEventPropagation } from 'tldraw'

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
        border: '1px solid #e5e5e5',
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
            onClick={(e) => {
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
              padding: '8px 12px',
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
          >
            {r.kind === 'user' ? (
              <>
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 0,
                    background: 'transparent',
                    overflow: 'hidden',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {(r as any).avatar ? (
                    <img
                      src={(r as any).avatar}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  )}
                </div>
                <div style={{ overflow: 'hidden', display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#333', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                    {(r as any).full_name || (r as any).username
                    }
                  </span>
                </div>
              </>
            ) : (
              <>
                <div style={{ width: 12, height: 12, border: '1px solid #ccc', borderRadius: 0, flex: '0 0 auto' }} />
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


