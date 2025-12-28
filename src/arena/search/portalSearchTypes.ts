export interface PortalAuthor {
  id: number
  fullName?: string
  avatarThumb?: string
}

export interface PortalChannel {
  id: number
  title: string
  slug: string
  author?: PortalAuthor
}

export type PortalSource =
  | { kind: 'channel'; slug: string; title?: string }
  | { kind: 'author'; id: number; fullName?: string; avatarThumb?: string }

export type PortalSourceOption =
  | { kind: 'channel'; channel: PortalChannel }
  | { kind: 'author'; author: PortalAuthor }

export type PortalSourceSelection =
  | { kind: 'channel'; slug: string }
  | {
      kind: 'author'
      userId: number
      fullName?: string
      avatarThumb?: string
    }

export const MOCK_PORTAL_SOURCES: PortalSourceOption[] = [
  {
    kind: 'channel',
    channel: {
      id: 11,
      slug: 'buddhism',
      title: 'Buddhism',
      author: { id: 11, fullName: 'Mara Ison', avatarThumb: 'https://avatar.vercel.sh/mara-ison' },
    },
  },
  {
    kind: 'channel',
    channel: {
      id: 12,
      slug: 'attempts-at-zen',
      title: 'Attempts At Zen',
      author: { id: 12, fullName: 'Kei Horizon', avatarThumb: 'https://avatar.vercel.sh/kei-horizon' },
    },
  },
  {
    kind: 'channel',
    channel: {
      id: 13,
      slug: 'layout-and-interface',
      title: 'Layout And Interface',
      author: { id: 13, fullName: 'Iris Grid', avatarThumb: 'https://avatar.vercel.sh/iris-grid' },
    },
  },
  {
    kind: 'channel',
    channel: {
      id: 14,
      slug: 'typecast',
      title: 'Typecast',
      author: { id: 14, fullName: 'Rafi Grotesk', avatarThumb: 'https://avatar.vercel.sh/rafi-grotesk' },
    },
  },
  {
    kind: 'author',
    author: {
      id: 42,
      fullName: 'Isolde Finch',
      avatarThumb: 'https://avatar.vercel.sh/isolde',
    },
  },
]

