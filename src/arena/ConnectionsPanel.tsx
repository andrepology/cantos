import { useEffect, useRef } from 'react'
import { stopEventPropagation } from 'tldraw'

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

  return (
    <div
      ref={ref}
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
      <div style={{ padding: px(8) }}>
        <div style={{ fontFamily: "'Alte Haas Grotesk', sans-serif", fontWeight: 700, fontSize: `${px(12)}px`, letterSpacing: '-0.0125em' }}>
          {title || 'Untitled'}
        </div>
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


