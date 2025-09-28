import { useEffect, useRef } from 'react'
import { stopEventPropagation } from 'tldraw'
import { useGlobalPanelState } from '../jazz/usePanelState'


export type ConnectionItem = {
  id: number
  title: string
  slug?: string
  author?: string
}

export type ConnectionsPanelProps = {
  z: number
  x: number
  y: number
  widthPx: number
  maxHeightPx: number
  title?: string
  authorName?: string
  createdAt?: string
  updatedAt?: string
  loading: boolean
  error: string | null
  connections: ConnectionItem[]
  hasMore?: boolean
  onSelectChannel?: (slug: string) => void
}

export function ConnectionsPanel(props: ConnectionsPanelProps) {
  const { isOpen, togglePanel, setOpen } = useGlobalPanelState()


  const {
    z,
    x,
    y,
    widthPx,
    maxHeightPx,
    title,
    authorName,
    createdAt,
    updatedAt,
    loading,
    error,
    connections,
    hasMore,
    onSelectChannel,
  } = props

  const px = (n: number) => n / z
  const ref = useRef<HTMLDivElement>(null)

  // Global wheel capture to prevent browser zoom on pinch within the panel
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      const el = ref.current
      if (!el) return
      const target = e.target as Node | null
      if (target && el.contains(target)) {
        // Prevent browser (page) zoom; allow event to bubble to TLDraw for canvas zoom
        e.preventDefault()
      }
    }
    window.addEventListener('wheel', handler, { capture: true, passive: false })
    return () => window.removeEventListener('wheel', handler, { capture: true } as any)
  }, [])

  if (!isOpen) {
    return (
      <div
        data-interactive="collapsed-panel"
        style={{
          position: 'absolute',
          top: y,
          left: x,
          width: px(25),
          height: px(25),
          background: '#ffffff',
          borderRadius: 9999,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 1000,
          fontSize: `${px(12)}px`,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: '#111',
          lineHeight: 1,
          padding: 0,
          boxSizing: 'border-box',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}
        onPointerDownCapture={stopEventPropagation}
        onMouseDownCapture={stopEventPropagation}
        onContextMenu={(e) => {
          e.preventDefault()
          stopEventPropagation(e as any)
        }}
        onClick={(e) => {
          console.log('Collapsed panel clicked, setting open to true')
          stopEventPropagation(e as any)
          setOpen(true)
          console.log('setOpen called')
        }}
        onPointerDown={stopEventPropagation}
        onPointerUp={stopEventPropagation}
        onPointerMove={stopEventPropagation}
      >
        <svg
          data-interactive="open-button"
          width={px(25)}
          height={px(25)}
          viewBox="0 0 25 25"
          fill="none"
          style={{
            userSelect: 'none',
          }}
        >
          <circle
            cx="12.5"
            cy="12.5"
            r="12"
            fill="#ffffff"
            stroke="#e6e6e6"
            strokeWidth="1"
          />
          <line x1="12.5" y1="16.5" x2="12.5" y2="12.5" stroke="#999999" strokeWidth="2" strokeLinecap="round"/>
          <line x1="12.5" y1="8.5" x2="12.51" y2="8.5" stroke="#999999" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      data-interactive="connections-panel"
      style={{
        position: 'absolute',
        top: y,
        left: x,
        width: px(widthPx),
        maxHeight: px(maxHeightPx),
        overflow: 'auto',
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
        zIndex: 1000,
        background: 'rgba(255,255,255,0.88)',
        borderRadius: px(8),
        boxShadow: `0 ${px(12)}px ${px(32)}px rgba(0,0,0,.12), 0 ${px(3)}px ${px(8)}px rgba(0,0,0,.06), inset 0 0 0 ${px(1)}px rgba(0,0,0,.06)`,
        backdropFilter: 'saturate(1.1) blur(2px)',
        WebkitBackdropFilter: 'saturate(1.1) blur(2px)',
      }}
      onPointerDown={stopEventPropagation}
      onPointerMove={stopEventPropagation}
      onPointerUp={stopEventPropagation}
      onWheel={(e) => {
        if ((e as any).ctrlKey) {
          // Let TLDraw handle pinch-zoom; do not preventDefault here (handled globally), and do not stop propagation
          return
        }
        // Keep normal scrolling local to the panel
        e.stopPropagation()
      }}
      onWheelCapture={(e) => {
        if ((e as any).ctrlKey) return
        e.stopPropagation()
      }}
    >
      <div style={{ padding: px(8), position: 'relative' }}>
        <div style={{ fontFamily: "'Alte Haas Grotesk', sans-serif", fontWeight: 700, fontSize: `${px(12)}px`, letterSpacing: '-0.0125em', paddingRight: px(28) }}>
          {title || 'Untitled'}
        </div>
        <button
          data-interactive="close-button"
          onClick={(e) => {
            stopEventPropagation(e as any)
            togglePanel()
          }}
          style={{
            position: 'absolute',
            top: px(8),
            right: px(8),
            width: px(20),
            height: px(20),
            borderRadius: 9999,
            // border: '1px solid #e6e6e6',
            background: '#f5f5f5',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: `${px(10)}px`,
            fontWeight: 600,
            color: '#111',
            lineHeight: 1,
            padding: 0,
            boxSizing: 'border-box',
            boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
          }}
          onPointerDown={stopEventPropagation}
          onPointerUp={stopEventPropagation}
          onPointerMove={stopEventPropagation}
        >
          <svg width={px(10)} height={px(10)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div style={{ padding: px(8), display: 'grid', rowGap: px(6), color: 'rgba(0,0,0,.7)' }}>
        {loading ? (
          <div style={{ fontSize: `${px(12)}px`, opacity: 0.6 }}>loading…</div>
        ) : error ? (
          <div style={{ fontSize: `${px(12)}px`, opacity: 0.6 }}>error: {error}</div>
        ) : (
          <>
            {authorName ? (
              <div style={{ display: 'flex', gap: px(6), alignItems: 'baseline' }}>
                <span style={{ fontSize: `${px(12)}px` }}>{authorName}</span>
              </div>
            ) : null}
            {createdAt ? (
              <div style={{ display: 'flex', gap: px(6) }}>
                <span style={{ fontSize: `${px(11)}px`, opacity: 0.6 }}>Added</span>
                <span style={{ fontSize: `${px(12)}px` }}>{new Date(createdAt).toLocaleDateString()}</span>
              </div>
            ) : null}
            {updatedAt ? (
              <div style={{ display: 'flex', gap: px(6) }}>
                <span style={{ fontSize: `${px(11)}px`, opacity: 0.6 }}>Modified</span>
                <span style={{ fontSize: `${px(12)}px` }}>{new Date(updatedAt).toLocaleDateString()}</span>
              </div>
            ) : null}
          </>
        )}
      </div>
      <div style={{ padding: `${px(8)}px ${px(8)}px` }}>
        <div style={{ fontSize: `${px(11)}px`, fontWeight: 700, opacity: 0.7, marginBottom: px(6) }}>Connections{connections ? ` (${connections.length})` : ''}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: px(6) }}>
          {connections?.length ? (
            connections.map((c) => (
              <div
                key={c.id}
                style={{
                  padding: px(8),
                  border: '1px solid rgba(0,0,0,.08)',
                  borderRadius: px(4),
                  background: 'rgba(0,0,0,.02)',
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: px(8),
                  cursor: onSelectChannel ? 'pointer' : 'default',
                  userSelect: 'none',
                }}
                onClick={(e) => {
                  stopEventPropagation(e as any)
                  if (!onSelectChannel) return
                  if (c.slug) onSelectChannel(c.slug)
                }}
                onPointerDown={stopEventPropagation}
                onPointerUp={stopEventPropagation}
                onPointerMove={stopEventPropagation}
              >
                <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'baseline', gap: px(8) }}>
                  <div style={{ fontSize: `${px(12)}px`, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title || c.slug}</div>
                </div>
                <div style={{ fontSize: `${px(11.5)}px`, opacity: 0.7, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.author ?? ''}
                </div>
              </div>
            ))
          ) : loading ? null : (
            <div style={{ fontSize: `${px(12)}px`, opacity: 0.6 }}>No connections</div>
          )}
          {hasMore ? (
            <div style={{ fontSize: `${px(11)}px`, opacity: 0.6 }}>More connections exist…</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}


