# Are.na API v3 Migration Guide

This document outlines the key differences between Are.na API v2 (current) and v3, and serves as a reference for planning the migration.

## Overview

The v3 API introduces:
- Native image dimensions (width, height, aspect_ratio) - eliminates need for client-side measurement
- Structured content with MarkdownContent (markdown/html/plain)
- HATEOAS hypermedia links for resource discovery
- Cleaner discriminated union types for blocks
- Unified search endpoint
- Explicit rate limiting tiers

## Breaking Changes Summary

| Area | v2 | v3 |
|------|----|----|
| Block type field | `class` | `type` |
| Block types | Image, Text, Link, Media, Channel | Image, Text, Link, Attachment, Embed |
| User name field | `username` + `full_name` | `name` + `slug` |
| Image dimensions | Not provided | `width`, `height`, `aspect_ratio`, `blurhash` |
| Response wrapper | Varies | `{ data: [], meta: {} }` |
| Pagination | `total_pages`, `current_page` | `has_more_pages`, `next_page`, `prev_page` |
| Search | Separate `/search/channels`, `/search/users` | Unified `/search` (Premium only) |
| Feed | `/feed` | Not available in v3 |
| Mutations | POST/DELETE for connections | Not documented in v3 yet |

---

## Schema Differences

### Block Types

**v2 Block Classes:**
```typescript
type ArenaBlockClass = 'Image' | 'Text' | 'Link' | 'Media' | 'Channel'
```

**v3 Block Types (discriminated union):**
```typescript
type BlockType = 'Image' | 'Text' | 'Link' | 'Attachment' | 'Embed'
// Note: Channel is NOT a block type in v3 - it's a separate resource
```

Key changes:
- `Media` → `Embed` (for videos, audio, embedded content)
- New `Attachment` type for file downloads (PDF, documents, etc.)
- `Channel` is no longer a block class - channel references are separate resources

### Block Schema

**v3 BaseBlockProperties:**
```typescript
type BaseBlockProperties = {
  id: number
  base_type: 'Block'
  type: 'Text' | 'Image' | 'Link' | 'Attachment' | 'Embed'
  title: string | null
  description: MarkdownContent | null
  state: 'available' | 'pending' | 'failed' | 'processing'
  visibility: 'public' | 'private' | 'orphan'
  comment_count: number
  created_at: string // ISO 8601
  updated_at: string // ISO 8601
  user: EmbeddedUser
  source: BlockSource | null
  _links: Links
}
```

**v3 ImageBlock:**
```typescript
type ImageBlock = BaseBlockProperties & {
  type: 'Image'
  image: BlockImage
}
```

**v3 TextBlock:**
```typescript
type TextBlock = BaseBlockProperties & {
  type: 'Text'
  content: MarkdownContent
}
```

**v3 LinkBlock:**
```typescript
type LinkBlock = BaseBlockProperties & {
  type: 'Link'
  image: BlockImage | null  // Preview image
  content: MarkdownContent | null
}
```

**v3 AttachmentBlock:**
```typescript
type AttachmentBlock = BaseBlockProperties & {
  type: 'Attachment'
  attachment: BlockAttachment
  image: BlockImage | null  // Preview/thumbnail
}
```

**v3 EmbedBlock:**
```typescript
type EmbedBlock = BaseBlockProperties & {
  type: 'Embed'
  embed: BlockEmbed
  image: BlockImage | null  // Thumbnail
}
```

### Image Schema (KEY CHANGE - eliminates aspect measurement)

**v2 ArenaImage:**
```typescript
type ArenaImage = {
  filename?: string
  content_type?: string
  updated_at?: string
  thumb?: { url?: string }
  square?: { url?: string }
  display?: { url?: string }
  large?: { url?: string }
  original?: { url?: string; file_size?: number }
  // NO DIMENSIONS
}
```

**v3 BlockImage:**
```typescript
type BlockImage = {
  alt_text: string | null
  blurhash: string | null           // NEW: For placeholder blur
  width: number | null              // NEW: Native width
  height: number | null             // NEW: Native height
  aspect_ratio: number | null       // NEW: Pre-calculated ratio
  content_type: string
  filename: string
  file_size: number | null
  updated_at: string
  small: ImageVersion               // Renamed from thumb
  medium: ImageVersion              // Renamed from display
  large: ImageVersion
  square: ImageVersion
}

type ImageVersion = {
  src: string                       // Base URL
  src_1x: string                    // 1x resolution
  src_2x: string                    // 2x resolution (Retina)
  src_3x: string                    // 3x resolution
  width: number | null              // Version-specific width
  height: number | null             // Version-specific height
}
```

**Impact:** This eliminates the need for `aspectMeasurement.ts` entirely. We get:
- `aspect_ratio` directly on the image
- `width` and `height` for original dimensions
- Per-version dimensions for responsive images
- `blurhash` for instant placeholders

### MarkdownContent (NEW)

**v3 MarkdownContent:**
```typescript
type MarkdownContent = {
  markdown: string  // Raw markdown source
  html: string      // Pre-rendered HTML
  plain: string     // Plain text (stripped)
}
```

Replaces v2's separate `content`, `content_html`, `description`, `description_html` fields.

### User Schema

**v2 ArenaUser:**
```typescript
type ArenaUser = {
  id: number
  username: string
  full_name: string
  avatar?: string | { thumb?: string; display?: string }
  avatar_image?: { thumb?: string; display?: string }
  channel_count?: number
  follower_count?: number
  following_count?: number
  // ... many flags
}
```

**v3 User:**
```typescript
type User = {
  id: number
  type: 'User'
  name: string                // Replaces full_name
  slug: string                // Replaces username for URLs
  avatar: string | null       // Simplified - just URL
  initials: string
  created_at: string
  updated_at: string
  bio: MarkdownContent | null
  counts: UserCounts
  _links: Links
}

type UserCounts = {
  channels: number            // Replaces channel_count
  followers: number           // Replaces follower_count
  following: number           // Replaces following_count
}
```

**v3 EmbeddedUser (for block.user):**
```typescript
type EmbeddedUser = {
  id: number
  type: 'User'
  name: string
  slug: string
  avatar: string | null
  initials: string
}
```

### Channel Schema

**v2 ArenaChannelResponse:**
```typescript
type ArenaChannelResponse = {
  id: number
  class?: 'Channel'
  title: string
  slug: string
  description?: string
  contents: ArenaBlock[]      // Blocks embedded in response
  created_at: string
  updated_at: string
  length?: number
  status?: string             // 'public' | 'closed' | 'private'
  user?: ArenaUser
  // ... many other fields
}
```

**v3 Channel:**
```typescript
type Channel = {
  id: number
  type: 'Channel'
  slug: string
  title: string
  description: MarkdownContent | null
  state: 'available' | 'deleted'
  visibility: 'public' | 'private' | 'closed'
  created_at: string
  updated_at: string
  owner: User | Group         // Discriminated union
  counts: ChannelCounts
  _links: Links
  // Note: NO contents array - must fetch separately
}

type ChannelCounts = {
  blocks: number
  channels: number
  contents: number            // blocks + channels
  collaborators: number
}
```

**Key change:** Channel responses do NOT include contents inline. Must fetch `/channels/:id/contents` separately.

### Pagination

**v2 Pagination:**
```typescript
// Embedded in response
{
  total_pages?: number
  current_page?: number
  per?: number
  // Sometimes: pagination: { next?: string }
}
```

**v3 PaginationMeta:**
```typescript
type PaginationMetaWithCount = {
  current_page: number
  next_page: number | null
  prev_page: number | null
  per_page: number
  total_pages: number
  total_count: number
  has_more_pages: boolean
}

type PaginationMetaWithoutCount = {
  current_page: number
  next_page: number | null
  prev_page: number | null
  per_page: number
  has_more_pages: boolean
}
```

### Response Wrappers

**v3 uses consistent wrappers:**
```typescript
type ConnectableListResponse = {
  data: (Block | Channel)[]
  meta: PaginationMeta
}

type ChannelListResponse = {
  data: Channel[]
  meta: PaginationMetaWithCount
}

type UserListResponse = {
  data: User[]
  meta: PaginationMetaWithCount
}
```

---

## Endpoint Mappings

### Blocks

| v2 | v3 |
|----|-----|
| `GET /v2/blocks/:id` | `GET /v3/blocks/:id` |
| `GET /v2/blocks/:id/channels` | `GET /v3/blocks/:id/connections` |
| — | `GET /v3/blocks/:id/comments` (NEW) |

### Channels

| v2 | v3 |
|----|-----|
| `GET /v2/channels/:slug` | `GET /v3/channels/:id` (accepts slug) |
| `GET /v2/channels/:slug/contents?page=&per=` | `GET /v3/channels/:id/contents?page=&per=&sort=&type=` |
| `GET /v2/channels/:id/connections` | `GET /v3/channels/:id/connections` |
| — | `GET /v3/channels/:id/followers` (NEW) |
| `POST /v2/channels/:slug/connections` | Not documented yet |
| `DELETE /v2/channels/:slug/connections/:id` | Not documented yet |

**New query params for contents:**
- `sort`: `position_asc`, `position_desc`, `created_at_asc`, `created_at_desc`, `updated_at_asc`, `updated_at_desc`
- `type`: `Image`, `Text`, `Link`, `Attachment`, `Embed`, `Channel`, `Block`
- `user_id`: Filter by creator

### Users

| v2 | v3 |
|----|-----|
| `GET /v2/users/:id` | `GET /v3/users/:id` (accepts slug) |
| `GET /v2/users/:id/channels` | `GET /v3/users/:id/contents?type=Channel` |
| — | `GET /v3/users/:id/contents` (NEW - all content) |
| — | `GET /v3/users/:id/followers` (NEW) |
| — | `GET /v3/users/:id/following` (NEW) |
| — | `GET /v3/me` (NEW - current user) |

### Search

| v2 | v3 |
|----|-----|
| `GET /v2/search/channels?q=` | `GET /v3/search?q=&type=Channel` |
| `GET /v2/search/users?q=` | `GET /v3/search?q=&type=User` |
| `GET /v2/search?q=` | `GET /v3/search?q=` |

**v3 Search is Premium-only** and has advanced features:
- `type[]`: Array filter for multiple types
- `scope`: `all`, `my`, `following`, `user:ID`, `group:ID`, `channel:ID`
- `in[]`: Search within `name`, `description`, `content`, `domain`, `url`
- `ext[]`: File extension filter
- `sort`: `score_desc`, `created_at_asc/desc`, `updated_at_asc/desc`, `name_asc/desc`, `connections_count_desc`, `random`
- `after`: Date filter (ISO 8601)
- `seed`: For reproducible random results

### Feed

| v2 | v3 |
|----|-----|
| `GET /v2/feed?page=&per=` | **Not available** |

The feed endpoint does not exist in v3. We may need to keep using v2 for feed functionality or implement an alternative.

### Groups (NEW in v3)

| v3 |
|-----|
| `GET /v3/groups/:id` |
| `GET /v3/groups/:id/contents` |
| `GET /v3/groups/:id/followers` |

---

## Rate Limiting

**v3 Explicit Tiers:**

| Tier | Requests/Minute |
|------|-----------------|
| Guest (no auth) | 30 |
| Free | 120 |
| Premium | 300 |
| Supporter/Lifetime | 600 |

Rate limit errors return:
```json
{
  "error": {
    "type": "rate_limit_exceeded",
    "message": "...",
    "tier": "free",
    "limit": 120,
    "retry_after": 30,
    "suggestions": ["..."]
  }
}
```

---

## Supporting Schemas

### BlockSource
```typescript
type BlockSource = {
  url: string
  title: string | null
  provider: BlockProvider | null
}

type BlockProvider = {
  name: string
  url: string
}
```

### BlockAttachment
```typescript
type BlockAttachment = {
  filename: string | null
  content_type: string | null
  file_size: number | null
  file_extension: string | null
  updated_at: string | null
  url: string
}
```

### BlockEmbed
```typescript
type BlockEmbed = {
  url: string | null
  type: string | null
  title: string | null
  author_name: string | null
  author_url: string | null
  source_url: string | null
  width: number | null          // Embed dimensions
  height: number | null
  html: string | null           // Embed HTML snippet
  thumbnail_url: string | null
}
```

### HATEOAS Links
```typescript
type Links = {
  self: { href: string }
  [relationship: string]: { href: string }
}
```

---

## Migration Impact Analysis

### Files to Update

1. **`src/arena/types.ts`** - Complete rewrite of type definitions
2. **`src/arena/api.ts`** - Update all fetch functions for new endpoints/schemas
3. **`src/arena/arenaClient.ts`** - Update low-level fetch helpers
4. **`src/arena/blockToCard.ts`** - Update mapping from v3 blocks to Cards
5. **`src/arena/aspectMeasurement.ts`** - **CAN BE DELETED** (v3 provides dimensions)

### Benefits

1. **No more client-side aspect measurement** - Images come with `width`, `height`, `aspect_ratio`
2. **BlurHash placeholders** - Instant visual placeholders while images load
3. **Retina-ready images** - `src_1x`, `src_2x`, `src_3x` variants
4. **Cleaner type discriminators** - `type` field with proper union types
5. **Structured markdown** - Pre-rendered HTML and plain text
6. **Consistent pagination** - `has_more_pages` boolean simplifies logic

### Challenges

1. **No feed endpoint** - May need to keep v2 for feed or implement alternative
2. **No mutations documented** - Connect/disconnect may still need v2
3. **Search is Premium-only** - May affect non-premium users
4. **Channel contents separate** - Extra request needed (was inline in v2)
5. **Channel blocks not a type** - Need to handle channel references differently

### Type Mapping

| v2 Card Type | v3 Block Type | Notes |
|--------------|---------------|-------|
| `image` | `Image` | Direct mapping |
| `text` | `Text` | Use `content.html` |
| `link` | `Link` | May have `image` |
| `media` | `Embed` | Use `embed.html` |
| `pdf` | `Attachment` | Check `content_type` |
| `channel` | — | Not a block; separate Channel resource |

---

---

## Hybrid v2/v3 Strategy

Since v3 lacks feed and mutation endpoints, we'll use a **hybrid approach**:

### Use v3 For (READ operations with better schemas):
| Function | v2 Endpoint | v3 Endpoint | Benefit |
|----------|-------------|-------------|---------|
| `fetchArenaChannel` | `/v2/channels/:slug` | `/v3/channels/:id` | Cleaner schema |
| `fetchArenaChannel` (contents) | `/v2/channels/:slug/contents` | `/v3/channels/:id/contents` | **Image dimensions!** |
| `fetchArenaBlockDetails` | `/v2/blocks/:id` | `/v3/blocks/:id` | Structured types |
| `fetchArenaBlockDetails` (connections) | `/v2/blocks/:id/channels` | `/v3/blocks/:id/connections` | Consistent naming |
| `fetchConnectedChannels` | `/v2/channels/:id/connections` | `/v3/channels/:id/connections` | Better pagination |
| `fetchArenaUser` | `/v2/users/:id` | `/v3/users/:id` | Counts object |
| `fetchArenaUserChannels` | `/v2/users/:id/channels` | `/v3/users/:id/contents?type=Channel` | Type filtering |

### Keep v2 For (mutations + features not in v3):
| Function | v2 Endpoint | Why v2 |
|----------|-------------|--------|
| `searchArenaChannels` | `/v2/search/channels` | v3 search is Premium-only |
| `searchArena` | `/v2/search/channels` + `/v2/search/users` | v3 search is Premium-only |
| `fetchArenaFeed` | `/v2/feed` | No v3 equivalent |
| `connectToChannel` | `POST /v2/channels/:slug/connections` | No v3 mutations |
| `disconnectFromChannel` | `DELETE /v2/channels/:slug/connections/:id` | No v3 mutations |

---

## Current v2 Usage Summary

### Search (KEEP v2)
```typescript
// searchArenaChannels - line 228
GET /v2/search/channels?q=&page=&per=

// searchArena - line 255 (parallel channels + users)
GET /v2/search/channels?q=&page=&per=
GET /v2/search/users?q=&page=&per=
```

### Feed (KEEP v2)
```typescript
// fetchArenaFeed - line 488
GET /v2/feed?page=&per=
```

### Mutations (KEEP v2)
```typescript
// connectToChannel - line 496
POST /v2/channels/:slug/connections
Body: { connectable_type: 'Block' | 'Channel', connectable_id: number }

// disconnectFromChannel - line 542
DELETE /v2/channels/:slug/connections/:connectionId
```

---

## Migration Plan

### Phase 1: Update Types
1. Update `ArenaBlock` in `types.ts` to support v3 shape (add `type` field, update `image` structure)
2. Update `ArenaImage` to include `aspect_ratio`, `width`, `height`, `blurhash`
3. Update `ArenaUser` fields (`name`/`slug` alongside `username`/`full_name`)

### Phase 2: Update blockToCard
1. Update `blockToCard.ts` to handle v3 block shapes
2. Extract `aspect_ratio` directly from `image` field
3. Map v3 `type` values: `Embed` → `media`, `Attachment` → `pdf`/`link`

### Phase 3: Migrate API Endpoints
1. **`fetchArenaChannel`** → v3 `/channels/:id` + `/channels/:id/contents`
2. **`fetchArenaBlockDetails`** → v3 `/blocks/:id` + `/blocks/:id/connections`
3. **`fetchConnectedChannels`** → v3 `/channels/:id/connections`
4. **`fetchArenaUser`** → v3 `/users/:id`
5. **`fetchArenaUserChannels`** → v3 `/users/:id/contents?type=Channel`

### Phase 4: Remove Aspect Measurement
1. Delete `src/arena/aspectMeasurement.ts`
2. Remove measurement calls from sync logic
3. Aspect ratio now comes directly from v3 API

### Phase 5: Keep v2 for Special Endpoints
- Search functions stay on v2 (v3 is Premium-only)
- Feed stays on v2 (no v3 equivalent)
- Connect/disconnect stay on v2 (no v3 mutations)

---

## File Changes Summary

| File | Action | Notes |
|------|--------|-------|
| `types.ts` | Update | Add v3 fields to existing types |
| `blockToCard.ts` | Update | Handle v3 block shapes, extract `aspect_ratio` |
| `api.ts` | Update | Change endpoints `/v2/` → `/v3/` for read ops |
| `arenaClient.ts` | Update | Add v3 fetch helpers |
| `aspectMeasurement.ts` | **DELETE** | No longer needed |

---

## Next Steps

1. Update `types.ts` with v3 fields
2. Update `blockToCard.ts` for v3 shapes
3. Migrate `fetchArenaChannel` to v3 (biggest win - images with dimensions)
4. Test aspect ratios flow through correctly
5. Delete `aspectMeasurement.ts`
6. Migrate remaining read operations
7. Keep v2 for search/feed/mutations
