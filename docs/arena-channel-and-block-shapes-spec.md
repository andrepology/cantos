## Arena Channel and Block Shapes — Specification

### Purpose
Replace HTML-rendered Are.na blocks in `src/shapes/ThreeDBoxShape.tsx` with TLDraw shapes so that a Channel shape contains and controls layout, scrolling, and positioning of its Block children. Keep the existing channel label/search UX intact, also in `src/shapes/ThreeDBoxShape.tsx`. Allow dragging blocks out to the canvas; do not accept drops into the channel (yet).

### Scope
- Convert blocks to TLDraw Block shapes that render their own HTML content via `HTMLContainer`.
- these Block shapes can be parented to the Channel shape.
- Parent Channel is a container, and computes and applies dynamic layout (adapted from `src/arena/Deck.tsx`) based on its own size.
- Support stack/row/column modes with auto-switch by aspect ratio.
- Allow `ArenaBlockShape` to be resizable when OUTSIDE of the Channel shape; parent still positions them.
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
- We've already implemented `ArenaBlockShape` in `src/shapes/ArenaBlockShape.tsx`, but  we need to extend it to also display channels properly. That is, when the parent of the channel Block is a `ArenaChannelShape`, it should just display the channel name and author. When it is dragged out, it becomes a `ArenaChannelShape`.
- Keep the existing label/search UI exactly as implemented in `ThreeDBoxShape.tsx` and carry it into `ArenaChannelShape.tsx` without behavior changes.
- `ArenaChannelShape` fetches Are.na data using `useArenaChannel`/`useArenaChannelSearch` and mirrors the channel's blocks as `ArenaBlockShape` instances.

### Key Problems to Solve
- Clipping and scrolling: TLDraw does not clip a custom shape’s children via CSS overflow. We need to figure out a TLDRAW native way to clip childrena and handle scrolling by carefully studying its docs. 
- `Deck.tsx` should be adapted into `deckLayout.ts` used by the parent/controller shape to handle layout and whatnot for child Blocks.
- We need to handle drag and drop roughly using the parenting API. 

---

Below are incomplete sketches of the shapes and their implementation. Our goal is to isolate the relevant sections of the TLDRAW API BEFORE implementing them.

### Shape: ArenaChannelShape (parent container) [Sketch]

- Type: `arena-channel`
- Geometry: `Rectangle2d` sized by props `w`/`h` (isFilled=true) for hit-testing.
- Resizable: yes (container resizes; children are repositioned accordingly).


---

### Shape: ArenaBlockShape (child block) [Sketch]

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

### Layout Utility: `deckLayout.ts` [Sketch] (May need to be removed if a better solution to layout is found)

- Location: `src/arena/deckLayout.ts`
- Purpose: Pure functions to compute targets for children given container size, mode, counts, gaps, and offsets.
- API (example)
  - `computeLayoutTargets({ mode, viewportW, viewportH, count, gap, cardW, cardH, currentIndex, scrollOffset }): Target[]`
  - `autodetectMode({ viewportW, viewportH }): 'stack' | 'row' | 'column'`
- Target: `{ x: number; y: number; rotation?: number; width: number; height: number; z: number; visible: boolean }`

---


### TLDraw Constraints and Notes
- HTML/CSS overflow on a shape’s `HTMLContainer` does not clip other TLDraw child shapes; there is no built-in, reliable per-shape clipping viewport for arbitrary parent shapes.
- “Scrolling” may need to be simulated via a logical offset applied to child positions (e.g., a `scrollOffset` prop) and then re-layout children in local coordinates, but this is not yet clear. 
- Parent/child coordinates: child `x/y` are local to the parent’s origin (its top-left). Parent page-space `x/y` should NOT be added to children when parented.
- Fixed card size. Keep a constant `cardW/cardH` (e.g., 240×240) per channel. Do not resize children during channel resize; only move them.
- Centering. Positions include center offsets in local space:
  - Row: `x = (w - cardW)/2 + i*(cardW+gap) - scrollOffset`, `y = (h - cardH)/2`
  - Column: `x = (w - cardW)/2`, `y = (h - cardH)/2 + i*(cardH+gap) - scrollOffset`
  - Stack: `x = (w - cardW)/2 + smallOffset`, `y = (h - cardH)/2 + smallOffset`
- Clipping via culling. Compute visibility against channel bounds and set child `hidden=true` if fully outside. Optional later: visual occluders (four rectangles) synced to channel bounds for hard clipping if desired.

Open issues / partial implementation
- Visual hard clip is not implemented; we currently rely on culling only.
- Touch/trackpad delta handling (smooth scroll, momentum) could be improved after basic scroll is stable.

---

### Implementation Plan (TODO)


### Next-docs lookup
- Parenting & children:
  - How to reliably list child IDs under a parent shape (current: `getSortedChildIdsForParent`).
- Scroll handling:
  - Best practice for handling `onWheel` inside a shape’s `HTMLContainer` and preventing canvas pan.
- Z ordering:
- Drag policy:
  - Stable hooks for intercepting inbound reparent into `arena-channel` to enforce out-only policy.
- Performance:
  - Recommended batch update methods and limits for `editor.updateShapes`.



### Acceptance Criteria
- Blocks are TLDraw shapes (`arena-block`) under their channel container (`arena-channel`).
- The channel container preserves the current label/search behavior without changes.
- Parent controls layout mode (auto/stack/row/column) and positions children accordingly.
- Scrolling within the channel in row/column updates `scrollOffset` and moves children; canvas does not pan while scrolling the channel.
- In stack mode, changing the index updates the visible stack; optional scrubber drives `currentIndex`.
- Children can be resized; layout positions them while respecting their `w/h`.
- Dragging a block out of the channel reparents it to the page. Dragging into the channel is not allowed.
- Batch updates are used; layout feels smooth with moderately sized channels.


