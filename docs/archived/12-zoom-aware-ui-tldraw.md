# Zoom-Aware UI Overlays in TLDraw

## Problem

When building UI overlays (panels, address bars, dropdowns) in TLDraw that should remain visually constant on-screen at any zoom level, naive approaches fail:

- **Naive approach 1:** Multiply all sizes by zoom. Result: overlays grow/shrink with the canvas, defeating the purpose.
- **Naive approach 2:** Ignore zoom entirely. Result: overlays are tiny when zoomed in, huge when zoomed out.
- **Naive approach 3:** Use inverse scale `scale(1/zoom)` without clamping. Result: text becomes unreadable at extreme zooms (too small when zoomed in, clipped when zoomed out).

## Solution: Single-Origin Inverse Scale with Clamped Zoom

### Core Principles

1. **Track camera zoom reactively** (don't snapshot)
   - Use `useValue('cameraZoom', () => editor.getCamera().z, [editor]) || 1` to subscribe to zoom changes.
   - This ensures re-renders when zoom changes; plain `editor.getCamera().z` reads return stale values.

2. **Clamp zoom to a reasonable range**
   - Example: `zoomClamped = Math.min(1.4, Math.max(0.8, zoomRaw))`
   - Prevents text from becoming unreadably small (zoomed in) or clipped (zoomed out).
   - Adjust range based on your UX needs; wider ranges allow more scaling, narrower ranges keep sizes more constant.

3. **Position in world space, size in screen space**
   - Use `pageToScreen()` or `editor.pageToScreen()` to convert world/page coordinates to screen coordinates.
   - Compute `left/top` from screen conversion (reactive to camera pan and zoom).
   - Keep `width/height` as fixed screen pixel values; do not multiply by zoom.

4. **Apply a single inverse scale at the outermost wrapper**
   - Use Motion's `useMotionValue` to create a reactive scale: `scale = 1 / zoomClamped`.
   - Apply it once with `transformOrigin: 'top left'` (or appropriate origin).
   - Do **not** apply other scales elsewhere; this single wrapper owns scale.

5. **Keep all layout constants zoom-agnostic**
   - Fonts: fixed px (e.g., `11px`, `14px`). Do not multiply by zoom.
   - Paddings/gaps/borders/radii: fixed px constants.
   - Widths: fixed screen px.
   - Icon sizes: fixed px.
   - No zoom multipliers anywhere in layout math.

6. **Gap between shapes and panels**
   - Use fixed screen-space offsets if the panel is in screen space.
   - Example: `left = screenAnchor.x + 16` (16px screen gap).
   - Do not add the gap in page space then convert; pick one space and stick to it.

7. **Coordinate Motion animations with scale**
   - Animate `opacity` and `translate` (y-axis) as usual.
   - Set `scale` to the motion value (e.g., `style={{ scale: textScale }}`) and keep it constant per render (no animation).
   - Don't let Motion's `initial/animate/exit` override the scale; it should remain fixed to `1 / zoomClamped`.

### Implementation Pattern

```typescript
import { useMotionValue, motion } from 'motion/react'
import { useEditor, useValue } from 'tldraw'

export const MyZoomAwarePanel = memo(function MyZoomAwarePanel({ shapeId }) {
  const editor = useEditor()
  
  // 1. Track zoom reactively, clamp it
  const zoomRaw = useValue('cameraZoom', () => editor.getCamera().z, [editor]) || 1
  const zoomClamped = Math.min(1.4, Math.max(0.8, zoomRaw))
  
  // 2. Create inverse scale motion value
  const scale = useMotionValue(1 / zoomClamped)
  useEffect(() => {
    scale.set(1 / zoomClamped)
  }, [scale, zoomClamped])
  
  // 3. Position via world → screen conversion
  const shape = editor.getShape(shapeId)
  const pageBounds = shape ? editor.getShapePageBounds(shape) : null
  const anchor = pageBounds 
    ? editor.pageToScreen({ x: pageBounds.maxX + 16, y: pageBounds.minY })
    : { x: 0, y: 0 }
  
  // 4. Fixed screen-space dimensions
  const PANEL_WIDTH = 220  // px
  const PANEL_HEIGHT = 320 // px
  const GAP_SCREEN = 16    // px (screen space)
  
  return (
    <div
      style={{
        position: 'fixed',
        left: `${anchor.x + GAP_SCREEN}px`,
        top: `${anchor.y}px`,
        width: `${PANEL_WIDTH}px`,
        height: `${PANEL_HEIGHT}px`,
        pointerEvents: 'none',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ duration: 0.3 }}
        style={{
          scale,  // single source of truth for zoom neutralization
          transformOrigin: 'top left',
          width: '100%',
          height: '100%',
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,  // fixed px, no zoom multiplier
          padding: 20,  // fixed px
          fontSize: 11,  // fixed px
        }}
      >
        {/* Content: all sizes are fixed px */}
        <div style={{ fontSize: 11 }}>Channel Name</div>
      </motion.div>
    </div>
  )
})
```

### Common Gotchas

**Gotcha 1: Multiplying layout by zoom**
- ❌ Bad: `padding: ${8 * zoom}px`
- ✅ Good: `padding: 8px`

**Gotcha 2: Applying scale in multiple places**
- ❌ Bad: `style={{ scale: 1/zoom, transform: ... }}`
- ✅ Good: Use `transformOrigin` only; apply scale once.

**Gotcha 3: Stale zoom values**
- ❌ Bad: `const zoom = editor.getCamera().z` (snapshot in render, doesn't trigger re-renders on zoom)
- ✅ Good: `const zoom = useValue('cameraZoom', () => editor.getCamera().z, [editor])`

**Gotcha 4: Mixing page-space and screen-space gaps**
- ❌ Bad: Anchor in page, gap in screen (or vice versa); position drifts.
- ✅ Good: Convert anchor to screen first, then add screen-space gap.

**Gotcha 5: Scaling text that should remain readable**
- ❌ Bad: `scale = 1 / zoomRaw` (unclipped; text becomes unreadable at extremes)
- ✅ Good: `scale = 1 / Math.min(1.4, Math.max(0.8, zoomRaw))`

**Gotcha 6: Animating scale alongside opacity**
- ❌ Bad: `animate={{ opacity: 1, scale: 1/zoom }}` (Animation may override reactive scale updates)
- ✅ Good: Only animate opacity/y; set scale to motion value and keep it constant.

## Real-World Examples

### MetadataPanel (fixed size, anchored to shape)
- Positioned via `pageToScreen(shape.maxX + GAP, shape.minY)`.
- Fixed 220px × 320px screen size.
- Single `scale(1/zoomClamped)` with `transformOrigin: 'top left'`.
- All typography and spacing are fixed px.

### PortalAddressBar Text (text scaling with clamp)
- Channel name, author chip, focused block title all share one `textScale = 1 / zoomClamped`.
- Clamped to 0.8–1.4 so text remains readable.
- Block title centered with inner scaled span (`transformOrigin: 'top center'`).
- No font-size multipliers; all fonts fixed px.

### Search Dropdown (nested zoom-aware wrapper)
- Dropdown container wrapped in `motion.div` with `scale: textScale`.
- Gap between input and dropdown stays constant (fixed px inside scaled wrapper).
- All item padding, border radius, icons use fixed px.

## Testing Zoom Behavior

1. **Zoom in (z > 1):**
   - Panel/text should shrink on screen (inverse scale is < 1).
   - Text should remain readable (clamping prevents extreme shrinkage).
   - Gaps should stay fixed px visually.

2. **Zoom out (z < 1):**
   - Panel/text should grow on screen (inverse scale is > 1).
   - Text should remain readable (clamping prevents extreme growth).
   - Panel should not clip or overflow.

3. **Pan while zoomed:**
   - Position should update smoothly via `pageToScreen()`.
   - Scale should not change.

## Summary

**Best practice for zoom-aware TLDraw overlays:**

1. Track zoom with `useValue` and clamp it (0.8–1.4 typical).
2. Position via `pageToScreen(world coords)`.
3. Size in fixed screen px; no zoom multipliers.
4. Apply a single inverse scale with a stable `transformOrigin`.
5. Keep all layout constants zoom-agnostic.
6. Coordinate Motion animations to avoid conflicting scales.

This approach is simple, performant, and works across all zoom levels while keeping overlays readable and visually stable.
