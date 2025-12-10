import { co, z } from 'jazz-tools'
import { ImageDefinition } from 'jazz-tools'

// --- Arena (CoValue) schemas --------------------------------------------------
const ArenaAuthor = co.map({
  id: z.number(),
  username: z.string().optional(),
  fullName: z.string().optional(),
  avatarThumb: z.string().optional(),
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
  url: z.string().optional(),
  originalUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  embedHtml: z.string().optional(),
  provider: z.string().optional(),
  channelSlug: z.string().optional(),
  length: z.number().optional(),
  aspect: z.number().optional(),
  aspectSource: z.enum(['heuristic', 'measured']).optional(),
  user: ArenaAuthor.optional(),
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
  // For streaming
  lastFetchedAt: z.number().optional(),
  fetchedPages: co.list(z.number()).optional(),
  hasMore: z.boolean().optional(),
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
  channels: co.list(ArenaChannel),
  myChannelIds: co.list(z.string()),
  pendingOps: co.list(ArenaPendingOp),
  lastOnlineAt: z.number().optional(),
})


export const CanvasDoc = co.map({
  // Stable key for lookup (e.g., "slides-track" or a route param)
  key: z.string(),
  // TLDraw store snapshot as JSON string (from getSnapshot(store))
  snapshot: z.string(),
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

export const Account = co.account({
  root: Root,
  profile: co.map({ name: z.string() }),
}).withMigration((acct) => {
  if (!acct.root) {
    acct.$jazz.set(
      'root',
      Root.create({
        canvases: co.list(CanvasDoc).create([]),
        arena: ArenaPrivate.create({}),
        globalPanelState: GlobalPanelState.create({ isOpen: false }),
        arenaCache: ArenaCache.create({
          channels: co.list(ArenaChannel).create([]),
          myChannelIds: co.list(z.string()).create([]),
          pendingOps: co.list(ArenaPendingOp).create([]),
        }),
      })
    )
  }
  // Ensure arena map exists for older accounts
  if (acct.root && !acct.root.arena) {
    acct.root.$jazz.set('arena', ArenaPrivate.create({}))
  }
  // Ensure globalPanelState exists for older accounts
  if (acct.root && !acct.root.globalPanelState) {
    acct.root.$jazz.set('globalPanelState', GlobalPanelState.create({ isOpen: false }))
  }
  // Seed arenaCache if missing
  if (acct.root && !acct.root.arenaCache) {
    acct.root.$jazz.set(
      'arenaCache',
      ArenaCache.create({
        channels: co.list(ArenaChannel).create([]),
        myChannelIds: co.list(z.string()).create([]),
        pendingOps: co.list(ArenaPendingOp).create([]),
      })
    )
  }
})

export type LoadedCanvasDoc = co.loaded<typeof CanvasDoc>
export type LoadedArenaBlock = co.loaded<typeof ArenaBlock>
export type LoadedArenaChannel = co.loaded<typeof ArenaChannel>
export type LoadedArenaPendingOp = co.loaded<typeof ArenaPendingOp>
export type LoadedArenaCache = co.loaded<typeof ArenaCache>

