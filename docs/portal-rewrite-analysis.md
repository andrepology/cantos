# Portal Rewrite Analysis & Plan

## Current Architecture Issues
- **Discontinuous Layouts**: Switching from `Stack` to `Row` to `Grid` unmounts one component and mounts another. This resets state and prevents fluid animation.
- **Fragmented Logic**: Drag/Drop and scroll logic is scattered across multiple hooks and components.
- **Virtualization vs Animation**: `react-window` is great for performance but hard to animate layout changes with, as items are constantly mounting/unmounting.

## Proposed Architecture: The "Unified Deck"

Instead of swapping components (`<StackLayout />` vs `<GridLayout />`), we will have a single `<UnifiedDeck />` component.

### Core Concepts

1.  **The "Active Set" Strategy**:
    -   We cannot physically animate 1000s of DOM nodes.
    -   We define an "Active Set" of items (e.g., the top 12 items, or visible items).
    -   When layout changes, the Active Set *animates* to new positions.
    -   Non-active items (off-screen or deep in the list) *fade out* from the old layout and *fade in* to the new layout (or are virtualized).

2.  **Layout Engine Hook (`usePortalLayout`)**:
    -   Input: `containerWidth`, `containerHeight`, `items`, `scrollOffset`.
    -   Output: A map of `itemId -> { x, y, width, height, opacity, zIndex }`.
    -   This hook is pure logic. It calculates where everything *should* be.

3.  **Framer Motion Integration**:
    -   Each Item in the Active Set is a `<motion.div>`.
    -   We pass the calculated `x, y, w, h` to the `animate` prop.
    -   Motion handles the spring physics (interruptible, retargetable).

4.  **Scroll System**:
    -   A single unified scroll manager.
    -   In `Stack` mode, scroll maps to index/depth.
    -   In `Grid`/`Row` mode, scroll maps to pixel offset.

## Development Plan

### Phase 1: The "Toy" Portal (Interaction Lab)
**Goal**: Perfect the feel of morphing layouts without data/virtualization complexity.
-   Create `TestPortalShape`.
-   Generate 50 mock items (colored rectangles with numbers).
-   Implement `usePortalLayout` covering:
    -   `Stack` (cards behind each other).
    -   `Row` (horizontal scroll).
    -   `Grid` (masonry or uniform).
-   Implement resize logic:
    -   Dragging handle resizes container.
    -   Breakpoint triggers layout change.
    -   **Crucial**: Validate the "Fly Out" effect where Stack expands to Grid.

### Phase 2: Advanced Interactions
-   **Drag Reorder**: Reordering items within the layout.
-   **Drag Out**: Pulling an item out of the Portal to create a standalone shape.
-   **Drag In**: Dropping a shape into the Portal.
-   **Selection**: Focus mode (Grid -> Single Item Stack).

### Phase 3: Hybrid Virtualization
-   Introduce the "Virtual Layer" for items outside the Active Set.
-   Optimize for 1000+ items.
-   Ensure smooth hand-off between Active (animated) and Virtual (scrolled) items.

### Phase 4: Data Integration
-   Connect `useArenaData`.
-   Handle loading states.
-   Replace existing `PortalShape`.

## Questions
1.  For the "Toy" phase, do you want to use the existing `tldraw` environment or a separate test harness? (Assuming `tldraw` since it's a shape).
2.  Are there specific "spring" feel preferences (bouncy vs tight)?
3.  Is `framer-motion` already installed? (Need to check `package.json`).
