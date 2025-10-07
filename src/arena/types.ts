export type ArenaUser = {
  id: number
  username: string
  full_name: string
  avatar?: string | null
  channel_count?: number
  follower_count?: number
  following_count?: number
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

export type CardPDF = CardBase & {
  type: 'pdf'
  url: string
  thumbnailUrl?: string
  fileSize?: string
  contentType: string
}

// UI card for embedded Channel block
export type CardChannel = CardBase & {
  type: 'channel'
  slug?: string
  length: number
  updatedAt?: string
}

export type Card = CardImage | CardText | CardLink | CardMedia | CardPDF | CardChannel


// API return for a channel fetch
export type ChannelData = {
  cards: Card[]
  author?: ArenaUser
  title?: string
}

// Connected channels for a channel (channels/:id/channels)
export type ConnectedChannel = {
  id: number
  title: string
  slug: string
  author?: ArenaUser
  updatedAt?: string
  length?: number
}


// Block details (for right-side metadata panel)
export type ArenaBlockConnection = {
  id: number
  title: string
  slug: string
  author?: ArenaUser
  updatedAt?: string
  length?: number
}

export type ArenaBlockDetails = {
  id: number
  title?: string
  class?: string
  descriptionHtml?: string | null
  contentHtml?: string | null
  createdAt?: string
  updatedAt?: string
  user?: ArenaUser
  connections: ArenaBlockConnection[]
  // Whether more connections exist when fetched via paginated API
  hasMoreConnections?: boolean
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

// Mixed search: users + channels
export type UserSearchResult = {
  id: number
  username: string
  full_name: string
  avatar?: string | null
}

export type SearchResult =
  | ({ kind: 'channel' } & ChannelSearchResult)
  | ({ kind: 'user' } & UserSearchResult)

// Simple list item for a user's channels index
export type UserChannelListItem = {
  id: number
  title: string
  slug: string
  thumbUrl?: string
  updatedAt?: string
  // Optional metadata for richer index rendering
  length?: number
  // Public/private visibility; string to be resilient to API wording
  status?: string
  // Whether the channel is open for collaboration
  open?: boolean
  // Channel owner
  author?: ArenaUser
}

