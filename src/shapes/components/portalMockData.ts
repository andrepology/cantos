import type { PortalSource } from '../../arena/search/portalSearchTypes'
import type { Card } from '../../arena/types'

// Shared mock helpers and data for portal views
function deterministicRandom(seed: number) {
  const x = Math.sin(seed * 999) * 43758.5453
  return x - Math.floor(x)
}

export const SAMPLE_USERS = [
  { id: 1, full_name: 'Alice Chen', username: 'alice', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice' },
  { id: 2, full_name: 'Bob Smith', username: 'bob', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob' },
  { id: 3, full_name: 'Carol Wong', username: 'carol', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=carol' },
  { id: 4, full_name: 'David Kim', username: 'david', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=david' },
  { id: 5, full_name: 'Emma Johnson', username: 'emma', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=emma' },
]

export const INITIAL_CARDS: Card[] = Array.from({ length: 25 }).map((_, i) => {
  const aspect = 0.6 + deterministicRandom(i) * 1.4 // 0.6 - 2.0

  // Add user metadata to cards 5-24 (skip first 5 so we can test both with/without metadata)
  const hasUser = i >= 5
  const user = hasUser ? SAMPLE_USERS[(i - 5) % SAMPLE_USERS.length] : undefined

  // Spread dates over the last year for testing date formatting
  const daysAgo = (i - 5) * 7 // Every card 7 days apart, starting from 5 weeks ago
  const createdAt = hasUser ? new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString() : new Date().toISOString()

  return {
    id: i,
    title: `Block ${i}`,
    createdAt,
    type: 'text',
    content: `Content for Block ${i}`,
    color: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'][i % 5],
    aspect: aspect,
    user, // Add user metadata for testing
  } as any
})

const DEFAULT_AUTHOR_AVATAR = 'https://avatar.vercel.sh/author'

export const AUTHOR_PLACEHOLDER_CHANNELS: { id: number; title: string; slug: string; length?: number }[] = [
  { id: 501, title: 'Liminal Signals', slug: 'liminal-signals', length: 42 },
  { id: 502, title: 'Soft Systems', slug: 'soft-systems', length: 28 },
  { id: 503, title: 'Civic Bloom', slug: 'civic-bloom', length: 65 },
  { id: 504, title: 'Glasshouse Notes', slug: 'glasshouse-notes', length: 12 },
]

export function buildAuthorMockCards(source: Extract<PortalSource, { kind: 'author' }>): Card[] {
  const displayName = source.fullName ?? 'Author'
  const username = source.fullName ? source.fullName.toLowerCase().replace(/\s+/g, '') : 'author'
  const avatar = source.avatarThumb ?? DEFAULT_AUTHOR_AVATAR
  const nowIso = new Date().toISOString()

  return [
    {
      id: Number(`9${source.id ?? 0}01`),
      type: 'author-bio',
      title: displayName,
      createdAt: nowIso,
      avatar,
      fullName: displayName,
      username,
      blockCount: 96,
      followerCount: 128,
      followingCount: 64,
      aspect: 1,
    } as Card,
    {
      id: Number(`9${source.id ?? 0}02`),
      type: 'author-channels',
      title: `${displayName}'s channels`,
      createdAt: nowIso,
      channels: AUTHOR_PLACEHOLDER_CHANNELS.map((c) => ({ id: c.id, title: c.title, slug: c.slug, blockCount: c.length })),
      aspect: 1.2,
    } as Card,
  ]
}
