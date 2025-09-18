## Arena Channel and Block Shapes — Specification

### Purpose
Replace HTML-rendered Are.na blocks with TLDraw shapes so that a channel container shape controls layout, scrolling, and positioning of its block children. Keep the existing channel label/search UX intact. Allow dragging blocks out to the canvas; do not accept drops into the channel (yet).

### Scope
- Convert blocks to TLDraw child shapes that render their own HTML content via `HTMLContainer`.
- Parent container computes and applies dynamic layout (adapted from `src/arena/Deck.tsx`).
- Support stack/row/column modes with auto-switch by aspect ratio.
- Allow `ArenaBlockShape` to be resizable; parent still positions them.
- Drag out from channel to page; dragging into channel is disabled for now.

Out of scope (future): inbound dropping, virtualization for very large channels, animated transitions between modes, per-block editing tools.

### Names and Files
- Parent container shape: `ArenaChannelShape` (renamed from `ThreeDBoxShape`)
  - File: `src/shapes/ArenaChannelShape.tsx`
- Child block shape: `ArenaBlockShape`
  - File: `src/shapes/ArenaBlockShape.tsx`
- Layout utility (adapted from `Deck.tsx`): `deckLayout.ts`
  - File: `src/arena/deckLayout.ts`

### Integration Overview
- Keep the existing label/search UI exactly as implemented in `ThreeDBoxShape.tsx` and carry it into `ArenaChannelShape.tsx` without behavior changes.
- `ArenaChannelShape` fetches Are.na data using `useArenaChannel`/`useArenaChannelSearch` and mirrors the channel's blocks as `ArenaBlockShape` instances.
- Clipping and scrolling: TLDraw does not clip a custom shape’s children via CSS overflow. To clip, `ArenaChannelShape` manages a backing TLDraw Frame shape sized to its bounds. Blocks are parented to this backing Frame for visual clipping; the channel shape acts as the controller.
- Scrolling is simulated by applying an x/y offset to child positions within the backing Frame (the Frame itself stays fixed). This gives the effect of a scrollable, clipped viewport.
- `Deck.tsx` is not required at runtime; its functionality is adapted into `deckLayout.ts` used by the parent/controller shape.

---

### Shape: ArenaChannelShape (parent container)

- Type: `arena-channel`
- Geometry: `Rectangle2d` sized by props `w`/`h` (isFilled=true) for hit-testing.
- Resizable: yes (container resizes; children are repositioned accordingly).
- Props
  - `w: number`, `h: number`
  - `cornerRadius?: number` (visual only)
  - `channel: string` (slug)
  - `layoutMode?: 'auto' | 'stack' | 'row' | 'column'` (default `auto`)
  - `currentIndex?: number` (stack mode; default 0)
  - `scrollOffset?: number` (row/column; default 0; pixels)
  - `gap?: number` (default 12)
  - `cardMax?: number` (optional cap for blocks laid out)

- Rendering
  - Use `HTMLContainer` for the container frame.
  - Preserve the existing label/search header exactly as-is (click/double-click to edit, search dropdown, and channel update behavior remain unchanged).
  - Backing Frame: On mount (or when missing), create a TLDraw Frame sized to the channel shape’s `w/h`, positioned to match, and keep it aligned on resize. Deterministic id: `arena-channel-frame:{channelShapeId}`. Keep the Frame visually behind the header content and above the canvas background.

- Data Loading
  - Use `useArenaChannel(channel)` to fetch `{ loading, error, cards, author, title }`.
  - The parent does not render block content directly; it manages child shapes to mirror `cards`.

- Child Management (mirror channel blocks)
  - Deterministic child ID per Are.na block: `arena-block:{blockId}`. Store mapping `blockId → childId`.
  - Children are parented to the backing Frame (not directly to `ArenaChannelShape`) to gain clipping.
  - On load or channel change:
    - Create missing child shapes under the backing Frame with minimal props derived from card data.
    - Update existing children if display props changed (title, image URL, embed HTML, etc.).
    - Remove children for blocks no longer present (or soft-hide; default behavior: delete).

- Layout Control (adapted from `Deck.tsx`)
  - Layout modes: `stack`, `row`, `column`, or `auto` switching based on aspect ratio.
    - Thresholds: `ROW_ENTER=1.6`, `ROW_EXIT=1.45`, `COL_ENTER=0.625`, `COL_EXIT=0.69`.
  - Card sizing rule (uniform default): `cardW = min(320, max(60, min(w, h) * 0.9))`; `cardH = cardW`.
  - `deckLayout.ts` computes an array of targets in visible order:
    - Stack: top N visible with small y-offset per depth, decreasing z.
    - Row: horizontal flow with `gap`, content width computed from card dims.
    - Column: vertical flow with `gap`, content height computed likewise.
    - Each target: `{ x, y, rotation, width, height, z, visible }` (rotation optional; default 0).
  - Apply layout by batching `editor.updateShapes([{ id, x, y }])` for children and `editor.setShapeIndex(id, z)` for ordering.
  - Scale: not applied as a transform; if stack needs “scale” effect, approximate by adjusting child `w/h` target values. Otherwise omit for simplicity.

- Scrolling and Indexing
  - In `row`/`column`, the parent captures wheel events and updates `scrollOffset` (clamped to content extents). Child positions (under the backing Frame) are offset by `-scrollOffset` on the primary axis; the Frame visually clips overflow.
  - In `stack`, wheel or scrubber updates `currentIndex` in props; layout recomputes using that index.

- Drag and Drop
  - Outbound: Allowed. When a block’s `parentId` changes from the backing Frame to the page (or another non-frame), do nothing (allow). If the editor exposes `onDragShapesOut` for our controller, reparent explicitly to the page when leaving the backing Frame. Otherwise, listen to shape reparent events and only veto inbound cases (see below).
  - Inbound: Disallowed (for now). If a shape is reparented into the backing Frame from the canvas, immediately revert by reparenting back to the page. Keep the Frame locked to discourage manual adding.
  - Optional placement snapping: when dragging out ends, position on page remains where pointer releases; no snapping required initially.

- Event/Pointers
  - Container intercepts wheel/scroll interactions; header/search elements keep their existing pointer behavior (do not consume clicks unintentionally).
  - Use `stopEventPropagation` where appropriate to avoid canvas panning when scrolling the container.

---

### Shape: ArenaBlockShape (child block)

- Type: `arena-block`
- Geometry: `Rectangle2d({ width: w, height: h, isFilled: true })`
- Resizable: yes. Users can resize the block; the parent continues to position it. See "Size policy" below.
- Props (minimal to render)
  - `blockId: string`
  - `kind: 'image' | 'text' | 'link' | 'media'`
  - `title?: string`
  - `imageUrl?: string`
  - `url?: string`
  - `embedHtml?: string`
  - `w: number`, `h: number`

- Component Rendering
  - Use `HTMLContainer` sized by `w/h`.
  - Render per kind:
    - image: `<img>` with `objectFit: 'contain'`, 100% width/height, lazy loading.
    - text: scrollable div with pre-wrap and minimal styling.
    - link: optional image + title/provider text.
    - media: `dangerouslySetInnerHTML` of sanitized `embedHtml` with iframes sized to 100%.

- Size Policy
  - Default uniform sizing is driven by the parent layout (`cardW`, `cardH`).
  - If a block is resized by the user, the block keeps its `w/h` while the parent still positions it in the flow. Content extents in row/column should account for actual `w/h` where feasible.

- Dragging
  - Standard dragging behavior; parent handles reparenting logic on drag out.

---

### Layout Utility: `deckLayout.ts`

- Location: `src/arena/deckLayout.ts`
- Purpose: Pure functions to compute targets for children given container size, mode, counts, gaps, and offsets.
- API (example)
  - `computeLayoutTargets({ mode, viewportW, viewportH, count, gap, cardW, cardH, currentIndex, scrollOffset }): Target[]`
  - `autodetectMode({ viewportW, viewportH }): 'stack' | 'row' | 'column'`
- Target: `{ x: number; y: number; rotation?: number; width: number; height: number; z: number; visible: boolean }`

---

### State and Persistence
- Children persist as TLDraw shapes under the parent; IDs are deterministic from `blockId` to avoid duplication across reloads.
- On channel data changes, reconcile by creating/updating/deleting children (under the backing Frame) to match server data.
- Parent props (`layoutMode`, `currentIndex`, `scrollOffset`) are stored in the shape and persisted.

### TLDraw Constraints and Notes
- HTML/CSS overflow on a shape’s `HTMLContainer` does not clip other TLDraw child shapes; clipping must be done using a TLDraw masking container (e.g., a Frame) or via engine features. Hence the backing Frame approach above.
- “Scrolling” is a logical offset applied to child positions; the Frame provides the visual clipping window. There is no native per-shape scroll viewport that moves children automatically.

### TLDraw API usage checklist
- Create backing Frame using the built-in type `'frame'` via `editor.createShape({ type: 'frame', ... })` and a deterministic id `arena-channel-frame:{channelShapeId}`. Keep it aligned to the channel’s bounds on move/resize with `editor.updateShapes`.
- Lock the Frame (`isLocked: true`) so users cannot drag shapes into it; this enforces "drag-out only" behavior without custom drop handlers.
- Mirror Are.na blocks as `arena-block` children under the Frame (`parentId` set to the Frame id).
- Re-layout by batching `editor.updateShapes([{ id, x, y, props: { w, h } }])` and set ordering with `editor.setShapeIndex(id, z)`.
- For outbound drags: allow reparenting to the page naturally. If needed, detect leaving by observing parent changes and skip intervention.
- For inbound drags (from page to Frame): the locked Frame will prevent reparenting. If additional enforcement is needed, detect attempted reparent and revert with `editor.reparentShapes([...], editor.getCurrentPageId())`.

---

### Implementation Plan (testable)

Phase 1 — ArenaBlockShape (child)
1) Create `src/shapes/ArenaBlockShape.tsx` with type `arena-block`:
   - Geometry: `Rectangle2d({ width: w, height: h, isFilled: true })`.
   - Props: `blockId`, `kind`, `title?`, `imageUrl?`, `url?`, `embedHtml?`, `w`, `h`.
   - Component: `HTMLContainer` renders by `kind`; set images to object-fit contain and media iframes to 100%.
   - Resizable: enable resize handles; geometry uses `w/h` from props.

Test: Register the shape, spawn a few temporary `arena-block` shapes in `onMount`, verify resize, drag, and rendering for all kinds.

Phase 2 — Layout utility
2) Add `src/arena/deckLayout.ts`:
   - `autodetectMode({ viewportW, viewportH })` with thresholds from this spec.
   - `computeLayoutTargets({ mode, viewportW, viewportH, count, gap, cardW, cardH, currentIndex, scrollOffset })` returns targets `{ x, y, width, height, z, visible }[]`.
   - Implement stack depth/offsets and row/column flows with `gap`.

Test: Log sample outputs for various sizes/counts; sanity-check positions/z-order.

Phase 3 — ArenaChannelShape (controller + clipping)
3) Rename `src/shapes/ThreeDBoxShape.tsx` → `src/shapes/ArenaChannelShape.tsx`; keep label/search UI unchanged; change shape type to `arena-channel`.
4) Backing Frame:
   - On mount, create or find `frame` with id `arena-channel-frame:{channelShapeId}` aligned to `w/h` and position.
   - Keep it aligned on resize/move; set `isLocked: true`.
5) Data mirroring:
   - Use `useArenaChannel(channel)`; build deterministic child ids `arena-block:{blockId}`.
   - Create/update/delete `arena-block` shapes under the Frame to match Are.na cards.
6) Layout + scrolling:
   - Compute `mode` (auto or explicit), `cardW/H` (uniform default), targets via `deckLayout`.
   - Apply positions/z using batch `editor.updateShapes`/`editor.setShapeIndex`.
   - Maintain `scrollOffset` in parent props; update on wheel (clamped to content extents) and re-layout.
   - Maintain `currentIndex` for stack; optional scrubber can update it.
7) Drag behavior:
   - Outbound allowed: when a block is dragged off the Frame, it becomes a page-level shape.
   - Inbound disallowed: locked Frame prevents drops; if needed, on detected reparent into Frame, immediately reparent to page.

Test: Select a real channel; verify blocks appear inside the channel viewport, scroll with wheel (row/column) while being clipped, stack index changes work, resizing channel updates layout, resizing a block preserves size, drag-out works, drag-in blocked.

Phase 4 — Hardening (optional)
8) Respect per-block `w/h` in row/column extents for scroll bounds.
9) Add culling: set `visible=false` blocks to hidden to reduce overdraw.
10) Improve embed sanitization (optional sandboxing).

### Security
- Sanitize `embedHtml` before injecting. Ensure iframes are sized to 100% and set `loading="lazy"`. Consider sandbox attributes if feasible.

### Performance
- Batch updates via `editor.updateShapes([...])` and minimize re-renders (only update changed props).
- Debounce layout updates on resize/data changes.
- Avoid heavy DOM work within render; manipulate iframes in `useEffect` inside the child component.

### Migration Plan
1. Rename `src/shapes/ThreeDBoxShape.tsx` to `src/shapes/ArenaChannelShape.tsx` keeping the label/search UI unchanged.
2. Create `src/shapes/ArenaBlockShape.tsx` implementing rendering and resize support.
3. Add `src/arena/deckLayout.ts` and port the layout calculations from `src/arena/Deck.tsx`.
4. In `ArenaChannelShape`, implement:
   - Data sync (mirror Are.na blocks → child shapes).
   - Layout effect to position/order children via `deckLayout.ts`.
   - Scroll handling and stack index updates.
   - Drag-out reparenting; disable drag-in.
5. Remove `src/arena/Deck.tsx` from UI usage (keep only if needed for reference/tests).

### Acceptance Criteria
- Blocks are TLDraw shapes (`arena-block`) under their channel container (`arena-channel`).
- The channel container preserves the current label/search behavior without changes.
- Parent controls layout mode (auto/stack/row/column) and positions children accordingly.
- Scrolling within the channel in row/column updates `scrollOffset` and moves children; canvas does not pan while scrolling the channel.
- In stack mode, changing the index updates the visible stack; optional scrubber drives `currentIndex`.
- Children can be resized; layout positions them while respecting their `w/h`.
- Dragging a block out of the channel reparents it to the page. Dragging into the channel is not allowed.
- Batch updates are used; layout feels smooth with moderately sized channels.


