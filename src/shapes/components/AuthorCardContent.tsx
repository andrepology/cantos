import { useState } from 'react'
import type { CardAuthorBio, CardAuthorChannels, CardAuthorFollowing } from '../../arena/types'
import { Profile3DCard } from '../../editor/Profile3DCard'

export type AuthorCard = CardAuthorBio | CardAuthorFollowing | CardAuthorChannels

interface AuthorCardContentProps {
  card: AuthorCard
}

export function AuthorCardContent({ card }: AuthorCardContentProps) {
  switch (card.type) {
    case 'author-bio':
      return <AuthorBioCard card={card} />
    case 'author-following':
      return <AuthorConnectionsCard card={card} />
    case 'author-channels':
      return <AuthorChannelsCard card={card} />
    default:
      return null
  }
}

function AuthorBioCard({ card }: { card: CardAuthorBio }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          flex: '0 0 auto',
          height: 150,
          background: 'rgba(245,245,245,0.85)',
          borderRadius: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <Profile3DCard avatar={card.avatar} size={120} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{card.fullName ?? card.title}</span>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: '#4b5563', margin: 0 }}>{card.bio ?? 'Author bio'}</p>
        <div
          style={{
            display: 'inline-flex',
            flexDirection: 'column',
            gap: 2,
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 10,
            padding: '8px 10px',
            maxWidth: 'fit-content',
          }}
        >
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, color: '#9ca3af' }}>Blocks</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#1f2937' }}>{card.length ?? 0}</span>
        </div>
      </div>
    </div>
  )
}

type ConnectionTab = 'following' | 'followers'

const CONNECTION_TABS: { id: ConnectionTab; label: string }[] = [
  { id: 'following', label: 'Following' },
  { id: 'followers', label: 'Followers' },
]

function AuthorConnectionsCard({ card }: { card: CardAuthorFollowing }) {
  const [activeTab, setActiveTab] = useState<ConnectionTab>('following')
  const activeCount = activeTab === 'following' ? card.followingCount : card.followerCount

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          padding: 4,
          borderRadius: 999,
          background: 'rgba(0,0,0,0.04)',
          gap: 4,
        }}
      >
        {CONNECTION_TABS.map((tab) => {
          const isActive = tab.id === activeTab
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                border: 'none',
                borderRadius: 999,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                background: isActive ? '#111827' : 'transparent',
                color: isActive ? '#fff' : 'rgba(0,0,0,0.6)',
                transition: 'background 120ms ease, color 120ms ease',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, color: '#9ca3af' }}>
          {activeTab}
        </span>
        <span style={{ fontSize: 28, fontWeight: 600, color: 'rgba(15,23,42,0.65)' }}>
          {activeCount.toLocaleString()}
        </span>
      </div>
    </div>
  )
}

function AuthorChannelsCard({ card }: { card: CardAuthorChannels }) {
  const channels = card.channels ?? []
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Channels</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {channels.slice(0, 4).map((channel) => (
          <div
            key={channel.id}
            style={{
              padding: '8px 10px',
              border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: 10,
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <span>{channel.title}</span>
            {channel.length !== undefined ? <span style={{ color: '#6b7280' }}>{channel.length}</span> : null}
          </div>
        ))}
        {channels.length === 0 && <span style={{ fontSize: 12, color: '#9ca3af' }}>No channels yet</span>}
      </div>
    </div>
  )
}
