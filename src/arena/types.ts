export type ArenaUser = {
  id: number
  username: string
  full_name: string
  avatar?: string | null
}

export type ArenaBlockClass = 'Image' | 'Text' | 'Link' | 'Media' | 'Channel'

export type ArenaBlock = {
  id: number
  class: ArenaBlockClass | string
  title?: string
  created_at: string
  // Channel block specific (when class === 'Channel')
  length?: number
  updated_at?: string
  description?: string
  content?: string
  content_html?: string
  user?: {
    id: number
    username: string
    full_name: string
    avatar?: { thumb?: string } | null
    avatar_image?: { thumb?: string } | null
  }
  image?: {
    display?: { url?: string }
    original?: { width: number; height: number }
  }
  source?: { url?: string; provider?: { name?: string } }
  embed?: { html?: string }
  attachment?: { url?: string; content_type?: string }
}

export type ArenaChannelResponse = {
  id: number
  title: string
  slug: string
  contents: ArenaBlock[]
  // Channel owner/author (shape mirrors ArenaBlock['user'])
  user?: {
    id: number
    username: string
    full_name: string
    avatar?: { thumb?: string } | null
    avatar_image?: { thumb?: string } | null
  }
  pagination?: { next?: string | null }
}

export type CardBase = {
  id: number
  title: string
  createdAt: string
  user?: ArenaUser
}

export type CardImage = CardBase & {
  type: 'image'
  url: string
  alt: string
  originalDimensions?: { width: number; height: number }
}

export type CardText = CardBase & {
  type: 'text'
  content: string
}

export type CardLink = CardBase & {
  type: 'link'
  url: string
  imageUrl?: string
  provider?: string
}

export type CardMedia = CardBase & {
  type: 'media'
  embedHtml: string
  thumbnailUrl?: string
  provider?: string
  originalUrl?: string
}

// UI card for embedded Channel block
export type CardChannel = CardBase & {
  type: 'channel'
  length: number
  updatedAt?: string
}

export type Card = CardImage | CardText | CardLink | CardMedia | CardChannel


// API return for a channel fetch
export type ChannelData = {
  cards: Card[]
  author?: ArenaUser
  title?: string
}


// Search API (channels)
export type ArenaSearchChannel = {
  id: number
  title: string
  slug: string
  // Shape mirrors ArenaBlock['user'] like the channel response
  user?: {
    id: number
    username: string
    full_name: string
    avatar?: { thumb?: string } | null
    avatar_image?: { thumb?: string } | null
  }
  description?: string
  length?: number
  updated_at?: string
}

export type ArenaChannelSearchResponse = {
  term?: string
  channels: ArenaSearchChannel[]
  total_pages?: number
  current_page?: number
  per?: number
}

// UI-friendly channel search result
export type ChannelSearchResult = {
  id: number
  title: string
  slug: string
  author?: ArenaUser
  description?: string
  length?: number
  updatedAt?: string
}

