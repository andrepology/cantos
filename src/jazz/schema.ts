import { co, z } from 'jazz-tools'

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
})

export const Root = co.map({
  canvases: co.list(CanvasDoc),
})

export const Account = co.account({
  root: Root,
  profile: co.map({ name: z.string() }),
})

export type LoadedCanvasDoc = co.loaded<typeof CanvasDoc>

