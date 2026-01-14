# Arena Runtime Cache Architecture

## Problem Statement

When loading Arena channels, the current architecture writes all fetched data to Jazz CoValues, causing:
1. **Performance issues**: 250+ CoValue mutations per channel load
2. **Unnecessary persistence**: Browsed channels don't need offline sync
3. **Wasted overhead**: Jazz CRDT operations, IndexedDB writes, WebSocket sync for ephemeral data

### What We Actually Need

| Data Type | Needs Persistence? | Needs Sync? | Storage |
|-----------|-------------------|-------------|---------|
| Browsed channels | No | No | In-memory cache |
| User's own channels | Yes | Yes | Jazz |
| Saved/favorited channels | Yes | Yes | Jazz |
| Whiteboard state | Yes | Yes | Jazz (tldraw) |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Arena API                                                      │
└───────────────────────┬─────────────────────────────────────────┘
                        │ fetch (reuse existing normalize logic)
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  ArenaRuntimeCache                                              │
│                                                                 │
│  channels: Map<slug, CachedChannel>                             │
│  blocks: Map<arenaId, CachedBlock>                              │
│  authors: Map<userId, CachedAuthor>                             │
│                                                                 │
│  - Fast in-memory access (O(1) lookups)                         │
│  - Block deduplication across channels                          │
│  - React integration via useSyncExternalStore                   │
│  - No persistence (cleared on reload)                           │
└───────────────────────┬─────────────────────────────────────────┘
                        │ explicit "save" action
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Jazz CoValues (Selective)                                      │
│                                                                 │
│  - User's own channels (auto-loaded on login)                   │
│  - Explicitly saved channels                                    │
│  - Batch write from cache (single operation)                    │
└─────────────────────────────────────────────────────────────────┘
```

## Key Insight

The Jazz playbook rule "No Redux/Zustand/custom stores" applies to **app state**. Arena API data is **external content** being cached, similar to React Query or SWR. This is HTTP-layer caching, not app state management.

From `docs/22-arena-ingestion-architecture.md`:
> "The optimization should happen at the **data fetch layer** (HTTP/API), not the **sync layer** (Jazz CoValue updates)"

---

## RuntimeCache API

### Core Interface

```typescript
interface ArenaRuntimeCache {
  // === Data Access (synchronous, O(1)) ===
  getChannel(slug: string): CachedChannel | undefined
  getBlock(arenaId: number): CachedBlock | undefined
  getBlocks(arenaIds: number[]): CachedBlock[]
  getAuthor(userId: number): CachedAuthor | undefined

  // === React Integration ===
  subscribe(listener: () => void): () => void
  getVersion(): number  // Monotonic counter for useSyncExternalStore

  // === Fetch Orchestration ===
  fetchChannel(slug: string, opts?: FetchOptions): Promise<void>
  fetchNextPage(slug: string): Promise<boolean>
  fetchAuthor(userId: number): Promise<void>

  // === Prefetch ===
  prefetchAhead(slug: string, scrollPos: number, contentH: number, viewportH: number): void
}

interface FetchOptions {
  force?: boolean      // Ignore staleness, refetch
  signal?: AbortSignal // Cancellation
}
```

### Data Types (reuse existing, no new types)

```typescript
// Reuse shapes from existing types, stored as plain objects
type CachedChannel = {
  slug: string
  title?: string
  description?: string
  length?: number
  author?: CachedAuthor
  createdAt?: string
  updatedAt?: string

  // Block references (Arena IDs - actual data in blocks Map)
  blockIds: number[]

  // Pagination
  fetchedPages: Set<number>
  hasMore: boolean

  // Connections
  connections?: CachedChannelConnection[]

  // Fetch state
  lastFetchedAt: number
  fetching: boolean
  error?: string
}

type CachedBlock = {
  arenaId: number
  type: 'image' | 'text' | 'link' | 'media' | 'pdf' | 'channel'
  title?: string
  description?: string
  content?: string

  // Images (same as ArenaBlock schema)
  thumbUrl?: string
  displayUrl?: string
  largeUrl?: string
  originalFileUrl?: string

  // Layout
  aspect?: number

  // Embed
  embedHtml?: string
  embedWidth?: number
  embedHeight?: number
  provider?: string

  // Channel blocks
  channelSlug?: string
  length?: number

  // Metadata
  user?: CachedAuthor
  createdAt?: string
  updatedAt?: string
}

type CachedAuthor = {
  id: number
  username?: string
  fullName?: string
  avatarThumb?: string
  avatarDisplay?: string
  bio?: string
  followerCount?: number
  channelCount?: number
  channelIds?: number[]
  lastFetchedAt?: number
}
```

---

## Hook Layer

### Design Decision: Combine vs Split

Current architecture has 4 hooks for different subscription granularities:
- `useChannelStructure` - block IDs, pagination
- `useLayoutMetrics` - aspects only
- `useChannelChrome` - title, author
- `useSyncTrigger` - fetch orchestration

With RuntimeCache, **we control re-renders via stable references**, not Jazz subscription depth. We can simplify to fewer hooks:

### Option A: Single Combined Hook (Recommended)

```typescript
interface ChannelData {
  // Structure
  blockIds: number[]
  hasMore: boolean
  length?: number

  // Layout (derived from blocks)
  layoutItems: LayoutItem[]

  // Chrome
  title?: string
  author?: CachedAuthor

  // State
  loading: boolean
  error?: string
}

function useChannelData(slug: string | undefined): ChannelData
```

Internal implementation uses memoization to ensure:
- `blockIds` reference stable unless IDs change
- `layoutItems` reference stable unless aspects change
- Chrome fields don't cause re-renders if unchanged

### Option B: Keep Split (If Needed)

If profiling shows combined hook causes issues, keep split:
```typescript
function useChannelStructure(slug: string | undefined): ChannelStructure
function useLayoutMetrics(blockIds: number[]): LayoutItem[]
function useChannelChrome(slug: string | undefined): ChannelChrome
```

**Start with Option A, split if profiling shows need.**

### Hook Implementation Pattern

```typescript
function useChannelData(slug: string | undefined): ChannelData {
  const cache = useArenaCache()

  // Subscribe to cache version
  const version = useSyncExternalStore(
    cache.subscribe,
    cache.getVersion,
    cache.getVersion
  )

  // Trigger fetch on mount/slug change
  useEffect(() => {
    if (!slug) return
    const channel = cache.getChannel(slug)
    if (!channel || shouldRefresh(channel)) {
      cache.fetchChannel(slug)
    }
  }, [slug, cache])

  // Stable references via refs (same pattern as current hooks)
  const prevBlockIds = useRef<number[]>([])
  const prevLayoutItems = useRef<LayoutItem[]>([])

  return useMemo(() => {
    const channel = slug ? cache.getChannel(slug) : undefined
    if (!channel) {
      return {
        blockIds: [],
        layoutItems: [],
        hasMore: false,
        loading: !!slug,
        error: undefined,
      }
    }

    // Stable blockIds
    const blockIds = stableArray(prevBlockIds, channel.blockIds)

    // Stable layoutItems
    const blocks = cache.getBlocks(channel.blockIds)
    const layoutItems = stableLayoutItems(prevLayoutItems, blocks)

    return {
      blockIds,
      layoutItems,
      hasMore: channel.hasMore,
      length: channel.length,
      title: channel.title,
      author: channel.author,
      loading: channel.fetching,
      error: channel.error,
    }
  }, [slug, version, cache])
}
```

---

## Fetch Orchestration

### Reuse Existing Logic

The fetch logic in `channelSync.ts` is sound:
- Boost fetch (first 5 items for fast paint)
- Full pagination
- Block deduplication
- Inflight request deduping

Extract to shared utilities:
```typescript
// src/arena/fetch/channelFetch.ts
export async function fetchChannelData(slug: string, opts: FetchOptions): Promise<NormalizedChannel>
export async function fetchChannelPage(slug: string, page: number, per: number): Promise<NormalizedBlock[]>

// src/arena/fetch/normalize.ts (extract from channelSync.ts)
export function normalizeBlock(raw: ArenaAPIBlock): NormalizedBlock
export function normalizeChannel(raw: ArenaChannelResponse): NormalizedChannelMeta
```

### Prefetch on Scroll

New capability - fetch ahead as user scrolls:

```typescript
// In TactileDeck or via hook
function usePrefetchOnScroll(
  slug: string | undefined,
  scrollOffset: number,
  contentHeight: number,
  viewportHeight: number
) {
  const cache = useArenaCache()

  useEffect(() => {
    if (!slug) return

    const bottomDistance = contentHeight - (scrollOffset + viewportHeight)
    const threshold = viewportHeight * 2  // 2 viewports ahead

    if (bottomDistance < threshold) {
      cache.prefetchAhead(slug, scrollOffset, contentHeight, viewportHeight)
    }
  }, [slug, scrollOffset, contentHeight, viewportHeight])
}
```

---

## Jazz Integration

### What Stays in Jazz

1. **User's own channels** - loaded via `useMyChannelsSync` on login
2. **Whiteboard state** - tldraw store snapshot
3. **User auth/preferences** - `ArenaPrivate` CoValue
4. **Explicitly saved channels** - future feature

### Batch Sync Pattern

When persisting to Jazz, batch operations:

```typescript
async function persistChannelToJazz(
  slug: string,
  cache: ArenaRuntimeCache,
  jazzCache: LoadedArenaCache
) {
  const channel = cache.getChannel(slug)
  if (!channel) return

  const blocks = cache.getBlocks(channel.blockIds)
  const owner = jazzCache.$jazz.owner

  // Get or create Jazz channel
  let jazzChannel = jazzCache.channels[slug]
  if (!jazzChannel) {
    jazzChannel = ArenaChannel.create({
      slug,
      title: channel.title,
      blocks: co.list(ArenaBlock).create([]),
    }, owner ? { owner } : undefined)
    jazzCache.channels.$jazz.set(slug, jazzChannel)
  }

  // Load with $each to access block fields
  const loaded = await jazzChannel.$jazz.ensureLoaded({
    resolve: { blocks: { $each: true } }
  })

  // Batch block creation
  const existingIds = new Set(
    [...loaded.blocks].filter(b => b?.$isLoaded).map(b => b.arenaId)
  )

  const newBlocks = blocks
    .filter(b => !existingIds.has(b.arenaId))
    .map(b => ArenaBlock.create({
      blockId: String(b.arenaId),
      arenaId: b.arenaId,
      type: b.type,
      title: b.title,
      aspect: b.aspect,
      thumbUrl: b.thumbUrl,
      displayUrl: b.displayUrl,
      // ... other fields
    }, owner ? { owner } : undefined))

  // Single batch append
  if (newBlocks.length > 0) {
    loaded.blocks.$jazz.splice(loaded.blocks.length, 0, ...newBlocks)
  }

  // Update metadata (minimal sets)
  if (channel.title) jazzChannel.$jazz.set('title', channel.title)
  if (channel.length) jazzChannel.$jazz.set('length', channel.length)
  jazzChannel.$jazz.set('lastFetchedAt', Date.now())
}
```

---

## Implementation Stages

### Stage 0: Profile Current Implementation
- [ ] Add performance markers around channel load
- [ ] Profile with React DevTools
- [ ] Confirm bottleneck is Jazz writes vs render cascades
- [ ] Document baseline metrics

### Stage 1: Create RuntimeCache Core
- [ ] `src/arena/cache/store.ts` - Map-based store
- [ ] `src/arena/cache/context.tsx` - React context + provider
- [ ] `src/arena/cache/types.ts` - Type definitions (or reuse existing)
- [ ] Extract `normalizeBlock()` to `src/arena/fetch/normalize.ts`
- [ ] Unit tests for cache operations

**Deliverable:** Cache exists, can be populated manually, subscribes work

### Stage 2: Fetch Orchestration
- [ ] `src/arena/cache/fetch.ts` - fetchChannel, fetchNextPage
- [ ] Reuse existing API client functions
- [ ] Inflight request deduplication
- [ ] Staleness detection

**Deliverable:** `cache.fetchChannel(slug)` populates cache from API

### Stage 3: Hook Implementation
- [ ] `useArenaCache()` - context hook
- [ ] `useChannelData(slug)` - combined data hook
- [ ] Stable reference patterns
- [ ] Integration tests

**Deliverable:** Hooks return data from cache, not Jazz

### Stage 4: Swap in TactilePortalShape
- [ ] Replace Jazz hooks with cache hooks
- [ ] Remove `useSyncTrigger` (logic absorbed into useChannelData)
- [ ] Verify render behavior
- [ ] A/B comparison with current implementation

**Deliverable:** Portal loads channels without Jazz writes

### Stage 5: Prefetch on Scroll
- [ ] `usePrefetchOnScroll` hook
- [ ] Integrate into TactileDeck
- [ ] Test with large channels

**Deliverable:** Seamless infinite scroll, no loading spinners mid-scroll

### Stage 6: Cleanup
- [ ] Remove unused Jazz channel creation code
- [ ] Remove old hooks if replaced
- [ ] Update imports across codebase
- [ ] Documentation

**Deliverable:** Clean codebase, no dead code

### Future: Selective Persistence
- [ ] "Save channel" UI action
- [ ] `persistChannelToJazz()` implementation
- [ ] Load saved channels on startup → populate cache

---

## Open Questions

1. **Session restore**: Serialize cache to localStorage on unmount? Adds complexity but better UX on reload.

2. **Cache eviction**: LRU eviction for memory management? Or just let it grow per session?

3. **Author portals**: Same pattern for author data? Or keep Jazz for authors since they're smaller?

4. **Error boundaries**: How to handle fetch failures gracefully?

---

## Success Metrics

- [ ] No frame drops when loading 250+ block channel
- [ ] Jazz storage doesn't grow during browsing
- [ ] First paint within 500ms (boost fetch)
- [ ] Smooth scroll through large channels (prefetch working)
- [ ] Memory usage reasonable after browsing 10+ channels

---

## References

- `docs/22-arena-ingestion-architecture.md` - Previous attempt at eager ingestion (reverted)
- `docs/jazz-playbook-merged.md` - Jazz best practices
- `src/arena/channelSync.ts` - Current sync implementation
- `src/arena/hooks/useChannelStructure.ts` - Current structure hook
