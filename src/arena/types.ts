// =============================================================================
// ARENA API TYPES
// Types derived from raw Are.na API responses
// =============================================================================

/** User information from Arena API */
export type ArenaUser = {
  id: number
  username: string
  full_name: string

  // Avatars
  avatar?: string | null
  avatar_image?: { thumb?: string; display?: string } | null

  // Counts
  channel_count?: number
  follower_count?: number
  following_count?: number

  // Flags / badges
  badge?: string
  initials?: string
  can_index?: boolean
  is_premium?: boolean
  is_lifetime_premium?: boolean
  is_supporter?: boolean
  is_exceeding_connections_limit?: boolean
  is_confirmed?: boolean
  is_pending_reconfirmation?: boolean
  is_pending_confirmation?: boolean
}

interface ArenaImageOriginal {
  url?: string
  file_size?: number
  file_size_display?: string
}

interface ArenaImageSizes {
  url?: string
}

interface ArenaImage {
  filename?: string
  content_type?: string
  updated_at?: string

  thumb?: ArenaImageSizes
  square?: ArenaImageSizes
  display?: ArenaImageSizes
  large?: ArenaImageSizes
  original?: ArenaImageOriginal
}

interface ArenaEmbed {
  url?: string
  type?: string
  title?: string
  author_name?: string
  author_url?: string
  source_url?: string | null
  thumbnail_url?: string | null
  width?: number
  height?: number
  html?: string
}

interface ArenaAttachment {
  url?: string
  content_type?: string
  file_size?: number
  file_size_display?: string
}

/** Block class types supported by Arena */
export type ArenaBlockClass = 'Image' | 'Text' | 'Link' | 'Media' | 'Channel'

/** Block data from Arena API - represents individual content items */
export type ArenaBlock = {
  id: number
  class: ArenaBlockClass | string
  base_class?: string

  metadata?: any
  title?: string
  created_at: string
  // Channel block specific (when class === 'Channel')
  length?: number
  updated_at?: string
  description?: string
  content?: string
  content_html?: string
  description_html?: string

  state?: string
  visibility?: string
  generated_title?: string
  comment_count?: number
  position?: number
  selected?: boolean
  connection_id?: number
  connected_at?: string
  connected_by_user_id?: number
  connected_by_username?: string
  connected_by_user_slug?: string

  user?: ArenaUser
  image?: ArenaImage
  source?: { url?: string; provider?: { name?: string } }
  embed?: ArenaEmbed | null
  attachment?: ArenaAttachment | null
  connections?: any[]
}

/** Channel data from Arena API - contains channel metadata and block contents */
export type ArenaChannelResponse = {
  id: number
  class?: 'Channel' | string
  base_class?: 'Channel' | string
  title: string
  slug: string
  description?: string | null
  contents: ArenaBlock[]
  created_at: string
  updated_at: string

  added_to_at?: string
  length?: number
  status?: string
  kind?: string
  open?: boolean
  collaboration?: boolean
  collaborator_count?: number
  collaborators?: ArenaUser[]
  published?: boolean

  share_link?: string
  owner?: any
  owner_id?: number
  owner_slug?: string
  owner_type?: string
  class_name?: string
  can_index?: boolean
  follower_count?: number
  manifest?: any
  metadata?: any
  group?: string | null
  state?: string

  page?: number
  per?: number
  total_pages?: number | null
  current_page?: number | null

  'nsfw?'?: boolean

  // Channel owner/author (shape mirrors ArenaBlock['user'])
  user?: ArenaUser
  pagination?: { next?: string | null }
}

// =============================================================================
// Channel connections: /v2/channels/:id/connections
// =============================================================================

export type ArenaChannelListResponse = {
  length: number
  total_pages: number
  current_page: number
  per: number
  channel_title: string
  id: number
  base_class: 'Channel' | string
  class: 'Channel' | string
  channels: ArenaConnectedChannel[]
}

export type ArenaConnectedChannel = {
  id: number
  title: string
  slug: string
  length: number
  created_at: string
  updated_at: string
  added_to_at: string
  published: boolean
  open: boolean
  collaboration: boolean
  collaborator_count: number
  kind: 'default' | string
  status: 'public' | 'closed' | string
  follower_count: number
  can_index: boolean
  owner_type: 'User' | string
  owner_id: number
  owner_slug: string
  'nsfw?': boolean
  state: 'available' | string
  share_link: string | null
  metadata: { description?: string | null } | null
  user: ArenaUser
}

/** Block details with connections - expanded view for metadata panel */
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

/** A channel connected to a block */
export type ArenaBlockConnection = {
  id: number
  title: string
  slug: string
  author?: ArenaUser
  updatedAt?: string
  length?: number
}

// =============================================================================
// INTERNAL CARD TYPES
// UI-focused types for displaying content in decks and portals
// =============================================================================

/** Author info shape used by Card (matches ArenaAuthor CoValue) */
export type CardAuthor = {
  id: number
  username?: string
  fullName?: string
  avatarThumb?: string
}

/** Base card properties shared across all card types */
export type CardBase = {
  id: number
  title: string
  createdAt: string
  user?: CardAuthor
  aspect?: number
}

/** Image content card */
export type CardImage = CardBase & {
  type: 'image'
  url: string
  alt: string
  // API no longer provides dimensions; keep legacy optional field for compatibility
  originalDimensions?: { width: number; height: number }
  originalFile?: { url?: string; fileSize?: number; fileSizeDisplay?: string }
}

/** Text content card */
export type CardText = CardBase & {
  type: 'text'
  content: string
}

/** Link content card */
export type CardLink = CardBase & {
  type: 'link'
  url: string
  imageUrl?: string
  provider?: string
}

/** Embedded media content card (video, audio, etc.) */
export type CardMedia = CardBase & {
  type: 'media'
  embedHtml: string
  thumbnailUrl?: string
  provider?: string
  originalUrl?: string
}

/** PDF document card */
export type CardPDF = CardBase & {
  type: 'pdf'
  url: string
  thumbnailUrl?: string
  fileSize?: string
  contentType: string
}

/** Channel preview card for embedded channel blocks */
export type CardChannel = CardBase & {
  type: 'channel'
  slug?: string
  length: number
  updatedAt?: string
}

/** Author biography card for user profiles */
export type CardAuthorBio = CardBase & {
  type: 'author-bio'
  avatar?: string
  fullName?: string
  username?: string
  blockCount?: number
  followerCount?: number
  followingCount?: number
  bio?: string
}

/** Author following count card */
export type CardAuthorFollowing = CardBase & {
  type: 'author-following'
  followerCount: number
  followingCount: number
}

/** Author channels list card */
export type CardAuthorChannels = CardBase & {
  type: 'author-channels'
  channels: { id: number; title: string; slug?: string; blockCount?: number }[]
}

/** Union type for all card variants */
export type Card =
  | CardImage
  | CardText
  | CardLink
  | CardMedia
  | CardPDF
  | CardChannel
  | CardAuthorBio
  | CardAuthorFollowing
  | CardAuthorChannels

// =============================================================================
// API RESPONSE TYPES
// Types for processed API responses and data structures
// =============================================================================

/** Processed channel data returned by fetchArenaChannel */
export type ChannelData = {
  id?: number  // Channel ID (useful for connecting channels)
  cards: Card[]
  author?: ArenaUser
  title?: string
  createdAt?: string
  updatedAt?: string
}

/** Channel connected to another channel */
export type ConnectedChannel = {
  id: number
  title: string
  slug: string
  author?: ArenaUser
  updatedAt?: string
  length?: number
  connectionId?: number // The connection ID (needed for disconnect)
}

// =============================================================================
// SEARCH TYPES
// Types for search functionality across users and channels
// =============================================================================

/** Raw channel search result from Arena API */
export type ArenaSearchChannel = {
  id: number
  title: string
  slug: string
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

/** Paginated channel search response */
export type ArenaChannelSearchResponse = {
  term?: string
  channels: ArenaSearchChannel[]
  total_pages?: number
  current_page?: number
  per?: number
}

/** UI-friendly channel search result */
export type ChannelSearchResult = {
  id: number
  title: string
  slug: string
  author?: ArenaUser
  description?: string
  length?: number
  updatedAt?: string
}

/** User search result */
export type UserSearchResult = {
  id: number
  username: string
  full_name: string
  avatar?: string | null
}

/** Union type for mixed user/channel search results */
export type SearchResult =
  | ({ kind: 'channel' } & ChannelSearchResult)
  | ({ kind: 'user' } & UserSearchResult)

// =============================================================================
// INDEX/LISTING TYPES
// Types for channel listings and user indexes
// =============================================================================

/** List item for a user's channels index */
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

// =============================================================================
// ACTIVITY FEED TYPES
// Types for user activity and feed functionality
// =============================================================================

/** Individual feed item from activity feed API */
export type FeedItem = {
  id: number // bulletin ID
  action: 'added' | 'commented on'
  bulletin_id: number
  connector: string // "to"
  created_at: string
  item_id: number
  target_id: number
  item_type: 'Block' | 'Channel'
  target_type: 'Channel'
  parent_id: number | null
  item: ArenaBlock | ArenaChannelResponse // The item that was added/commented on
  target: ArenaChannelResponse // The channel it was added to
  parent: any | null // Connection details
  user: ArenaUser // User who performed the action
}

/** Feed response containing activity items */
export type FeedResponse = {
  items: FeedItem[]
  // May include pagination info in future
}
