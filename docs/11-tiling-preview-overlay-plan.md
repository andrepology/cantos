## Option B: Store-less Preview Overlay for Tiling

### Background
The current preview renders a temporary TLDraw shape in the store. This introduces lifecycle complexity (ghost previews persisting on commit/anchor change, races, multiplayer ramifications). Option B replaces store-backed previews with a pure visual overlay that never touches the TL store, while preserving pixel parity with the final committed shape via our shared sizing logic.

### Goals
- **Accurate preview**: The overlay visually matches the committed shape’s size/position (and rough appearance) using `computeSpawnedShapeProps`.
- **Zero store churn**: No shape records are created/updated/deleted for preview state.
- **Deterministic lifecycle**: Preview appears when `meta && candidate && intent` and unmounts otherwise (anchor/reference/intent change, meta release, commit).
- **Simple, robust implementation**: Minimal moving parts, small surface for bugs/races.

### Non‑Goals
- Exporting/pre-rendering exact TLDraw components as the preview. We’ll render a lightweight replica sufficient for tile placement decisions.
- Replacing existing shape components’ internal logic; those remain unchanged for committed shapes.

### Constraints
- Must respect existing tiling logic: we continue to compute `candidate` via `useTilingPreview`.
- Must use the shared sizing logic to ensure parity (`computeSpawnedShapeProps`).
- Must not block pointer events on the canvas or introduce latency; overlay should be `pointer-events: none`.
- Multiplayer should not see any preview activity (since we avoid the store entirely).

### Success Criteria
- **Consistency**: First and subsequent previews match the committed shape’s dimensions and position.
- **Lifecycle**: No lingering preview when releasing meta, switching anchor/reference/intent, or after commit.
- **Performance**: No frame drops during hover/move; no history/sync impact.
- **Simplicity**: Fewer code paths; preview logic is obvious and easy to reason about.

### Architecture Overview
- Keep the existing flow to compute the placement `candidate` and `intent`.
- Compute final preview props via the same helper used at commit time.
- Render a react-only overlay component (not in TL store) positioned at `candidate.x/y` with width/height from computed props.
- On commit, create the shape using the exact same props (unchanged), and the overlay disappears because it is gated by `meta && candidate && intent`.

```mermaid
flowchart TD
  A[Pointer hover + Meta] --> B[Detect intent]
  B --> C[useTilingPreview -> candidate]
  C --> D[computeSpawnedShapeProps(intent, candidate)]
  D --> E[PreviewOverlay renders visuals]
  E -->|Commit| F[createShapes(props)]
  F --> G[Overlay hidden because meta/candidate/intent changed]
```

### Key Files to Change
- `src/editor/TilingPreviewManager.tsx`
  - Remove usages of preview controller (store-backed previews).
  - Compute `intent` (via `getSpawnIntentFromEventTarget`) and `candidate` (via `useTilingPreview`).
  - Compute preview `props` via `computeSpawnedShapeProps`.
  - Render the new `PreviewTileOverlay` with these props while `meta && candidate && intent`.
  - On commit, call `createShapes` with identical props (unchanged sizing path).

- `src/arena/tiling/shapeSizing.ts`
  - Already contains `computeSpawnedShapeProps`; continue to own all sizing rules (grid, maxW/H, aspect ratio derivation via cache/DOM when applicable).

- `src/arena/tiling/previewIntent.ts`
  - Continue to return `intent` + `cardEl` for aspect-ratio derivation.

- New: `src/editor/PreviewTileOverlay.tsx` (or repurpose `src/arena/TilingPreviewOverlay.tsx`)
  - Render a visual-only preview:
    - `position: absolute; left: x; top: y; width: w; height: h; pointer-events: none;`
    - For `type === '3d-box'`: draw simplified face, border, label stub.
    - For `type === 'arena-block'`: draw image if provided (with `object-fit: cover`) or text placeholder.
    - Apply low opacity to distinguish preview from committed shapes.

### APIs to Use
- From our codebase:
  - `useTilingPreview`: produces `candidate` and bounds/samples (unchanged behavior).
  - `getSpawnIntentFromEventTarget`: infer `intent` and provide `cardEl` (already implemented).
  - `computeSpawnedShapeProps`: derive final `props` (w/h + payload) identically for preview and commit.
  - `commitTile` path (or inline `editor.createShapes`) for actual commit.
- From TLDraw editor:
  - Read-only APIs for selection/hover/page bounds (already in use).
  - `editor.createShapes` (commit only). No preview-time store writes.

### Detailed Implementation Plan
1) Introduce `PreviewTileOverlay.tsx`
   - Props: `{ type: '3d-box'|'arena-block', x, y, props, opacity? }`.
   - Renders a minimal, fast visual representation with absolute positioning and `pointer-events: none`.
   - Keep logic simple; no data fetching or panels.

2) Update `TilingPreviewManager.tsx`
   - Compute `intent` from pointer target (reuse existing helper).
   - Get `candidate` from `useTilingPreview`.
   - If `meta && candidate && intent`:
     - Call `computeSpawnedShapeProps(intent, candidate, { grid, maxW, maxH, getAspectRatio, setAspectRatio, cardEl })`.
     - Render `<PreviewTileOverlay ... />` passing computed dimensions and basic visuals.
   - Else, render nothing (preview disappears by unmounting).
   - On commit handler:
     - Use the same computed props to call `editor.createShapes` (or `commitTile`) and select the created shape.

3) Remove store-backed preview code paths
   - Delete `PreviewController` usage and related cleanup in `TilingPreviewManager.tsx`.
   - Keep `previewIntent` and `shapeSizing`—they remain essential.

4) Keep parity with committed shapes
   - Ensure both preview overlay and commit function call `computeSpawnedShapeProps` with identical inputs.
   - If aspect ratio is not immediately available, overlay uses best-effort (DOM image or cache), which will also be used by commit.

5) Styling/UX polish
   - Apply a consistent low opacity and subtle border to the overlay.
   - Avoid any expensive shadows/DOM work.
   - Respect z-order if needed by rendering the overlay container above the canvas layer.

6) Testing & QA
   - Verify preview disappears when:
     - meta is released
     - anchor/reference/intent changes
     - candidate becomes null
     - after commit (because the condition no longer holds)
   - Verify first-preview sizing equals committed sizing across:
     - channels (3d-box)
     - users (3d-box)
     - blocks (arena-block, with/without aspect ratio known)
   - Performance sanity check on rapid pointer moves.

### Risks & Mitigations
- Risk: Visual overlay does not perfectly match complex committed render (e.g., panels, interactions).
  - Mitigation: Only preview essential visuals; committed shapes keep full fidelity.
- Risk: Aspect ratio not available at preview time.
  - Mitigation: Use cached ratio or DOM image when available; same path used for commit ensures parity.
- Risk: Z-index conflicts with other UI.
  - Mitigation: Render overlay in a dedicated top-level layer and keep `pointer-events: none`.

### Rollout Plan
- Phase 1 (dev behind a flag):
  - Keep old path disabled. Enable overlay preview path.
  - Validate sizing parity and lifecycle with manual testing.
- Phase 2:
  - Remove store-backed preview remnants and flag.
  - Keep shared sizing and intent helpers for commit path reuse.

### Constraints Recap
- No TL store writes for preview.
- Gated purely by `meta && candidate && intent`.
- Shared sizing helper for parity.
- Lightweight, pointer-ignoring overlay.

### Acceptance Checklist
- **Parity**: Overlay dimensions/position match committed shapes on first try.
- **Lifecycle**: Overlay mounts/unmounts deterministically with state; no ghosts after commit/anchor change.
- **Performance**: No observable input lag on hover/move.
- **Simplicity**: Code paths are shorter and easier to reason about than store-backed previews.


