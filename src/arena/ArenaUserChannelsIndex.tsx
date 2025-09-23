import { stopEventPropagation } from 'tldraw'
import { useEffect, useRef } from 'react'
import { useArenaUserChannels } from './useArenaChannel'

export type ArenaUserChannelsIndexProps = {
  userId: number
  userName?: string
  width: number
  height: number
  onSelectChannel?: (slug: string) => void
}

export function ArenaUserChannelsIndex({ userId, userName, width, height, onSelectChannel }: ArenaUserChannelsIndexProps) {
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

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width, height, overflowX: 'hidden', overflowY: 'auto', padding: 8, display: 'grid', gridTemplateColumns: '1fr', gap: 8, overscrollBehavior: 'contain' }}
    >
      {loading ? <div style={{ color: 'rgba(0,0,0,.5)', fontSize: 12 }}>loading…</div> : null}
      {error ? <div style={{ color: 'rgba(0,0,0,.6)', fontSize: 12 }}>error: {error}</div> : null}
      {!loading && !error && channels.length === 0 ? <div style={{ color: 'rgba(0,0,0,.4)', fontSize: 12 }}>no channels</div> : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {channels.map((c) => (
          <button
            key={c.id}
            type="button"
            data-interactive="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onPointerDown={(e) => {
              stopEventPropagation(e)
              onSelectChannel?.(c.slug)
            }}
            onPointerMove={(e) => stopEventPropagation(e)}
            onPointerUp={(e) => {
              stopEventPropagation(e)
              onSelectChannel?.(c.slug)
            }}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onSelectChannel?.(c.slug)
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



