# Arena Channel Sync — Learnings & Best Practices

This note captures what we learned while tracing and refactoring the Arena channel streaming path (Are.na → Jazz CoValues), plus the design principles we ended up enforcing.

## Problem Summary

We observed that the channel CoValue’s metadata fields (e.g. `channelId`, `title`, `createdAt`, `updatedAt`, `length`) were being **set and then later cleared**. We also observed UI behavior consistent with **runaway fetching / infinite loops** and eventual app unresponsiveness.

Root causes:

1. **Treating `/contents` as a metadata authority.**
   - The `/v2/channels/:slug/contents` endpoint is for paginated blocks. It is not reliable for channel metadata.
   - Writing optional metadata fields from a response that may omit them will overwrite existing values with `undefined` and “unset” those fields.

2. **React effects depending on unstable CoValue object references.**
   - Using a CoValue object itself (e.g. `me.root.arenaCache`) as an effect dependency causes the effect to re-run on *every* CoValue mutation.
   - If that effect sets local state, you can hit “Maximum update depth exceeded”.

3. **Non-deterministic stop condition for paging.**
   - If `hasMore` never flips to `false`, an “auto-fetch next page” loop never terminates.
   - Relying only on `contents.length === per` is brittle: it can produce repeated fetches past the end in some API behaviors.

## Final Design Principles (First Principles)

### 1) Single-writer rule per concern

**Channel metadata authority:** `GET /v2/channels/:slug`
- Writes: `channelId`, `title`, `description`, `author`, `createdAt`, `updatedAt`, `length`.

**Channel contents authority:** `GET /v2/channels/:slug/contents`
- Writes: `blocks`, `fetchedPages`, `hasMore`, `lastFetchedAt`, `error`.

**Channel connections authority:** `GET /v2/channels/:id/connections`
- Writes: `connections`, `connectionsLastFetchedAt`, `connectionsError`.

This prevents “set then unset” and makes it obvious where each field comes from.

### 2) Deterministic termination for page fetching

Prefer stop conditions in this order:

1. `totalPages = ceil(length / per)` (where `length` comes from `/channels/:slug`).
2. API paging hints when present (`total_pages/current_page`, `pagination.next`).
3. Only then use heuristics like `contents.length < per`.

Also enforce “progress”:
- If a page fetch adds **0 new blocks** (after dedupe), treat that as a terminal condition and set `hasMore=false`.

### 3) Keep React hooks thin and stable

Hooks should:
- Subscribe (`useCoState`) with explicit `resolve`.
- Trigger sync from an effect whose deps are stable primitives (e.g. `cacheId`, `slug`, `per`).
- Avoid “fetchNext on fetchedPagesCount change” patterns that create feedback loops.

If you need a background loop, keep it in the sync layer (or a Worker), not a reactive effect chain.

### 4) Batch CoValue list mutations

Prefer one list mutation per page:
- `list.$jazz.splice(...)` with all new items

Avoid:
- `for (...) list.$jazz.push(...)` for many items, which can cause UI churn and long render blocks.

### 5) Model “staleness” explicitly (Are.na freshness, not Jazz freshness)

Jazz keeps CoValues in sync with peers; “stale” here means “might be out of date relative to Are.na”.

Best practice:
- Store `lastFetchedAt` timestamps on the CoValue.
- Define a clear policy:
  - contents freshness (`lastFetchedAt`) TTL
  - connections freshness (`connectionsLastFetchedAt`) TTL
  - metadata refresh triggers (usually on create/force, or when required fields are missing)

### 6) Separate error channels

Errors should be specific enough to not block unrelated data:
- contents errors on `ArenaChannel.error`
- connections errors on `ArenaChannel.connectionsError`

This allows UI to show “blocks loaded but connections unavailable” cleanly.

## Jazz-Specific Notes (from `docs/jazz-playbook.md`)

- Treat CoValues as the source of truth; avoid parallel stores for the same state.
- Respect tri-state semantics:
  - `undefined` = still loading
  - `null` = not found / no access
  - instance = ready
- Use `resolve` intentionally; keep parent lists shallow, deepen only when needed.

## What We Changed (High-Level)

1. Introduced a shared Arena client module (`src/arena/arenaClient.ts`) for consistent auth + fetch helpers.
2. Rewrote channel sync to enforce endpoint roles:
   - metadata only from `/channels/:slug`
   - blocks only from `/contents`
3. Fixed a React infinite-update issue by making effect deps stable (use `cacheId` rather than the CoValue object).
4. Extended the model and sync to support channel connections via `/channels/:id/connections`.

## Practical Checklist for Future Work

- If a field “mysteriously disappears”, search for `$jazz.set('field', undefined)` or writing optional fields from a non-authoritative endpoint.
- If a React hook loops, check effect dependencies for:
  - CoValue objects or arrays that change identity every mutation
  - derived arrays/objects not memoized
- For streaming/pagination:
  - always compute a hard stop from authoritative totals when possible
  - ensure each iteration makes progress, or abort
- Keep UI consumption separate:
  - blocks rendering subscribes to blocks
  - metadata panels subscribe to metadata + connections explicitly

