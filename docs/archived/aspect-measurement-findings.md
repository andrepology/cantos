# Aspect Measurement Performance Findings

## What the code does
- Aspect ratio measurement currently uses `new Image()` and waits for `img.onload` to read `naturalWidth/naturalHeight` (`src/arena/aspectMeasurement.ts`).
- On a cold cache, this triggers real network image loads for most blocks (e.g. 44–45 fetches for a 50-block page).

## What we observed
- DevTools Network shows significant **Queued/Stalled** time for these requests, plus substantial **Waiting (TTFB)** and **Content Download**.
- In a focused, visible tab (`visibilityState: "visible"`, `hasFocus: true`), per-image completion times cluster around:
  - `p50 ~357ms`, `p95 ~467ms`, `max ~552ms` (sample run).
- With app-level throttling set to `appConcurrency = 8` (and actually reached: `maxActive = 8`), a batch of ~45 images completed in ~2.1s:
  - This matches the expected lower bound: `ceil(45/8) × ~0.35s ≈ ~2.1s`.
- `PerformanceResourceTiming` data is not available/usable for `images.are.na` in our logs (`resourceTiming: null` / `nextHopProtocol: ""`):
  - Likely due to cross-origin timing restrictions (missing `Timing-Allow-Origin`), so DevTools is the reliable source for Protocol/Timing breakdown.

## What we can conclude
- The long batch times are primarily explained by **(a) high per-request service time (~350–500ms)** plus **(b) concurrency limits / browser scheduling** causing queued/stalled waves.
- This is not primarily a decode-cost problem; it’s dominated by **network/TTFB + download** and request scheduling.
- Client-side image loading cannot reach “handful of milliseconds” if it must fetch ~45 distinct URLs that each take hundreds of ms.

## Why “rendering on screen” can differ
- Browsers prioritize resources differently depending on how they are discovered/used.
- Requests tied to actual DOM `<img>` elements near the viewport (and thus potentially impacting LCP/paint) often get higher priority than programmatic `new Image()` loads.
- Higher priority can reduce *queueing/stalling*, but it does not eliminate *TTFB/download* costs.

## Instrumentation we added
- `src/arena/aspectMeasurement.ts` logs (when enabled) include:
  - per-image elapsed time + environment snapshot (focus/visibility + Network Information API hints).
  - batch summary: host counts, per-block latency percentiles, max concurrency observed.
- Optional A/B knobs:
  - `LOG_MEASUREMENT_DIAGNOSTICS` toggles logging.
  - `MEASUREMENT_MAX_CONCURRENCY` enables an app-level queue to compare “we queue” vs “browser queues”.
  - `img.fetchPriority = 'high'` / `img.loading = 'eager'` hints were added to test scheduler effects (best-effort; verify via DevTools Priority column).

## Practical next steps (if we want it fast)
- Don’t block on measuring all blocks: measure only what’s needed for initial layout/viewport and fill in the rest asynchronously.
- Keep app-level concurrency throttling (often reduces long-tail completion time).
- If the goal is truly “milliseconds”, avoid full image loads:
  - Use a same-origin proxy that fetches only the minimal bytes needed (e.g. HTTP Range) and parses dimensions from the image header, returning `{aspect}`.
