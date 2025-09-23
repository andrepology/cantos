import { co, z } from 'jazz-tools'
import { ImageDefinition } from 'jazz-tools'

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

export const Root = co.map({
  canvases: co.list(CanvasDoc),
  arena: co
    .map({
      accessToken: z.string().optional(),
      userId: z.number().optional(),
      slug: z.string().optional(),
      name: z.string().optional(),
      avatarUrl: z.string().optional(),
      authorizedAt: z.number().optional(),
    })
    .optional(),
})

export const Account = co.account({
  root: Root,
  profile: co.map({ name: z.string() }),
}).withMigration((acct) => {
  if (!acct.root) {
    acct.$jazz.set('root', Root.create({ canvases: co.list(CanvasDoc).create([]) }))
  }
})

export type LoadedCanvasDoc = co.loaded<typeof CanvasDoc>

