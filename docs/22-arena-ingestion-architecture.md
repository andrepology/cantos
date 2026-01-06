# Arena Data Ingestion & Optimization - REVERTED ❌

## Problem

When a user clicks a channel, we fetch metadata + contents from scratch—even if we just saw that channel in a list response that included partial content.

**Wasted data:** `/users/:id/channels` and `/blocks/:id/channels` return ~6 blocks per channel that we discard.

## API Reality

| Endpoint | Has `contents`? |
|----------|-----------------|
| `/channels/:id/connections` | ❌ No |
| `/blocks/:id/channels` | ✅ ~6 blocks |
| `/users/:id/channels` | ✅ ~6 blocks |

Single type `ArenaChannelListItem` with optional `contents?: ArenaBlock[]`.

## Attempted Solution (REVERTED)

Attempted to add `ingestChannelData()` to eagerly ingest channel metadata + blocks from list responses.

### Why It Failed

**Jazz Performance Violation:** The implementation violated Jazz best practices from the playbook:

> **Large Data & Performance**
> - Keep subscriptions shallow at list level
> - Never attempt to bulk-load thousands of children via one deep `resolve`
> - Debounce high‑frequency text edits only at the UI boundary

**The Problem:**
- Ingesting 100 channels × ~6 blocks = 600+ simultaneous Jazz CoValue updates
- Each update triggered subscriptions and re-renders
- Caused massive frame drops and constant UI lag

**Jazz Principle Violated:**
> "Single source of truth = CoValues. Do not introduce Redux/Zustand, client caches, or custom stores."

Caching API responses would require a non-Jazz cache (violates principles).
Eagerly ingesting into Jazz causes performance issues (too many updates).

## Current State

**Reverted to original implementation:**
- Channel lists only create lightweight `ArenaChannelConnection` metadata
- Full channel data fetched on-demand when user clicks
- Follows Jazz's lazy-loading pattern

## Lessons Learned

1. **Don't optimize against Jazz patterns** - Eager bulk ingestion fights Jazz's subscription model
2. **Profile before optimizing** - The "wasted" API data wasn't actually causing UX issues
3. **Trust the framework** - Jazz's lazy loading is designed for this exact scenario
4. **When in doubt, stay shallow** - Jazz playbook: "start shallow; add `resolve` intentionally"

## Alternative Approaches (Future Consideration)

If we want to optimize channel loading:

1. **Schema-level caching** - Add Arena block/channel IDs to a lightweight lookup table (still follows Jazz)
2. **Prefetch on hover** - Start loading when user hovers over a channel (defer, don't batch)
3. **Service worker caching** - Cache API responses at HTTP layer (outside Jazz)
4. **Backend optimization** - Request Arena API to return lighter payloads or support better caching

**Key insight:** The optimization should happen at the **data fetch layer** (HTTP/API), not the **sync layer** (Jazz CoValue updates).
