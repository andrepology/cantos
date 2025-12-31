# User Channels Jazz Migration

**Date:** 2025-01-01  
**Status:** Complete  
**Migration:** Module-level cache → Jazz CoValues (infrastructure only, no active consumers)

---

## Problem

User channels data was managed via an ephemeral module-level cache (`userChannelsStore.ts`) with manual subscription patterns, violating Jazz's single-source-of-truth principle.

**Issues:**
- Duplicate state management (module cache + Jazz)
- Manual subscriber notifications
- Global session user state
- API-fetched data not persisted to Jazz
- Lost on page refresh

---

## Solution

Migrated to Jazz CoValues as the single source of truth for user channels data. **Infrastructure is complete but currently unused** - ready for future implementation.

### Architecture

**Schema (`ArenaCache`):**
```ts
{
  channels: co.record(z.string(), ArenaChannel),  // slug → channel registry
  myChannelIds: co.list(z.string()),              // ordered slugs for user
  myChannelsLastFetchedAt: z.number().optional(), // staleness tracking
  myChannelsError: z.string().optional()          // sync error state
}
```

**Key Insight:** Reuse the existing `channels` registry instead of creating a separate connections store. Data enriches naturally:
1. User channels fetch → lightweight `ArenaChannel` (slug, title, length, empty blocks)
2. Portal load → enriches same CoValue with full blocks list

---

## Implementation

### Infrastructure Created

1. **`useMyChannelsSync`** - Sync hook with 2hr staleness check
2. **`useMyChannels`** - Read hook for subscriptions
3. **`fuzzySearchChannels`** - Pure utility function (extracted from old store)

### Current State

**No active consumers.** AddressBar search uses Arena API directly (no local channel data).

To use in future:
```ts
// In any component that needs user channels
useMyChannelsSync() // Triggers fetch if stale
const { channels } = useMyChannels() // Subscribes to Jazz
const filtered = fuzzySearchChannels(channels, query)
```

---

## Jazz Playbook Compliance

✅ **Single source of truth:** CoValues only, no parallel caches  
✅ **Direct mutations:** `$jazz.set()`, `$jazz.splice()`  
✅ **Loading guards:** `if (!cv.$isLoaded)` before field access  
✅ **CoList iteration:** `.values()` for iteration  
✅ **Pass IDs, subscribe locally:** Components receive slugs, subscribe to channels  
✅ **Owner pattern:** All CoValues created with explicit owner  
✅ **Shallow by default:** No deep resolve unless needed  

---

## Deleted Code

- **`src/arena/userChannelsStore.ts`** (275 lines) — entire module-level cache
- **`useArenaUserChannels`** from `useArenaData.ts` — direct API fetch hook
- Session user management (`setSessionUser`, `clearSessionUser`)
- Manual subscription system (`subscribers` Set, `notifySubscribers`)

---

## Migration Checklist

- [x] Schema updated with user channels fields
- [x] Sync hook created (staleness detection, inflight deduplication)
- [x] Read hook created (subscription, CoList iteration)
- [x] Fuzzy search utility extracted
- [x] Old cache deleted
- [x] Old hooks removed
- [x] Linter errors resolved
- [x] Jazz playbook patterns validated
- [ ] Consumer integration (deferred - not needed yet)

---

## Future Usage

When user channels are needed locally (e.g., search autocomplete, offline support):

```ts
// 1. Trigger sync (checks staleness)
useMyChannelsSync()

// 2. Subscribe to data
const { channels, loading, error } = useMyChannels()

// 3. Filter/search
const results = fuzzySearchChannels(channels, query)
```

