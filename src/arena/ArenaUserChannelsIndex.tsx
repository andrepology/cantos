import { stopEventPropagation } from 'tldraw'
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

  return (
    <div
      style={{ position: 'relative', width, height, overflowX: 'hidden', overflowY: 'auto', padding: 8, display: 'grid', gridTemplateColumns: '1fr', gap: 8, overscrollBehavior: 'contain' }}
      onPointerDown={(e) => stopEventPropagation(e)}
      onPointerMove={(e) => stopEventPropagation(e)}
      onPointerUp={(e) => stopEventPropagation(e)}
      onWheelCapture={(e) => e.stopPropagation()}
    >
      {/* header removed: only show scrollable channel names */}

      {loading ? <div style={{ color: 'rgba(0,0,0,.5)', fontSize: 12 }}>loading…</div> : null}
      {error ? <div style={{ color: 'rgba(0,0,0,.6)', fontSize: 12 }}>error: {error}</div> : null}
      {!loading && !error && channels.length === 0 ? <div style={{ color: 'rgba(0,0,0,.4)', fontSize: 12 }}>no channels</div> : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {channels.map((c) => (
          <button
            key={c.id}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onSelectChannel?.(c.slug)
            }}
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
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,.86)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
          </button>
        ))}
      </div>
    </div>
  )
}



