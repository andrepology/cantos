# Portal Address Bar Compact Spec

## Objective
Create a single, deterministic system for rendering and animating the portal label across all layout modes (default, tab, vtab, mini) without overlapping DOM trees or abrupt geometry jumps.

## Current Pain Points
- Two concurrent layers (compact + expanded) lead to duplicated DOM, overlapping fades, and inconsistent pointer targeting.
- Compact labels immediately adopt the new geometry when a mode change begins, so the outgoing text shifts before fading out.
- Editing state, author chip visibility, and search overlay depend on multiple booleans, making it easy to leave the component in an inconsistent state.

## Requirements

### 1. Single View Owner
- Maintain a single `viewVariant` state derived from `mode`. Only one view renders at a time.
- Keep a `viewVariantRef` to compare old/new values when transitions start.
- Editing, author chip, and search overlay are active **only** when `viewVariant === 'default'` and the fade is complete.

### 2. Fade Timeline
- When switching views, run a deterministic opacity timeline:
  1. **Fade Out** the current view. Duration: 90 ms (default→compact) or 220 ms (compact→compact/default). Easing: `cubic-bezier(0.5,0,1,0.5)` for fast exits, `cubic-bezier(0.4,0,0.2,1)` otherwise.
  2. Once opacity hits 0, **swap** `viewVariant`.
  3. Wait for the portal shape’s own morph to settle (`portalDelay`: 160 ms when entering default, 80 ms otherwise).
  4. **Fade In** the new view with a 360 ms (to default) or 220 ms (between compact modes) ease `cubic-bezier(0.33,1,0.68,1)`.
  5. After fade-in completes, set `pointerEvents` back to auto for the expanded view.
- Manage timers via a small queue so all pending timeouts are cleared when another transition begins or the component unmounts.

### 3. View Implementations

#### Expanded View
- Reuse existing editable row: label span, optional author chip, and `PortalSourceSearchOverlay`.
- All pointer handlers (`onPointerDown`, editing caret calculation, etc.) remain unchanged but are only bound when `viewVariant === 'default'`.
- `labelTextRef` stays attached to this span for caret math and search overlay integration.

#### Tab View
- Center-aligned text using `'Alte Haas Grotesk'`, font size `max(9, layout.fontSize - 3)`, letter spacing 0.0155em.
- Wrap in a flex container with `pointer-events: none`.

#### Vertical Tab View
- Rotated label identical to `VerticalTabsLayout`. Width constraint `max(32, layout.shapeHeight - 20)` to mirror legacy truncation.

#### Mini View
- Reuse the deterministic triad color gradient columns (lifted from `MiniLayout`). No scribble overlay.
- Position label near the bottom left with responsive font size `max(10, min(16, layout.width * 0.12))` and three-line clamp.

### 4. Editing & Selection Rules
- Editing cancels immediately when:
  - The shape is deselected.
  - `viewVariant` switches away from `default`.
  - The block title overlay is shown.
- When editing begins, focus the input as before and ensure the zoom-aware caret calculation remains.
- Author chip appears only when `viewVariant === 'default'`, `allowEditing` is true, and the label isn’t in edit mode.

### 5. Accessibility & Pointer Control
- The root container always has `pointer-events: none`; child views decide whether to re-enable events (expanded view only).
- Compact variants never allow pointer interaction.
- Keep label font metrics and author chip sizing identical to the previous implementation to avoid regression in readability.

## Implementation Outline
1. **State Hooks**
   - `viewVariantRef`, `viewVariantState`, `fadeStyle`, `canInteract`, `fadeTimers`.
2. **Transition Manager**
   - Small helper function that triggers fade-out/fade-in and manages timeouts.
3. **View Renderer**
   - `renderExpandedLabel()` for default mode.
   - `renderCompactLabel()` switches between tab/vtab/mini markup.
4. **Mini Utilities**
   - Move triad color logic + `MiniColorColumns` into a shared helper at the bottom of the file (already portable from `MiniLayout`).
5. **Cleanup**
   - Remove legacy `compactLabel` state, snapshots, `expandedOpacityTransition`, etc., so the file only contains one render path.

Deliverable: a refactored `PortalAddressBar` that adheres to this spec, ensuring smooth view changes with zero overlapping DOM and predictable editing behavior.
