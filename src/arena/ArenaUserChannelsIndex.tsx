import { stopEventPropagation } from 'tldraw'
import { memo, useEffect, useMemo, useRef } from 'react'
import OverflowCarouselText from './OverflowCarouselText'
import { useArenaUserChannels } from './useArenaChannel'
import { LoadingPulse } from '../shapes/LoadingPulse'

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

function ArenaUserChannelsIndexComponent({ userId, userName, width, height, onSelectChannel, onChannelPointerDown, onChannelPointerMove, onChannelPointerUp }: ArenaUserChannelsIndexProps) {
  const { loading, error, channels } = useArenaUserChannels(userId, userName)
  const containerRef = useRef<HTMLDivElement>(null)

  // Allow TLDraw zoom (ctrl+wheel) to propagate; still prevent TLDraw panning on normal scroll.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        // Let TLDraw handle zoom; do not block or stop propagation
        return
      }
      // For regular scroll, prevent TLDraw from panning by stopping propagation
      e.stopPropagation()
    }
    el.addEventListener('wheel', onWheel, { passive: true, capture: true })
    return () => {
      el.removeEventListener('wheel', onWheel, { capture: true } as any)
    }
  }, [])

  const sorted = useMemo(() => {
    if (!channels.length) return channels
    return channels
      .map((channel) => {
        const updatedAtMs = typeof (channel as any).updatedAt === 'string' ? Date.parse((channel as any).updatedAt) : 0
        return { channel, updatedAtMs }
      })
      .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
      .map(({ channel }) => channel)
  }, [channels])

  // Responsive threshold: hide author on narrow widths to preserve padding
  const showAuthor = width >= 360

  // While loading, render a clean full-size centered spinner so it's visually
  // centered relative to the ThreeDBox face, not offset by list paddings.
  if (loading) {
    return (
      <div
        ref={containerRef}
        style={{ position: 'relative', width, height, overflow: 'hidden', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <LoadingPulse size={24} color="rgba(0,0,0,0.3)" />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width, height, overflowX: 'hidden', overflowY: 'auto', padding: 0, display: 'block', overscrollBehavior: 'contain', scrollbarGutter: 'stable both-edges' }}
    >
      {/* Inner padding wrapper keeps the right-side gap even when space is tight */}
      <div style={{ padding: '8px 20px' }}>
        {error ? <div style={{ color: 'rgba(0,0,0,.6)', fontSize: 12 }}>error: {error}</div> : null}
        {!loading && !error && channels.length === 0 ? <div style={{ color: 'rgba(0,0,0,.4)', fontSize: 12 }}>no channels</div> : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, paddingTop: 4, paddingBottom: 36 }}>
        {sorted.map((c, index) => (
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
              gap: 12,
              width: '100%',
              height: 38,
              background: 'transparent',
              border: 'none',
              boxShadow: 'none',
              borderRadius: 0,
              borderTop: index === 0 ? 'none' : '1px solid #eee',
              padding: '6px 12px',
              cursor: 'pointer',
              textAlign: 'left',
              userSelect: 'none',
              touchAction: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0, gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flex: 1, minWidth: 0 }}>
                <OverflowCarouselText
                  text={c.title}
                  maxWidthPx={160}
                  gapPx={32}
                  speedPxPerSec={50}
                  fadePx={24}
                  textStyle={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: (c as any).open ? 'rgba(0,128,0,.86)' : 'rgba(0,0,0,.86)',
                  }}
                />
                {typeof (c as any).length === 'number' ? (
                  <div 
                    style={{ 
                      background: 'rgba(0,0,0,.03)', 
                      borderRadius: 2,
                      padding: '2px 4px',
                      minWidth: 16,
                      height: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0 
                    }}
                  >
                    <div style={{ 
                      color: 'rgba(0,0,0,.4)', 
                      fontSize: 9, 
                      letterSpacing: '-0.01em', 
                      fontWeight: 700, 
                      lineHeight: 1 
                    }}>
                      {(c as any).length >= 1000 
                        ? `${((c as any).length / 1000).toFixed(1)}k`.replace('.0k', 'k')
                        : (c as any).length
                      }
                    </div>
                  </div>
                ) : null}
              </div>
              {/* Right-side metadata: author pinned to right */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 'auto' }}>
                {showAuthor && (c as any).author?.username ? (
                  <div
                    title={(c as any).author.full_name || (c as any).author.username}
                    style={{ color: 'rgba(0,0,0,.5)', fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {(c as any).author.username}
                  </div>
                ) : null}
              </div>
            </div>
          </button>
        ))}
        </div>
      </div>
    </div>
  )
}

export const ArenaUserChannelsIndex = memo(ArenaUserChannelsIndexComponent)
