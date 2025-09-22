## Arena Channel and Block Shapes — Option 1 (HTML deck drag‑out)

### Purpose
Keep the existing HTML-based channel browsing UI in `src/shapes/ThreeDBoxShape.tsx` (label/search + deck rendering). Enable users to drag a card out of that HTML deck and spawn a real TLDraw `arena-block` shape on the canvas at the pointer. Do not accept inbound drops into the channel for now.

### Scope
- Continue rendering the channel’s cards via HTML inside `ThreeDBoxShape.tsx`.
- On drag-out from a deck card, create a TLDraw `arena-block` at the pointer and continue the drag natively on the canvas.
- Prevent canvas panning/zooming while interacting inside the deck.
- Out-of-scope (for Option 1): TL-native `arena-channel` container, TL-based scrolling/clipping/culling for children, inbound drop acceptance.

### Names and Files
- Channel browsing shape (HTML): `ThreeDBoxShape`
  - File: `src/shapes/ThreeDBoxShape.tsx`
- Spawned block shape (TL): `ArenaBlockShape`
  - File: `src/shapes/ArenaBlockShape.tsx`
- Are.na data: `src/arena/useArenaChannel.ts`, `src/arena/types.ts`

### TLDraw APIs used
- Pointer/event gating in shape DOM: `stopEventPropagation` on `HTMLContainer` events (`onPointerDown/Move/Up`, `onWheel`).
- Coordinate conversion: `editor.screenToPage({ x: clientX, y: clientY })` (preferred). If unavailable, derive via `editor.getViewportPageBounds()` and DOM offsets.
- Shape lifecycle: `editor.createShapes`, `editor.updateShapes`, `editor.deleteShapes` (if cancel), `editor.setSelectedShapes`.
- Bounds: `editor.getShapePageBounds(shape)` (used for cancel-on-drop-back-inside logic), `editor.getViewportPageBounds()` (perspective/label layout already used).
- Performance: batch updates where supported, e.g., `editor.batch(() => { ... })` around frequent `updateShapes` during drag.

### Data model: mapping Are.na card → `arena-block` props
- `blockId: string`
- `kind: 'image' | 'text' | 'link' | 'media'`
- `title?: string`
- `imageUrl?: string`
- `url?: string`
- `embedHtml?: string`
- `w: number`, `h: number` (default 240×240)

### Detailed implementation plan
1) Detect drag intent from HTML card
   - Add `onPointerDown` to each card element in the deck. Store source card metadata (Are.na block fields) and the initial screen position.
   - While pointer is within a small threshold, treat as click/scroll. Once exceeded, enter “spawn-and-drag” mode.
   - Always call `stopEventPropagation`/`e.stopPropagation()` for pointer and wheel events inside the deck to avoid canvas panning while browsing.

2) Convert screen to page coordinates
   - On first movement past threshold, compute `pagePoint = editor.screenToPage({ x: e.clientX, y: e.clientY })`.
   - If `screenToPage` is not available in the current TLDraw version, derive page coordinates from `editor.getViewportPageBounds()` and element offsets.

3) Create the TL shape and select it
   - `editor.createShapes([{ id, type: 'arena-block', x: pagePoint.x, y: pagePoint.y, props: { blockId, kind, title, imageUrl, url, embedHtml, w: 240, h: 240 } }])`.
   - Immediately `editor.setSelectedShapes([id])`.
   - Optionally ensure z-order (bring to front) by setting an index or relying on selection draw order.

4) Continue the drag natively on the canvas
   - During `onPointerMove`, continuously recompute `pagePoint` and call `editor.updateShapes([{ id, type: 'arena-block', x: pagePoint.x, y: pagePoint.y }])`.
   - Wrap these updates in `editor.batch` if available to reduce intermediate renders.
   - Suppress any HTML “ghost image” during drag (no additional DOM drag avatar needed).

5) Finalize or cancel on pointer up
   - On `onPointerUp`, end the drag. Keep the created TL shape on the page by default (copy-out semantics).
   - Optional cancel condition: if the pointer up occurs “inside the channel bounds,” treat as cancel and call `editor.deleteShapes([id])`.
     - Compute channel page bounds via `editor.getShapePageBounds(channelShape)` and test the pointer page point.
   - Decide semantics explicitly: First iteration uses copy-out (HTML deck remains unchanged).

6) UX details and safeguards
   - Label/search UI remains exactly as implemented in `ThreeDBoxShape.tsx` today.
   - Wheel/scroll inside the deck should not pan the canvas (`onWheel={e => e.stopPropagation()}`).
   - Multi-touch: ignore spawning on multi-touch; only primary pointer spawns TL shapes.
   - Abort safety: if the pointer leaves the window or the user presses Escape before first `createShapes`, do nothing; after create, delete the temporary shape.
   - Selection behavior: the spawned shape stays selected after drop for immediate interaction (resize/move).
   - Sizing: start with 240×240; allow resize afterward via existing `ArenaBlockShape` behavior.

7) Telemetry and performance (optional)
   - Measure drag update frequency and ensure the batch wrapper maintains >60fps on typical channels.
   - Avoid re-render churn in `ThreeDBoxShape` while dragging by minimizing React state changes during the drag.

### Edge cases
- Page zoom: `screenToPage` accounts for zoom; if using a fallback, ensure the transform includes zoom and pan.
- Trackpad momentum: since drag is pointer-based, inertial scroll of the deck should not apply during spawning; keep deck scrolling separate from drag threshold logic.
- Duplicate spawns: prevent multiple shape creations for a single gesture by latching a boolean once created.
- Embeds: `embedHtml` should be sanitized before passing to `ArenaBlockShape` (already handled in shape rendering path).

### Future (Option 2) reference
- A TL-native `arena-channel` container may later replace the HTML deck. It would parent `arena-block` children, handle simulated scroll via `scrollOffset`, compute layout (row/column/stack), and cull out-of-bounds children by toggling a `hidden` prop.
- That work will reuse `ArenaBlockShape` and the Are.na data hooks, but is out-of-scope for this Option 1.

### Acceptance criteria (Option 1)
- Dragging a card from the HTML deck spawns a TLDraw `arena-block` under the pointer and continues as a native canvas drag.
- The canvas does not pan/zoom while interacting with the deck; scrolling inside the deck works.
- The spawned `arena-block` maps its content correctly (image/text/link/media) and defaults to 240×240.
- On drop, the shape remains on the page and is selected; optional cancel path removes it if dropped back inside the channel bounds.
- Multiple drags create independent shapes without side effects to the HTML deck.
- Operations are smooth; frequent `updateShapes` are batched where supported.


