# Tactile Portal — Data, Cache, and Renderer Plan

## Goals
- Stream channel data progressively (large/1000+ blocks) without blocking the UI.
- Single shared cache for channels, blocks, and aspect ratios (keyed by blockId) with future persistence to Jazz for offline/fast access.
- Stable sizing with zero flicker: layout size from cached/heuristic aspect only; painting does not change box size.
- Simplify rendering: new `TactileCardRenderer` (no CardRenderer wrapping), no size hints.

## What we learned
- Arena API paginates; current `fetchArenaChannel` loops all pages before returning and caches whole channels, so no incremental delivery.
- Current Arena cache = simple in-memory Maps (channels, block details, user channels), no TTL/LRU, no page-level storage, no persistence.
- `useAspectRatioCache` is per-hook, not singleton, so shapes don’t share ratios; TTL not enforced unless called; eager image loads lack pooling/priority.
- VirtualGrid’s IntrinsicPreview works because layout size is driven elsewhere (masonic) and images are `object-fit: contain`; it doesn’t manage sizing.
- Size hints aren’t required for sizing; they only helped typography. We can drop them and keep boxes stable from aspect alone.

## Decisions
- **Cache:** single shared service (singleton) holding channels (paged), blocks, and aspect ratios (by blockId). In-memory LRU+TTL now; pluggable persistence later (Jazz covalues) for owned/followed channels and user channel lists.
- **Aspect pipeline:** heuristic aspect per type immediately; measure only visible/near-visible with a small pool; apply updates only if delta > ε to avoid micro-jumps. Layout consumes cached aspect; painting does not affect size.
- **Renderer:** build `TactileCardRenderer` (no CardRenderer wrap). It gets `{ card, layout size from deck }`, paints with per-type defaults (object-fit: contain/cover) inside the fixed box. IntrinsicPreview optional for pixels, not sizing. No sizeHint prop.
- **Data-*:** keep minimal needed for drag/spawn (id, type, maybe url); unify with the tactile drag-out path.

## Plan (phased)
1) **Shared Arena cache**
   - Implement singleton with entries for: channel pages + aggregated view, blocks, aspect ratios, user channel lists.
   - Add LRU+TTL; inflight dedupe; invalidation hooks. Stub persistence adapter for Jazz.
2) **Paged/streaming channel hook**
   - `useArenaChannelPaged(slug, { per, prefetch, enabled })` returns partial pages, hasMore/next, cancels on slug change, uses cache.
   - Keep `useArenaChannel` as a wrapper that awaits completion for legacy callers.
3) **Aspect pipeline**
   - Heuristic prime (image 4:3, media 16:9, pdf 0.77, link-with-thumb 1.6, text 1:1.2, channel ~1:1.1).
   - Visibility-aware measurement with small concurrency pool; apply only if delta > ε; optional defer while scrolling.
   - Store/read from shared cache; layout uses cache ratio only.
4) **Renderer**
   - Implement `TactileCardRenderer` (per-type object-fit defaults, simple event surface, minimal data-*).
   - IntrinsicPreview only for painting if we want its style; it does not set size.
5) **User channels + SlideEditor stubs**
   - Add cache entries + hook for user channel lists; expose refresh/invalidate; persistence-ready for Jazz later.

## Open questions to settle during implementation
- Exact LRU size/TTL for channels and aspects.
- ε threshold for aspect update (e.g., 10% delta).
- Minimal data-* fields required for drag/spawn in tactile flow.
- Whether to keep IntrinsicPreview for images or fold it fully into the new renderer’s image view.

