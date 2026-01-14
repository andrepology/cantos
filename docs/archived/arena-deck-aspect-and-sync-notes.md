# Arena Deck Aspect + Sync — Reset Notes

This document summarizes what we learned while debugging perceived slowness, Jazz write jank, and image aspect handling for large Are.na channels.

## Non‑Negotiable Product Constraints

- Cards must render at the correct aspect ratio.
- No visible reflows / perceived size changes after a card is shown.
- No cropping.
- No letterboxing whitespace.
- Local-first: the app should work and feel fast without depending on Jazz persistence for every visited channel.
- Jazz persistence should happen only for channels we explicitly “follow” (or own), not for every portal visit.

## Key Observations

### 1) Are.na channel contents does not provide image dimensions

The `/v2/channels/:slug/contents` response includes URLs (thumb/display/large/original) but not reliable `width/height`, so “compute aspect from JSON” is not available for this path.

### 2) “Measure 50 images then render the page” is too slow

The existing approach (`Promise.all` across a page batch) often takes seconds:

- One slow/broken image stalls the whole page.
- “thumb” URLs can still be large (e.g., GIFs where thumb/display/large/original all point to the same file).
- Creating many `Image()` instances at once adds scheduling/GC pressure.

### 3) Dimension probing via `fetch` is not reliable in the browser

A “probe header bytes with `fetch` + Range” approach is often blocked by CORS and/or doesn’t behave consistently across origins. Even without Range, many origins won’t allow cross-origin reads of response bodies.

**Conclusion:** for unfollowed channels (local-first), we should assume we can only learn dimensions via the browser image pipeline (`Image()` / `<img>`).

### 4) Jazz writes can dominate main-thread time for large channels

Persisting large channels (hundreds/thousands of blocks) triggers heavy JS↔WASM work:

- `ArenaBlock.create()` repeated many times
- `$jazz.splice()` and many `$jazz.set()` calls

This causes frame drops during initial load. Persisting everything “because it was viewed once” is too expensive.

### 5) The current sync/hydration flow is hard to reason about

The existing setup mixes:

- identity and creation of channels in the cache,
- deep subscriptions and hydration timing,
- staleness policy,
- network sync loops,
- and aspect measurement.

This creates race conditions and complexity (see `ASPECT_CACHE_DIAGNOSIS.md` for a concrete example).

## Core Conclusions

### A) `useTactileLayout` fundamentally needs stable geometry

If we refuse cropping and refuse letterboxing whitespace, then the card’s rectangle must match the image’s intrinsic aspect.

Therefore:

- The deck must never render a card until its aspect is final.
- The deck must not update aspect after a card is visible (that would reflow).

### B) Separate “view” from “persist”

We need a local-first “view model” that drives UI instantly, and a separate persistence path that writes to Jazz only when explicitly followed.

## Proposed Simplest System Design (Readability First)

### 1) Define “followed” as “present in ArenaCache”

- If a channel slug exists in `ArenaCache.channels`, treat it as followed/persisted.
- **Do not** create `ArenaCache.channels` entries for mere visits.

### 2) Local-first channel cache (in-memory)

Introduce a simple module-level in-memory cache keyed by slug:

- `ChannelVM` holds:
  - metadata (title/author/length/etc)
  - `pendingItems` (normalized blocks without aspect)
  - `readyCards` (Cards with final aspect)
  - pagination state
  - error/loading state
  - `aspectCache` (Map keyed by `blockId` and/or image URL)

This cache is the primary data source for rendering unfollowed channels.

### 3) A “Sizing Gate” between fetch and deck

Replace “fetch page → measure all → render all” with:

1. Fetch contents page.
2. Normalize to `PendingItem` (no aspect).
3. Resolve aspect incrementally using limited concurrency.
4. Admit cards to `readyCards` only when aspect is known.

Important rule: maintain a **contiguous ready prefix** so the deck list changes only by append (stable ordering, no mid-list inserts).

### 4) AspectResolver behavior (local-first, no probe)

- Use `Image()` or offscreen `<img>` to load just enough bytes for `naturalWidth/naturalHeight` to become available.
- Resolve aspect as soon as dimensions are non-zero.
- Strict concurrency (e.g., 4–8 in flight).
- Prioritize “cards needed for first paint” and “next screen buffer” over whole-page completion.

This improves perceived speed while preserving the “no reflow” invariant.

### 5) Keep `TactileDeck` dumb: it consumes ready cards only

`TactileDeck.tsx` should render from `readyCards` and request more when nearing the end.

- No deep Jazz objects in render.
- No “setState during render” syncing.

### 6) Persistence path (only when followed)

When a user follows a channel (adds it to `ArenaCache.channels`):

- Start a background “persist VM → Jazz” job.
- Write in gentle chunks (page-at-a-time) and yield between chunks to avoid jank.
- UI continues to render from local `ChannelVM` until Jazz catches up (or forever; Jazz is storage, not the render driver).

## Notes on Layout Stability

Appending cards should not perturb existing card z-order unnecessarily.

- Avoid zIndex derived from `totalCards - index` if that causes all existing cards to get new zIndex values when one card is appended.
- Prefer a zIndex scheme that depends only on index (or id) so existing cards remain stable as the list grows.

## Next Implementation Steps (no coding here, just sequencing)

1. Introduce `ChannelVM` cache keyed by slug.
2. Make the portal render from `ChannelVM.readyCards` (local-first).
3. Implement the “Sizing Gate” and incremental aspect resolution with low concurrency + prioritization.
4. Change “follow” to mean “create/keep `ArenaCache.channels` entry”.
5. Implement a background persistence job that writes from `ChannelVM` into Jazz only for followed channels.

