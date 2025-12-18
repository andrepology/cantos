# Arena Registry Refactor Plan

## Overview
Move from linear search in the `arenaCache` to $O(1)$ lookups using Jazz `co.record`. This transition implements a "Registry Pattern" where external IDs (Slugs and Arena IDs) serve as keys to stable internal Jazz CoValues.

## 1. Schema Evolution (`src/jazz/schema.ts`)
Add registries to the `ArenaCache` map to support deterministic lookups.

```typescript
export const ArenaCache = co.map({
  // Registries
  channelsBySlug: co.record(z.string(), ArenaChannel),
  blocksByArenaId: co.record(z.string(), ArenaBlock),
  
  // Existing fields
  channels: co.list(ArenaChannel), // Kept for legacy/ordered listing
  myChannelIds: co.list(z.string()),
  pendingOps: co.list(ArenaPendingOp),
  lastOnlineAt: z.number().optional(),
})
```

## 2. Sync Logic Update (`src/arena/channelSync.ts`)
Ensure the registries are populated and maintained during the Are.na sync process.

### Block Deduplication & Registry Population
- **Normalization**: In `syncNextPage`, check `cache.blocksByArenaId[arenaId]` before creating a new `ArenaBlock`. 
- **Identity Consistency**: If the block already exists in the registry, reuse its Jazz reference instead of creating a duplicate. This ensures that metadata like `aspectRatio` is shared globally.
- **Update**: Always ensure the registry key is set: `cache.blocksByArenaId.$jazz.set(String(arenaId), blockInstance)`.

### Channel Registry
- **Metadata Sync**: In `syncMetadata`, insert the channel into `cache.channelsBySlug[slug]`.

## 3. Hook Refactors (O(1) Surgical Resolves)
Refactor hooks to subscribe only to the specific entity needed.

### `useBlockMetadata.ts`
- **Old**: Resolves `channels -> blocks` and finds via `.find()`.
- **New**: Resolves `root.arenaCache.blocksByArenaId[String(blockId)]`.

### `useChannelMetadata.ts`
- **Old**: Resolves `channels` and finds via `.find()`.
- **New**: Resolves `root.arenaCache.channelsBySlug[slug]`.

### `useArenaChannelStream.ts`
- Use `channelsBySlug` for the initial channel lookup.

## 4. Cache Consolidation
### Aspect Ratio persistence
- Leverage the `aspect` field on the `ArenaBlock` CoValue.
- Mark `useAspectRatioCache.ts` as deprecated.
- Update `src/arena/blockToCard.ts` to prioritize the CoValue's stored `aspect`.

## 5. Migration & Performance
- **Zero-downtime**: Jazz handles `undefined` for new fields. Registry population is side-effected during normal syncs.
- **Performance**: Reduces Root-level re-renders by moving from deep `resolve: { channels: { $each: true } }` to specific key resolves.
