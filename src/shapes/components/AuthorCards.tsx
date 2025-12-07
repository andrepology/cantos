import { Profile3DCard } from '../../editor/Profile3DCard'
import { ArenaUserChannelsIndex } from '../../arena/ArenaUserChannelsIndex'
import type { CardAuthorBio, CardAuthorChannels } from '../../arena/types'

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', color: 'rgba(0,0,0,0.45)', fontSize: 11, fontWeight: 600 }}>
      <span style={{ color: 'rgba(0,0,0,0.26)', fontSize: 10 }}>{label}</span>
      <span style={{ color: 'rgba(0,0,0,0.6)' }}>{value}</span>
    </div>
  )
}

export function AuthorProfileCard({ card, width, height }: { card: CardAuthorBio; width: number; height: number }) {
  const avatarSize = Math.max(90, Math.min(width, height) * 0.6)

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        gridTemplateRows: '1fr auto',
        gap: 10,
        alignItems: 'center',
        justifyItems: 'center',
      }}
    >
      <div style={{ width: avatarSize, height: avatarSize }}>
        <Profile3DCard avatar={card.avatar} size={avatarSize} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%', padding: '0 12px' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'rgba(0,0,0,0.82)', textAlign: 'center', lineHeight: 1.1 }}>
          {card.fullName || card.title}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', fontWeight: 600 }}>
          @{card.username || 'author'}
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <StatRow label="blocks" value={card.blockCount ?? '—'} />
          <StatRow label="following" value={card.followingCount ?? '—'} />
          <StatRow label="followers" value={card.followerCount ?? '—'} />
        </div>
      </div>
    </div>
  )
}

export function AuthorChannelsCard({ card, width, height }: { card: CardAuthorChannels; width: number; height: number }) {
  const innerWidth = Math.max(140, width - 12)
  const innerHeight = Math.max(120, height - 12)

  const channels = card.channels.map((c, idx) => ({
    id: c.id ?? idx,
    title: c.title,
    slug: c.slug ?? c.title.toLowerCase().replace(/\s+/g, '-'),
    length: c.blockCount ?? 0,
  })) as any

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4 }}>
      <ArenaUserChannelsIndex
        loading={false}
        error={null}
        channels={channels}
        width={innerWidth}
        height={innerHeight}
        padding={12}
        compact
        showCheckbox={false}
      />
    </div>
  )
}
