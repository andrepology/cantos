# Aspect Ratio Caching - Diagnosis & Learnings

## Problem Statement
Aspect ratios are being re-measured on every page reload, causing frame drops and unnecessary network requests, despite being stored in Jazz.

## Root Cause (Confirmed)
**Jazz IndexedDB hydration is async, but sync runs immediately. Also, `ensureChannel` creates NEW channels before Jazz has loaded existing ones.**

```
Timeline (confirmed via logging):
1. Page loads
2. useArenaChannelStream mounts, effect fires
3. ensureChannel() runs - cache.channels is EMPTY (Jazz hasn't hydrated yet!)
4. ensureChannel() creates NEW channel (losing reference to existing data)
5. syncChannel() runs with the new empty channel
6. All aspects re-measured (500+ images!)
7. ...later, Jazz finishes hydrating, but we've already created duplicates
```

Key log evidence:
```
[ensureChannel] Looking for slug="140734" in 0 channels: []
[ensureChannel] Creating NEW channel for slug="140734"
```

The `cache.channels` array is **empty** when sync starts because Jazz hasn't loaded it from IndexedDB yet.

## Confirmed via Profiling (2025-12-13)

Profiling confirmed that the frame drops (1-10 FPS) are caused by massive WASM activity on the main thread:

1. **Massive CoValue Creation**: Because `syncChannel` creates 500+ new blocks (orphan channel), it triggers 500+ `ArenaBlock.create()` calls.
2. **WASM Overhead**: Each creation and list insertion (`$jazz.splice`) marshals data to the WASM CRDT engine.
3. **Main Thread Blocking**: The flame chart shows 500ms+ tasks dominated by `js-to-wasm`, `create`, and `set` operations.
4. **Garbage Collection**: The creation of thousands of temporary JS objects and Image elements triggers frequent GC pauses.

**Conclusion:** The hydration race doesn't just waste network; it creates a "denial of service" on the main thread by forcing Jazz to rebuild the entire CRDT structure from scratch on every reload.

## What We Tried (All Failed)

### Attempt 1: Load aspects before resetPagingState
```typescript
aspectCache = await loadExistingAspects(channel.$jazz.id)
resetPagingState(channel)
```
**Result:** Returns 0 blocks because the channel was just created (not the one with data).

### Attempt 2: Use ArenaChannel.load() with deep resolve
```typescript
const loaded = await ArenaChannel.load(channelId, {
  resolve: { blocks: { $each: true } },
})
```
**Result:** Returns 0 blocks - Jazz `.load()` doesn't wait for IndexedDB hydration.

### Attempt 3: Use channel.$jazz.ensureLoaded()
```typescript
const loaded = await channel.$jazz.ensureLoaded({
  resolve: { blocks: { $each: true } },
})
```
**Result:** Returns 0 blocks - the channel IS loaded, it just has no blocks (it's a new empty channel).

### Attempt 4: Pass aspects from React layer
```typescript
// In hook: extract aspects from useCoState blocks
const existingAspects = useMemo(() => extractFromBlocks(blocks), [blocks])
// Pass to sync
syncChannel(cache, slug, { aspectCache: existingAspects })
```
**Result:** 
- First render: `blocks` is empty, `existingAspects` is empty
- Effect fires with empty aspects
- Creates new channel, syncs, measures everything
- By the time React updates with real data, damage is done

## The Fundamental Problem

It's a **chicken-and-egg** issue:

1. `syncChannel` needs existing aspects to skip measurement
2. Existing aspects are stored in Jazz channel blocks
3. Jazz channel is found by `cache.channels.find(c => c.slug === slug)`
4. But `cache.channels` is empty until Jazz hydrates from IndexedDB
5. So `ensureChannel` creates a NEW channel
6. The new channel has no blocks, no aspects
7. Everything gets re-measured

**The existing channel with data IS in Jazz**, but we can't find it because the cache hasn't loaded yet.

## Viable Solutions (Prioritized)

### Solution A: Don't Sync Until Cache is Ready (Recommended)
Wait for Jazz to fully hydrate the channels list before syncing:

```typescript
// In useArenaChannelStream
const { me } = useAccount(Account, {
  resolve: {
    root: {
      arenaCache: { 
        channels: { $each: { blocks: { $each: true } } }  // Deep resolve!
      },
    },
  },
})

// Only sync once we have the channel with its blocks loaded
useEffect(() => {
  const existingChannel = me?.root?.arenaCache?.channels?.find(c => c?.slug === slug)
  
  // If we have data and it's fresh, SKIP SYNC ENTIRELY
  if (existingChannel?.blocks?.length > 0 && !isStale(existingChannel)) {
    return 
  }

  // If we don't have the channel yet (hydration pending), WAIT
  if (!existingChannel && !me?.root?.arenaCache) {
    return
  }
  
  // Only sync if we have cache but need data, OR if we know for sure it's a new channel
  syncChannel(cache, slug, { aspectCache: aspects })
}, [slug, me?.root?.arenaCache?.channels])
```

**Tradeoff:** Slower initial render (waits for Jazz), but no double work.

### Solution B: Separate Aspect Storage (localStorage)
Store aspects outside Jazz for instant sync access:

```typescript
// After measurement, also write to localStorage
localStorage.setItem(`aspects:${slug}`, JSON.stringify([...aspectMap]))

// Before measurement, check localStorage first
const cached = localStorage.getItem(`aspects:${slug}`)
if (cached) return new Map(JSON.parse(cached))
```

**Tradeoff:** Duplicate storage, but fast and reliable.

### Solution C: Don't Reset Blocks, Update In-Place
Instead of clearing all blocks on refresh, match by `blockId` and update:

```typescript
// Instead of: channel.blocks.$jazz.splice(0, channel.blocks.length, ...newBlocks)
// Do: merge newBlocks into existing, preserving aspects
for (const newBlock of newBlocks) {
  const existing = channel.blocks.find(b => b.blockId === newBlock.blockId)
  if (existing?.aspectSource === 'measured') {
    newBlock.aspect = existing.aspect
    newBlock.aspectSource = existing.aspectSource
  }
}
```

**Tradeoff:** More complex sync logic, but preserves data.

### Solution D: Skip Re-Sync If Recent
Just don't sync if we have recent data:

```typescript
if (channel.blocks?.length > 0 && !isStale(channel) && !force) {
  return // Already have data, skip sync entirely
}
```

**Tradeoff:** Simple, but might miss updates.

## Recommended Approach

**Solution A** is the most robust and "Jazz-native" solution. It treats CoValues as the source of truth and refuses to start expensive sync work until that source of truth is available.

**Solution B** (localStorage) is rejected as of 2025-12-13. We should not rely on side-caches when we have a high-performance local DB (Jazz/IndexedDB).

## Files Involved
- `src/arena/channelSync.ts` - `ensureChannel`, `resetPagingState`, `syncChannel`
- `src/arena/aspectMeasurement.ts` - measurement functions
- `src/arena/hooks/useArenaChannelStream.ts` - triggers sync
- `src/jazz/schema.ts` - ArenaBlock schema
