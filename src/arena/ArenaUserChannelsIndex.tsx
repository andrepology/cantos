import { stopEventPropagation } from 'tldraw'
import { useArenaUserChannels } from './useArenaChannel'
import { fetchArenaUser } from './api'
import { useEffect, useState } from 'react'
import type { ArenaUser } from './types'

export type ArenaUserChannelsIndexProps = {
  userId: number
  userName?: string
  width: number
  height: number
  onSelectChannel?: (slug: string) => void
}

export function ArenaUserChannelsIndex({ userId, userName, width, height, onSelectChannel }: ArenaUserChannelsIndexProps) {
  const { loading, error, channels } = useArenaUserChannels(userId, userName)
  const [user, setUser] = useState<ArenaUser | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchArenaUser(userId)
      .then((u) => {
        if (!cancelled) setUser(u)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId])

  return (
    <div
      style={{ position: 'relative', width, height, overflowX: 'hidden', overflowY: 'auto', padding: 8, display: 'grid', gridTemplateColumns: '1fr', gap: 8, overscrollBehavior: 'contain' }}
      onPointerDown={(e) => stopEventPropagation(e)}
      onPointerMove={(e) => stopEventPropagation(e)}
      onPointerUp={(e) => stopEventPropagation(e)}
      onWheelCapture={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', background: '#eee' }}>
          {user?.avatar ? <img src={user.avatar} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,.86)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.full_name || userName || ''}</div>
          <div style={{ fontSize: 11, color: 'rgba(0,0,0,.55)' }}>@{user?.username || userName}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, fontSize: 11, color: 'rgba(0,0,0,.6)' }}>
          {typeof user?.channel_count === 'number' ? <span>{user.channel_count} channels</span> : null}
          {typeof user?.follower_count === 'number' ? <span>{user.follower_count} followers</span> : null}
          {typeof user?.following_count === 'number' ? <span>{user.following_count} following</span> : null}
        </div>
      </div>

      {loading ? <div style={{ color: 'rgba(0,0,0,.5)', fontSize: 12 }}>loading…</div> : null}
      {error ? <div style={{ color: 'rgba(0,0,0,.6)', fontSize: 12 }}>error: {error}</div> : null}
      {!loading && !error && channels.length === 0 ? <div style={{ color: 'rgba(0,0,0,.4)', fontSize: 12 }}>no channels</div> : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
              background: '#fff',
              border: '1px solid #e5e5e5',
              boxShadow: '0 2px 6px rgba(0,0,0,.05)',
              borderRadius: 2,
              padding: '6px 8px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ width: 28, height: 28, borderRadius: 2, background: '#f3f3f3', overflow: 'hidden', flex: '0 0 auto', border: '1px solid #eee' }}>
              {c.thumbUrl ? <img src={c.thumbUrl} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,.86)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
          </button>
        ))}
      </div>
    </div>
  )
}



