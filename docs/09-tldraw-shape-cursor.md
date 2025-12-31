# Tactile Cursor

A minimal, morphing custom cursor specifically for TLDraw shape interactions.

## Implementation

**File**: `src/editor/TactileCursor.tsx` (~260 LOC)

Inspired by `MotionCursor.tsx` but purpose-built for TLDraw with no button detection, text sizing, or zones system.

## Cursor States

| State | Visual | Trigger |
|-------|--------|---------|
| **Idle** | Small circle (17px) | Default state |
| **Moving** | Larger circle (24px, 1.4× scale) | Dragging selected shape |
| **Edge** | Horizontal/vertical bars (48×6px or 6×48px) | Hovering edge resize handle |
| **Edge (Pressed)** | Same bars, scaled down (0.8×) | Mouse down on edge handle |
| **Corner** | Simple circles (20px) | Hovering corner resize handle |
| **Corner (Pressed)** | Same circles, scaled down (0.8×) | Mouse down on corner handle |

## Detection Mechanism

1. **Pointer events** - Listen to `pointerover`/`pointermove` on window
2. **DOM inspection** - Check for `data-testid` attributes on TLDraw handles:
   - `selection.resize.top-left/right/bottom-left/right` → Corner
   - `selection.target.top/bottom/left/right` → Edge
3. **Editor state** - Access `editor.inputs.isDragging` for moving detection

## Visual Design

- **Precise tracking** - Direct mouse position without spring smoothing for pixel-perfect response
- **Morphing animations** via Framer Motion variants (150ms ease, 50ms for press feedback)
- **Press feedback** - Cursor scales down (0.8×) when clicking on handles for tactile feel
- **Rotation** - Edges/corners rotate to match handle direction
- **Style** - Semi-transparent with backdrop blur and subtle border

## Integration

Added to `SlideEditor.tsx` via `InFrontOfTheCanvas` component:

```tsx
InFrontOfTheCanvas: () => (
  <>
    <TactileCursor />
    {/* other overlays */}
  </>
)
```

## CSS Changes

**App.css** - Modified global cursor rule to exclude TLDraw editor:
```css
*:not(.tldraw__editor):not(.tldraw__editor *) { cursor: ...; }
```

**TactileCursor.tsx** - Injects style to hide system cursor:
```css
.tldraw__editor * { cursor: none !important; }
```

## Key Simplifications

✂️ **Removed from MotionCursor**:
- Magnetic snapping to buttons
- Text cursor sizing
- Zone system
- Multi-host/SSR handling
- Follow mode

✅ **Kept**:
- Spring-smoothed tracking
- Morph animations
- Portal to body
- System cursor hiding

