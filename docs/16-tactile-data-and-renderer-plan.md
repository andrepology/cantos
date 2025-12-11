# Tactile Portal — Data, Renderer, and Sync Plan (Jazz-first)

## Goals
- Progressive channel streaming (1000+ blocks) without blocking UI.
- Jazz CoValues as the cache (channels/blocks/aspects/pending ops).
- Stable sizing with zero flicker (heuristic aspect first, measured aspect only when meaningfully different).
- Simple renderer: fixed box per card; no IntrinsicPreview; minimal data-*.
- Local-first with offline edits; remote-wins conflict policy; temp IDs mapped on sync; surface stale/sync state.

---

## Architecture Overview
- **CoValues as source of truth:** `ArenaChannel` + `ArenaBlock` + `ArenaPendingOp` inside `ArenaCache` on the account root. Built-in offline persistence and reactivity.
- **Streaming fetcher:** paged Arena REST fetch that mutates the `ArenaChannel` CoValue (append/replace blocks, update `lastFetchedAt/hasMore/fetchedPages`); prefetch near end + idle.
- **Aspect pipeline:** heuristic first, measured update with epsilon guard; aspect stored on `ArenaBlock`.
- **Renderer:** `TactileCardRenderer({ card, width, height, ... })`, fixed box, per-type paint; no IntrinsicPreview.
- **Offline/sync:** pending ops live as CoValues; optimistic local mutations; remote-wins conflict handling; tempId→realId mapping for adds.

---

## CoValue Shapes

- `ArenaBlock`: blockId, type, title, createdAt, type-specific fields (url/content/thumb/embedHtml/provider/originalUrl/description/channelSlug/length), aspect + aspectSource, user info.
- `ArenaChannel`: slug, channelId, title, description, author info, createdAt/updatedAt, `blocks: co.list(ArenaBlock)`, `length`, `lastFetchedAt`, `fetchedPages`, `hasMore`.
- `ArenaPendingOp`: opId, type (`reorder|add|remove`), channelSlug, payloadJson, createdAt, retries, status (`pending|syncing|failed`), tempBlockId?, realBlockId?.
- `ArenaCache` on account root: `channels: co.list(ArenaChannel)`, `myChannelIds: z.array(z.string())`, `pendingOps: co.list(ArenaPendingOp)`, `lastOnlineAt?`.
- `CanvasAccount`: add `arenaCache` under `root`.

---

## Streaming Channel Fetch (CoValue mutations)

- Shallow subscription for lists: resolve `{ root: { arenaCache: { channels: true, pendingOps: true } } }`.
- Lookup by slug with linear `find` (10–300 channels): `const channel = me?.root.arenaCache.channels.find(c => c.slug === slug)`.
- Deep subscription for active channel: `useCoState(ArenaChannel, channel?.id, { blocks: { $each: true } })`.
- Staleness: helper `isStale(channel, maxAgeMs)` uses `lastFetchedAt` (missing/old).
- Fetcher (paged) mutates `channel`: append/replace blocks, update meta, `lastFetchedAt`, `fetchedPages`, `hasMore`.
- Invalidate: clear `lastFetchedAt/hasMore/fetchedPages` (optionally blocks) to force refetch.

---

## Aspect Pipeline (CoValue-based)

- Heuristic aspect per type (image 4:3, media 16:9, pdf 0.77, link 1.6, text 0.83, channel 0.91) stored on `ArenaBlock.aspect` with `aspectSource='heuristic'`.
- Measurement loader (small parallel pool): when a card is visible, load image; if `|measured - aspect| / aspect > 0.1`, set `block.aspect` and `aspectSource='measured'`.
- Layout reads `block.aspect` (fallback heuristic); no separate cache.

---

## Renderer Contract (sketch)

- `TactileCardRenderer({ card, width, height, ...events })`
- Per type: image/media/pdf/link → `<img>` with `object-fit: contain`; text → packed font; channel → centered meta.
- Fixed box; minimal data-* (id/type); no IntrinsicPreview.

---

## Offline / Sync (remote wins) — with code sketch

Principles
- Optimistic local update; queue ops while offline.
- Remote wins on conflict; on 409/412, refetch and drop op.
- Temp IDs for new blocks are mapped to real IDs on successful add.
- Stale state surfaced: `channel.stale`, `pendingCount`, `lastSyncedAt`.

Pending ops and sync
```ts
// queue ops
function enqueue(op: PendingOp) {
  cache.pushPendingOp(op);
  persistPendingOps(); // localStorage or Jazz later
  if (navigator.onLine) syncPending();
}

// optimistic reorder
function reorderChannel(slug: string, ids: number[]) {
  const ch = cache.getChannel(slug);
  if (!ch) return;
  const map = new Map(ch.cards.map(c => [c.id, c]));
  const reordered = ids.map(id => map.get(id)).filter(Boolean) as Card[];
  cache.setChannel(slug, { ...ch, cards: reordered, stale: true });
  enqueue({ id: crypto.randomUUID(), type: 'reorder', slug, ids, ts: Date.now(), retries: 0 });
}

// sync loop
async function syncPending() {
  const ops = [...cache.getPendingOps()];
  for (const op of ops) {
    try {
      if (op.type === 'reorder') {
        await arenaApi.sortChannel(op.slug, op.ids);
      } else if (op.type === 'add') {
        const real = await arenaApi.addBlock(op.slug, op.block);
        // map tempId -> realId in channel cards
      } else if (op.type === 'remove') {
        await arenaApi.disconnectBlock(op.connectionId);
      }
      cache.popPendingOp(op.id);
      cache.setChannel(op.slug, { ...cache.getChannel(op.slug)!, stale: false, lastSyncedAt: Date.now() });
    } catch (err: any) {
      if (isConflict(err)) {
        const fresh = await fetchArenaChannel(op.slug);
        cache.setChannel(op.slug, { ...fresh, stale: false, lastSyncedAt: Date.now() });
        cache.popPendingOp(op.id); // remote wins
      } else if (isNetwork(err)) {
        // keep op, retry later (backoff outside)
        break;
      } else {
        cache.popPendingOp(op.id); // drop unknown errors to avoid deadlock
      }
    }
  }
  persistPendingOps();
}
```

Temp ID mapping (adds)
- When adding offline, create `tempId` and insert a local Card with that id.
- On successful POST, replace `tempId` with the real `id` in the channel entry.

Persistence stub
- `persistPendingOps()` → localStorage for now.
- Adapter interface already in cache to swap to Jazz later.

UI hooks
- `pendingCount(slug)` → badge.
- `stale` flag → “syncing…” label.
- `lastSyncedAt` → freshness indicator.

---


---

## Implementation Phases (updated)
1) **CoValue schemas**: define `ArenaBlock`, `ArenaChannel`, `ArenaPendingOp`, `ArenaCache` (channels, myChannelIds, pendingOps, timestamps).
2) **Streaming hook**: paged fetch, cache-aware seeding, prefetch, error state.
3) **Aspect pipeline**: heuristic prime, measured update with epsilon, guarded loader pool.
4) **Renderer**: new `TactileCardRenderer` wired into `TactileCard`; remove IntrinsicPreview reliance.
5) **Sync loop**: enqueue ops, sync on reconnect, remote-wins conflict handling, tempId mapping, UI stale signals.

---

## Files to Create/Modify (unchanged)
- `src/shapes/components/TactileCardRenderer.tsx`
- `src/shapes/TactilePortalShape.tsx`
- `src/shapes/components/TactileDeck.tsx`
- `src/arena/hooks/useTactileLayout.ts`
- `src/jazz/schema.ts`
- `src/editor/SlideEditor.tsx`

---

## Filesystem Mirroring (Option A — per-channel folder, Obsidian-friendly)

Goal: export/cache to a user-chosen folder so editors (Obsidian, native FS) can browse. Uses File System Access API (Chromium) with a “Select folder” + “Sync” button; for cross-browser/background writes, fall back to zip export or desktop shell (Tauri/Electron).

Layout (per channel)
```
channel-{slug}/
  index.md                # channel meta, description, ordered list of block files
  blocks/
    image-123.md
    text-234.md
    link-345.md
    pdf-456.md
    media-567.md
    channel-678.md        # embedded channel cards
  assets/
    image-123.jpg
    link-345.jpg
    pdf-456.pdf
    media-567.jpg         # thumbnails
```

Markdown frontmatter per type
- image: `id, type, title, createdAt, user, aspect, sourceUrl, assetPath`
- text: `id, type, title, createdAt, user`
- link: `id, type, title, createdAt, user, url, imageUrl, provider, contentHtml?`
- media: `id, type, title, createdAt, user, provider, originalUrl, thumbnailPath?, embedHtml`
- pdf: `id, type, title, createdAt, user, url, fileSize?, contentType, pdfPath, thumbnailPath?`
- channel (embedded): `id, type: channel, title, slug, length, updatedAt, description?`
- channel index: `slug, title, author, updatedAt, description?, length, lastSyncedAt, stale?, pendingCount`

Notes
- Assets are real files (`.jpg`, `.pdf`), referenced relatively (`![title](../assets/image-123.jpg)`).
- Users can drop new files into `assets/`; the app can scan and offer to import/connect.
- Start with a user-initiated “Select folder” + “Sync to folder” to satisfy permissions; cache directory handle where supported.

---

## Phased Checklist (with checkboxes)

### Phase 1 — Jazz Schemas
- [X] Define `ArenaBlock`, `ArenaChannel`, `ArenaPendingOp`, `ArenaCache` (channels, myChannelIds, pendingOps, timestamps).
- [X] Add `arenaCache` to `CanvasAccount` root; migration to initialize if missing.

### Phase 2 — Channel Fetch (Streaming) via CoValues
- [X] Implement paged fetcher mutating `ArenaChannel`: append/replace blocks, update meta, `lastFetchedAt`, `fetchedPages`, `hasMore`.
- [X] Hook: shallow subscribe to `channels`, find by slug; deep subscribe active channel via `useCoState(ArenaChannel, id, { blocks: { $each: true } })`.
- [X] Staleness check (timestamp-based); invalidate by clearing `lastFetchedAt/hasMore/fetchedPages` (optional blocks clear).

Streaming plan (implemented in `channelSync.ts` + `useArenaChannelStream.ts`)
- API: `syncChannelPage(cache, slug, page?, { per?, force? })` and `useArenaChannelStream(slug) -> { channel, blocks, loading, error, hasMore, fetchNext, refresh }`.
- Page choice: explicit `page` or default `next = Math.max(...fetchedPages) + 1`, reset to 1 when missing/stale.
- Staleness: skip if not `force` and page already in `fetchedPages` and `!isStale(channel, maxAgeMs)`.
- Fetch: `/channels/{slug}/contents?page={page}&per={per}&sort=position&direction=desc` using existing auth/arenaFetch.
- Normalize to `ArenaBlock` CoValue (keep ids, type mapping, author, meta); prime heuristic aspect (image 4:3, media 16:9, pdf 0.77, link 1.6, text 0.83, channel 0.91, aspectSource='heuristic').
- Mutations: page 1 or `force` => `$jazz.splice(0, len, ...blocks)` (preserves list identity), `fetchedPages=[1]`; otherwise `$jazz.push` page blocks and append page number. Update `hasMore`, `lastFetchedAt=Date.now()`, `length/title/author/createdAt/updatedAt`.
- Inflight dedupe per `{slug}:{page}`; reuse promise if concurrent.
- Hook flow: shallow-find channel by slug; deep subscribe on id with `{ blocks: { $each: true } }`. On mount: if missing or stale, call `syncChannelPage(slug, 1)`. `fetchNext` when `hasMore` and not inflight; `refresh` calls `syncChannelPage(slug, 1, { force: true })`.

### Phase 3 — Aspect Pipeline & Layout
- [X] Apply heuristic aspect on normalize; store via `block.aspect` + `aspectSource='heuristic'`. *(Implemented in `channelSync.normalizeBlock`; blocks carry `aspect` into the deck.)*
- [ ] Guarded measurement loader (parallel pool, epsilon >10% to update); visibility-triggered.
- [X] `useTactileLayout` reads `block.aspect` (fallback heuristic) for width/height; no `mockAspect`. *(Layout now prefers `aspect`, retains legacy fallback.)*
- [ ] Defer updates during scroll if needed to avoid jitter.

### Phase 4 — Renderer Simplification
- [X] Add `TactileCardRenderer` (fixed box, minimal data-*, no IntrinsicPreview). *(Achieved via `BlockRenderer` replacing IntrinsicPreview.)*
- [X] Per-type paint: image/media/pdf/link use `object-fit: contain`; text uses packed font; channel uses centered meta. *(Handled inside `BlockRenderer`.)*
- [X] Integrate into `TactileCard` via `renderContent`. *(Default render now uses `BlockRenderer`; IntrinsicPreview removed from portal flow.)*

### Phase 5 — User Channels & SlideEditor
- [ ] Helpers: `getUserChannelsCached`, `setUserChannelsCached`, `invalidateUserChannels` (CoValue-based).
- [ ] Hook `useUserChannelsCached(userId)` with `refresh()`; seed from CoValues, write-through on fetch.
- [ ] Update `SlideEditor` to consume the cached hook instead of direct fetch.

### Phase 6 — Offline/Sync Loop (Remote Wins)
- [ ] Implement pending ops queue in CoValues (reorder/add/remove with tempId mapping for adds).
- [ ] Optimistic mutations; mark channel implicitly stale via `lastFetchedAt` rules; enqueue ops.
- [ ] Sync on reconnect/manual: apply ops; on 409/412 conflict → refetch remote, drop op; on network error → backoff.
- [ ] Surface `pendingCount`, `stale` (from lastFetchedAt), `lastSyncedAt` for UI badges.
- [ ] Persist pending ops (CoValues handle local; add worker adapter later if needed).

### Phase 7 — Filesystem Mirror (Option A)
- [ ] “Select folder” + “Sync to folder” flow using File System Access API (Chromium); fallback plan (zip export/desktop) documented.
- [ ] Emit per-channel structure (`index.md`, `blocks/`, `assets/`) with frontmatter by type (include link `contentHtml`, channel `description`).
- [ ] Download assets (jpg/pdf/thumb) and reference relatively; scan dropped files for import offers.