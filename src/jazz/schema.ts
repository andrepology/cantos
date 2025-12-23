import { Group, co, z } from 'jazz-tools'
import { ImageDefinition } from 'jazz-tools'

// --- Arena (CoValue) schemas --------------------------------------------------
export const ArenaAuthor = co.map({
  id: z.number(),
  username: z.string().optional(),
  fullName: z.string().optional(),
  avatarThumb: z.string().optional(),
  // Profile metadata (fetched on demand)
  bio: z.string().optional(),
  followerCount: z.number().optional(),
  followingCount: z.number().optional(),
  channelCount: z.number().optional(),
  // User's channels (fetched on demand) - getter for circular reference
  get channels(): co.Optional<co.List<typeof ArenaChannelConnection>> {
    return co.optional(co.list(ArenaChannelConnection))
  },
  // Sync bookkeeping
  lastFetchedAt: z.number().optional(),
  error: z.string().optional(),
})

export const ArenaChannelConnection = co.map({
  id: z.number(),
  slug: z.string(),
  title: z.string(),
  length: z.number().optional(),
  addedToAt: z.string().optional(),
  updatedAt: z.string().optional(),
  published: z.boolean().optional(),
  open: z.boolean().optional(),
  followerCount: z.number().optional(),
  description: z.string().optional(),
  author: ArenaAuthor.optional(),
})

export const ArenaBlock = co.map({
  // Use string to support temp IDs; store numeric source in arenaId when present
  blockId: z.string(),
  arenaId: z.number().optional(),
  type: z.enum(['image', 'text', 'link', 'media', 'pdf', 'channel']),
  title: z.string().optional(),
  createdAt: z.string().optional(),
  description: z.string().optional(),
  content: z.string().optional(),

  // Image URLs (normalized from API response)
  thumbUrl: z.string().optional(), // ~400px - fastest for measurement
  displayUrl: z.string().optional(), // Medium - primary display
  largeUrl: z.string().optional(), // High-res
  originalFileUrl: z.string().optional(), // Full original (for download)

  // Embed (for media blocks)
  embedHtml: z.string().optional(),
  embedWidth: z.number().optional(),
  embedHeight: z.number().optional(),
  provider: z.string().optional(),

  // Channel blocks
  channelSlug: z.string().optional(),
  length: z.number().optional(),

  // Aspect ratio (measured during sync, not render)
  aspect: z.number().optional(),
  aspectSource: z.enum(['measured']).optional(),

  user: ArenaAuthor.optional(),
  updatedAt: z.string().optional(),
  
  // Connections (fetched on focus)
  connections: co.list(ArenaChannelConnection).optional(),
  connectionsLastFetchedAt: z.number().optional(),
  connectionsError: z.string().optional(),
})

export const ArenaChannel = co.map({
  slug: z.string(),
  channelId: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  author: ArenaAuthor.optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  length: z.number().optional(),
  blocks: co.list(ArenaBlock),
  connections: co.list(ArenaChannelConnection).optional(),
  connectionsLastFetchedAt: z.number().optional(),
  connectionsError: z.string().optional(),
  // For streaming
  lastFetchedAt: z.number().optional(),
  fetchedPages: co.list(z.number()).optional(),
  hasMore: z.boolean().optional(),
  error: z.string().optional(),
})

export const ArenaPendingOp = co.map({
  opId: z.string(),
  type: z.enum(['reorder', 'add', 'remove']),
  channelSlug: z.string(),
  payloadJson: z.string(), // opaque payload to be decoded by sync loop
  createdAt: z.number(),
  retries: z.number(),
  status: z.enum(['pending', 'syncing', 'failed']),
  tempBlockId: z.string().optional(),
  realBlockId: z.string().optional(),
})

export const ArenaCache = co.map({
  // O(1) lookup by channel slug
  channels: co.record(z.string(), ArenaChannel),
  // O(1) lookup by Arena block ID (global registry - same block in multiple channels = single CoValue)
  blocks: co.record(z.string(), ArenaBlock),
  // O(1) lookup by Arena user ID
  authors: co.record(z.string(), ArenaAuthor),
  // Ordering for "my channels" UI
  myChannelIds: co.list(z.string()),
  pendingOps: co.list(ArenaPendingOp),
  lastOnlineAt: z.number().optional(),
})


export const CanvasDoc = co.map({
  // Stable key for lookup (e.g., "slides-track" or a route param)
  key: z.string(),
  // TLDraw store snapshot as JSON string (from getSnapshot(store))
  snapshot: z.string(),
  // Camera persistence (optional, lightweight session subset)
  cameraX: z.number().optional(),
  cameraY: z.number().optional(),
  cameraZ: z.number().optional(),
  // Optional metadata / prefs we may evolve into later
  title: z.string().optional(),
  prefs: co
    .map({
      grid: z.number().optional(),
      minZoom: z.number().optional(),
    })
    .optional(),
  // Optional bookkeeping for image assets attached to this canvas
  assets: co
    .list(
      co.map({
        tlAssetId: z.string(),
        image: ImageDefinition,
        name: z.string().optional(),
        mime: z.string().optional(),
      })
    )
    .optional(),
})

export const GlobalPanelState = co.map({
  isOpen: z.boolean(),
})

export const ArenaPrivate = co.map({
  accessToken: z.string().optional(),
  userId: z.number().optional(),
  slug: z.string().optional(),
  name: z.string().optional(),
  avatarUrl: z.string().optional(),
  authorizedAt: z.number().optional(),
})

export const Root = co.map({
  canvases: co.list(CanvasDoc),
  arena: ArenaPrivate,
  globalPanelState: GlobalPanelState.optional(),
  arenaCache: ArenaCache.optional(),
})

export const Profile = co.profile({ name: z.string() })

export const Account = co.account({
  root: Root,
  profile: Profile,
}).withMigration(async (acct) => {
  if (!acct.$jazz.has('root')) {
    acct.$jazz.set(
      'root',
      Root.create({
        canvases: co.list(CanvasDoc).create([]),
        arena: ArenaPrivate.create({}),
        globalPanelState: GlobalPanelState.create({ isOpen: false }),
        arenaCache: ArenaCache.create({
          channels: co.record(z.string(), ArenaChannel).create({}),
          blocks: co.record(z.string(), ArenaBlock).create({}),
          authors: co.record(z.string(), ArenaAuthor).create({}),
          myChannelIds: co.list(z.string()).create([]),
          pendingOps: co.list(ArenaPendingOp).create([]),
        }),
      })
    )
  }

  if (!acct.$jazz.has('profile')) {
    const profileGroup = Group.create()
    profileGroup.makePublic()
    acct.$jazz.set('profile', Profile.create({ name: 'New user' }, profileGroup))
  }

  const { root } = await acct.$jazz.ensureLoaded({ resolve: { root: true } })
  if (!root) return

  if (!root.$jazz.has('arena')) root.$jazz.set('arena', ArenaPrivate.create({}))
  if (!root.$jazz.has('canvases')) {
    root.$jazz.set('canvases', co.list(CanvasDoc).create([]))
  }
  if (!root.$jazz.has('globalPanelState')) {
    root.$jazz.set('globalPanelState', GlobalPanelState.create({ isOpen: false }))
  }
  if (!root.$jazz.has('arenaCache')) {
    root.$jazz.set(
      'arenaCache',
      ArenaCache.create({
        channels: co.record(z.string(), ArenaChannel).create({}),
        blocks: co.record(z.string(), ArenaBlock).create({}),
        authors: co.record(z.string(), ArenaAuthor).create({}),
        myChannelIds: co.list(z.string()).create([]),
        pendingOps: co.list(ArenaPendingOp).create([]),
      })
    )
  }
})

export type LoadedCanvasDoc = co.loaded<typeof CanvasDoc>
export type LoadedArenaBlock = co.loaded<typeof ArenaBlock>
export type LoadedArenaChannel = co.loaded<typeof ArenaChannel>
export type LoadedArenaChannelConnection = co.loaded<typeof ArenaChannelConnection>
export type LoadedArenaAuthor = co.loaded<typeof ArenaAuthor>
export type LoadedArenaPendingOp = co.loaded<typeof ArenaPendingOp>
export type LoadedArenaCache = co.loaded<typeof ArenaCache>
