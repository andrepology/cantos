# Arena Sync & Render Optimization Plan

**Status:** ✅ IMPLEMENTED

**Context:** The application syncs Are.na channels to Jazz CoValues. A major performance regression ("massive frame drops") occurred during sync/hydration because the main UI component (`TactilePortalShape`) over-subscribed to granular block updates.

### The Problem (Solved)
*   **Over-Subscription:** `useArenaChannelStream` used `resolve: { blocks: { $each: true } }`. This triggered a re-render of the parent shape **every time** any property of any block changed (title, image, user).
*   **Write Storm:** The sync logic (`channelSync.ts`) iterates through blocks and updates properties (aspect ratios, metadata) sequentially. This flooded the subscription with update events.
*   **Layout Dependency:** The Masonry Layout engine (`useTactileLayout.ts`) is calculated in the Parent and **requires** the `aspect` ratio of all blocks to function.

### The Solution (Implemented)

We implemented a **Split Subscription Model** using Jazz's built-in `select` and `equalityFn` options on `useCoState`:

#### New Hooks (in `src/arena/hooks/`)

1.  **`useChannelStructure(slug)`** — Shallow Structure
    *   Subscribes with `resolve: { blocks: true }` (list container only)
    *   Returns: `{ channelId, blockIds, hasMore, loading }`
    *   Re-renders: Only on block add/remove/reorder

2.  **`useLayoutMetrics(channelId)`** — Selector-Filtered Aspects
    *   Subscribes with `resolve: { blocks: { $each: true } }`
    *   Uses `select` to extract only `{ id, arenaId, aspect }` per block
    *   Uses `equalityFn` to compare arrays by layout-relevant fields only
    *   Re-renders: Only when block IDs or aspect ratios change
    *   **Ignores:** title, description, content, user metadata changes

3.  **`useChannelChrome(channelId)`** — Selector-Filtered Metadata
    *   Subscribes with `resolve: { author: true }`
    *   Uses `select` to extract only `{ title, slug, author }`
    *   Uses `equalityFn` to compare chrome fields only
    *   Re-renders: Only when title or author changes

4.  **`useSyncTrigger(slug, options)`** — Sync Orchestration
    *   Handles channel creation, staleness detection, sync triggering
    *   Returns: `{ syncing, error, refresh }`
    *   Re-renders: Only on sync state changes

#### Updated Consumer (`TactilePortalShape`)

```tsx
// OLD: Single deep subscription (caused render storm)
const { channel, blockIds, layoutItems, loading } = useArenaChannelStream(channelSlug)

// NEW: Split subscriptions with selectors
const { channelId, blockIds, loading } = useChannelStructure(channelSlug)
const layoutItems = useLayoutMetrics(channelId)
const channelChrome = useChannelChrome(channelId)
const { syncing } = useSyncTrigger(channelSlug)
```

### Re-render Isolation (Achieved)

| Event | Old Architecture | New Architecture |
|-------|------------------|------------------|
| Block title changes | Portal → Deck → All Cards | Only that TactileCard |
| Block aspect changes | Portal → Deck → All Cards | Portal → Deck (layout recalc) |
| Channel title changes | Portal → Deck → All Cards | Portal (chrome only) |
| Block added/removed | Portal → Deck → All Cards | Portal → Deck (new list) |

### Key Jazz Pattern Used

```typescript
useCoState(Schema, id, {
  resolve: { /* deep loading */ },
  select: (value) => /* extract only needed fields */,
  equalityFn: (a, b) => /* compare only relevant fields */
})
```

This filters update noise at the subscription level—even though Jazz fires CoValue-level updates, the component only re-renders when the *selected* data changes.

### Additional Performance Fixes (Post-Implementation)

Despite the split subscription model, performance issues persisted due to **reference instability** in hook return values:

#### Issue 1: `portalOptions` Reference Instability
**Problem:** Empty array `[]` created on every render defeated `AddressBar` memoization.
**Solution:** Removed unused `portalOptions` prop and used stable `EMPTY_OPTIONS` constant.

#### Issue 2: `blockIds` Reference Instability
**Problem:** `useChannelStructure` returned new array references even when block IDs were identical, causing cascades.
**Solution:** Added reference caching in `blockIds` memo - only return new array when content actually changes.

#### Root Cause Analysis
- **Diagnostic Approach:** Added console logs to track reference changes
- **Key Finding:** Large channels (464 blocks) caused 400+ consecutive renders despite `equalityFn`
- **Solution:** Memo stability > selector filtering - components only re-render when data actually changes

### Files Changed
- `src/arena/hooks/useLayoutMetrics.ts` (new)
- `src/arena/hooks/useChannelChrome.ts` (new)
- `src/arena/hooks/useChannelStructure.ts` (new + reference stability fix)
- `src/arena/hooks/useSyncTrigger.ts` (new)
- `src/shapes/TactilePortalShape.tsx` (updated to use new hooks + removed portalOptions)
- `src/shapes/components/AddressBar/AddressBar.tsx` (removed options prop + stable empty array)
- `src/arena/hooks/useArenaChannelStream.ts` (deleted)
