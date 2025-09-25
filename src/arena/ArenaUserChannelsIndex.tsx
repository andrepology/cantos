import { stopEventPropagation } from 'tldraw'
import { useEffect, useRef } from 'react'
import { useArenaUserChannels } from './useArenaChannel'

export type ArenaUserChannelsIndexProps = {
  userId: number
  userName?: string
  width: number
  height: number
  onSelectChannel?: (slug: string) => void
  onChannelPointerDown?: (info: { slug: string; id: number; title: string }, e: React.PointerEvent) => void
  onChannelPointerMove?: (info: { slug: string; id: number; title: string }, e: React.PointerEvent) => void
  onChannelPointerUp?: (info: { slug: string; id: number; title: string }, e: React.PointerEvent) => void
}

export function ArenaUserChannelsIndex({ userId, userName, width, height, onSelectChannel, onChannelPointerDown, onChannelPointerMove, onChannelPointerUp }: ArenaUserChannelsIndexProps) {
  const { loading, error, channels } = useArenaUserChannels(userId, userName)
  const containerRef = useRef<HTMLDivElement>(null)

  // Block browser pinch-zoom (ctrl+wheel) while allowing native scroll, and prevent TLDraw panning.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault()
      }
      e.stopPropagation()
    }
    el.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => {
      el.removeEventListener('wheel', onWheel, { capture: true } as any)
    }
  }, [])

  const sorted = channels.slice().sort((a: any, b: any) => {
    const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0
    const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0
    return tb - ta
  })

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width, height, overflowX: 'hidden', overflowY: 'auto', padding: 8, display: 'grid', gridTemplateColumns: '1fr', gap: 8, overscrollBehavior: 'contain' }}
    >
      {loading ? <div style={{ color: 'rgba(0,0,0,.5)', fontSize: 12 }}>loading…</div> : null}
      {error ? <div style={{ color: 'rgba(0,0,0,.6)', fontSize: 12 }}>error: {error}</div> : null}
      {!loading && !error && channels.length === 0 ? <div style={{ color: 'rgba(0,0,0,.4)', fontSize: 12 }}>no channels</div> : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {sorted.map((c) => (
          <button
            key={c.id}
            type="button"
            data-interactive="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onSelectChannel?.(c.slug)
            }}
            onPointerDown={(e) => {
              stopEventPropagation(e)
              onChannelPointerDown?.({ slug: c.slug, id: c.id, title: c.title }, e)
            }}
            onPointerMove={(e) => {
              stopEventPropagation(e)
              onChannelPointerMove?.({ slug: c.slug, id: c.id, title: c.title }, e)
            }}
            onPointerUp={(e) => {
              stopEventPropagation(e)
              onChannelPointerUp?.({ slug: c.slug, id: c.id, title: c.title }, e)
            }}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onMouseUp={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            draggable={false}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              height: 44,
              background: 'transparent',
              border: 'none',
              boxShadow: 'none',
              borderRadius: 0,
              borderTop: '1px solid #eee',
              padding: '6px 8px',
              cursor: 'pointer',
              textAlign: 'left',
              userSelect: 'none',
              touchAction: 'none',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,.86)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
          </button>
        ))}
      </div>
    </div>
  )
}



