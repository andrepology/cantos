import type { Card } from './types'
import { INITIAL_CARDS } from './tactileUtils'

interface AuthorDeckStats {
  fullName: string
  username: string
  bio: string
  blockCount: number
  followerCount: number
  followingCount: number
  channels: { id: number; title: string; blockCount?: number }[]
}

const MOCK_AUTHOR_STATS: Record<number, AuthorDeckStats> = {
  1: {
    fullName: 'Opal Nadir',
    username: 'opal',
    bio: 'Synth-weaver and curator of luminous catalogs.',
    blockCount: 248,
    followerCount: 1208,
    followingCount: 312,
    channels: [
      { id: 11, title: 'Spectrum Salon', blockCount: 42 },
      { id: 12, title: 'Chromatic Atlas', blockCount: 58 },
      { id: 13, title: 'Opaline Works', blockCount: 96 },
    ],
  },
  2: {
    fullName: 'Celia Orbitz',
    username: 'celia',
    bio: 'Orbital cartographer mapping stories across constellations.',
    blockCount: 188,
    followerCount: 890,
    followingCount: 204,
    channels: [
      { id: 21, title: 'Astrograph Courier', blockCount: 28 },
      { id: 22, title: 'Cosmic Calendar', blockCount: 41 },
      { id: 23, title: 'Radio Nebula', blockCount: 67 },
    ],
  },
  3: {
    fullName: 'Fable Dyad',
    username: 'fable',
    bio: 'Mycelial infrastructure nerd and story gardener.',
    blockCount: 312,
    followerCount: 1430,
    followingCount: 510,
    channels: [
      { id: 31, title: 'Mycelium Commons', blockCount: 156 },
      { id: 32, title: 'Fable Field Notes', blockCount: 62 },
      { id: 33, title: 'Perennial Mesh', blockCount: 94 },
    ],
  },
  4: {
    fullName: 'Harper Sable',
    username: 'harper',
    bio: 'Documentarian of soft mechanics and luminous logs.',
    blockCount: 204,
    followerCount: 760,
    followingCount: 188,
    channels: [
      { id: 41, title: 'Luminous Logs', blockCount: 89 },
      { id: 42, title: 'Soft Mechanica', blockCount: 54 },
      { id: 43, title: 'Lantern Index', blockCount: 61 },
    ],
  },
  42: {
    fullName: 'Isolde Finch',
    username: 'isolde',
    bio: 'Signals archivist chronicling cantos folklore.',
    blockCount: 268,
    followerCount: 1560,
    followingCount: 402,
    channels: [
      { id: 421, title: 'Finch Folios', blockCount: 73 },
      { id: 422, title: 'Signal Almanac', blockCount: 112 },
      { id: 423, title: 'Orchard Broadcasts', blockCount: 83 },
    ],
  },
}

function getAuthorStats(authorId: number, fallbackName: string): AuthorDeckStats {
  if (MOCK_AUTHOR_STATS[authorId]) return MOCK_AUTHOR_STATS[authorId]
  return {
    fullName: fallbackName || 'Unknown Author',
    username: `user-${authorId}`,
    bio: 'Author profile preview',
    blockCount: 0,
    followerCount: 0,
    followingCount: 0,
    channels: [],
  }
}

function hashSlug(slug?: string) {
  if (!slug) return 1
  let hash = 0
  for (let i = 0; i < slug.length; i++) {
    hash = (hash << 5) - hash + slug.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) % 1000
}

export function buildChannelDeckCards(slug?: string): Card[] {
  const baseSeed = hashSlug(slug)
  return INITIAL_CARDS.map((card, index) => ({
    ...card,
    id: baseSeed * 100 + index,
    title: slug ? `${card.title} • ${slug}` : card.title,
  }))
}

export function buildAuthorDeckCards(author: { id: number; name?: string; avatar?: string }): Card[] {
  const stats = getAuthorStats(author.id, author.name || 'Author')
  const baseId = author.id * 1000
  const now = new Date().toISOString()

  return [
    {
      id: baseId,
      type: 'author-bio',
      title: `${stats.fullName} Bio`,
      createdAt: now,
      avatar: author.avatar,
      fullName: stats.fullName,
      username: stats.username,
      blockCount: stats.blockCount,
      followerCount: stats.followerCount,
      followingCount: stats.followingCount,
      bio: stats.bio,
      aspect: 1.2,
    },
    {
      id: baseId + 1,
      type: 'author-following',
      title: 'Connections',
      createdAt: now,
      followerCount: stats.followerCount,
      followingCount: stats.followingCount,
      aspect: 0.8,
    },
    {
      id: baseId + 2,
      type: 'author-channels',
      title: 'Channels',
      createdAt: now,
      channels: stats.channels,
      aspect: 1.4,
    },
  ] as Card[]
}
