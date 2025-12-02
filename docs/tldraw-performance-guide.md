# TLDraw Performance Guide

## Overview

This guide documents critical performance patterns discovered during the implementation of a metadata panel overlay system in TLDraw. The lessons learned apply to any TLDraw application with complex reactive UI components, especially those involving overlays, zoom-aware elements, and real-time interactions.

## Core Anti-Patterns & Fixes

### 1. Camera/Viewport Tracking Violation

**❌ Anti-Pattern**: Multiple separate `useValue` subscriptions for zoom/camera state

```typescript
// BAD: Multiple subscriptions cause frame drops
const zoom = useValue('zoom', () => editor.getZoomLevel(), [editor])
const viewport = useValue('viewport', () => editor.getViewportPageBounds(), [editor])
const selectedIds = useValue('selected', () => editor.getSelectedShapeIds(), [editor])
```

**✅ Correct Pattern**: Combined camera state subscription

```typescript
// GOOD: Single combined subscription (from SlideLabelsOverlay)
const cameraState = useValue('camera', () => ({
  viewport: editor.getViewportPageBounds(),
  zoom: editor.getZoomLevel()
}), [editor])

const selectedIds = useValue('selected', () => editor.getSelectedShapeIds(), [editor])
```

**Why**: TLDraw batches camera updates internally. Separate subscriptions multiply re-renders exponentially.

---

### 2. Manual React Patterns vs. TLDraw's Reactive System

**❌ Anti-Pattern**: Manual `useValue` + `memo` instead of `track()`

```typescript
// BAD: Manual subscription management
export function MyOverlay() {
  const editor = useEditor()
  const selectedIds = useValue('selected', () => editor.getSelectedShapeIds(), [editor])

  const shapes = useMemo(() =>
    selectedIds.map(id => editor.getShape(id)).filter(/*...*/),
    [selectedIds, editor] // editor dependency causes issues
  )

  return shapes.map(shape => <MyComponent key={shape.id} />)
}
```

**✅ Correct Pattern**: `track()` HOC with automatic subscriptions

```typescript
// GOOD: TLDraw's Proxy-based tracking
export const MyOverlay = track(function MyOverlay() {
  const editor = useEditor()
  const selectedIds = editor.getSelectedShapeIds() // Automatic subscription

  const shapes = selectedIds
    .map(id => editor.getShape(id)) // Automatic subscription per shape
    .filter(/*...*/)

  return shapes.map(shape => <MyComponent key={shape.id} />)
})
```

**Why**: `track()` uses JavaScript Proxy to intercept property access and create optimal subscriptions. Manual approaches can't batch updates effectively.

---

### 3. Shape Query in Render Path

**❌ Anti-Pattern**: Calling `editor.getShape()` directly in render

```typescript
// BAD: Expensive queries on every render
const MyComponent = memo(({ shapeId }) => {
  const editor = useEditor()
  const shape = editor.getShape(shapeId) // Called every render!
  const bounds = editor.getShapePageBounds(shape) // Called every render!

  return <div>...</div>
})
```

**✅ Correct Pattern**: Let `track()` handle subscriptions

```typescript
// GOOD: track() subscribes automatically
const MyComponent = track(({ shapeId }) => {
  const editor = useEditor()
  const shape = editor.getShape(shapeId) // Subscribed automatically
  const bounds = editor.getShapePageBounds(shape) // Cached internally

  return <div>...</div>
})
```

**Why**: `editor.getShapePageBounds()` is computationally expensive. TLDraw caches these internally when using reactive subscriptions.

---

### 4. `useMemo` Dependencies Include Reactive Values

**❌ Anti-Pattern**: Including reactive props in `useMemo` dependencies

```typescript
// BAD: Reactive dependencies cause re-memoization mid-frame
const positioning = useMemo(() => {
  // expensive calculation
  return calculatePosition(shape.x, shape.y, shape.props.w, shape.props.h)
}, [editor, shape, shape.x, shape.y, shape.props.w, shape.props.h, zoom])
```

**✅ Correct Pattern**: Let `track()` handle reactivity, use `useMemo` for pure computations

```typescript
// GOOD: track() handles shape reactivity
const positioning = useMemo(() => {
  // pure calculation with stable inputs
  return calculatePosition(shape.x, shape.y, shape.props.w, shape.props.h)
}, [shape.x, shape.y, shape.props.w, shape.props.h]) // Only stable deps
```

**Why**: Reactive dependencies trigger re-memoization during the same frame, causing layout thrashing.

---

### 5. Zoom Query Performance

**❌ Anti-Pattern**: Querying zoom in render paths

```typescript
// BAD: Called on every render
const zoom = editor.getZoomLevel()
const fontSize = baseSize / zoom // Recalculated constantly
```

**✅ Correct Pattern**: Query once inside shape components

```typescript
// GOOD: Inside component() method - only called when component renders
component(shape) {
  const editor = useEditor()
  const zoom = editor.getZoomLevel() // Cached by TLDraw

  const labelLayout = useMemo(() => {
    const fontSize = baseSize / zoom
    // ...
  }, [zoom, /* other stable deps */])
}
```

**Why**: `getZoomLevel()` queries are expensive. Inside `component()` method, they're only called when the component re-renders (which TLDraw batches).

---

### 6. Coordinate Transformation Issues

**❌ Anti-Pattern**: Manual viewport math

```typescript
// BAD: Manual coordinate transformation
const screenX = (pageX - camera.x) * zoom
const screenY = (pageY - camera.y) * zoom
```

**✅ Correct Pattern**: Use `editor.pageToScreen()`

```typescript
// GOOD: TLDraw's built-in transformation
const screenPos = editor.pageToScreen({ x: pageX, y: pageY })
```

**Why**: `pageToScreen()` handles all viewport math internally and is reactive to camera changes.

---

### 7. Hover State Pollution

**❌ Anti-Pattern**: Hover state in shape components

```typescript
// BAD: Creates cascading re-renders
const [isHovered, setIsHovered] = useState(false)

return (
  <HTMLContainer onMouseEnter={() => setIsHovered(true)}>
    <div style={{ opacity: isHovered ? 1 : 0.5 }} />
  </HTMLContainer>
)
```

**✅ Correct Pattern**: Stateless hover handling

```typescript
// GOOD: Use TLDraw's built-in hover system or remove hover effects
return (
  <HTMLContainer>
    <div style={{ opacity: 0.5 }} />
  </HTMLContainer>
)
```

**Why**: Hover state updates trigger React re-renders during mouse movements, causing frame drops.

---

## Zoom-Aware UI Patterns

### Inside Shape Components (HTMLContainer)

**Pattern**: Props are in **page space**, `HTMLContainer` handles scaling

```typescript
component(shape: MyShape) {
  const { w, h } = shape.props // Page space units

  return (
    <HTMLContainer style={{ width: w, height: h }}>
      {/* Everything scales automatically */}
      <div style={{ fontSize: 14, padding: 8 }} />
    </HTMLContainer>
  )
}
```

### Outside Shape Components (InFrontOfTheCanvas)

**Pattern**: Manual zoom scaling with clamping

```typescript
const MyOverlay = track(() => {
  const cameraState = useValue('camera', () => ({
    zoom: editor.getZoomLevel()
  }), [editor])

  const zoomClamp = Math.max(0.6, Math.min(cameraState.zoom, 1.5))
  const fontSize = 14 / zoomClamp // Inverse scaling for readability

  return (
    <div style={{
      fontSize: `${fontSize}px`,
      padding: `${8 * cameraState.zoom}px`
    }} />
  )
})
```

**Key**: Clamp zoom values to prevent extreme UI sizes.

---

## Subscription Optimization Patterns

### Single Responsibility Subscriptions

```typescript
// GOOD: Each useValue has one purpose
const selection = useValue('selection', () => editor.getSelectedShapeIds(), [editor])
const camera = useValue('camera', () => ({
  zoom: editor.getZoomLevel(),
  viewport: editor.getViewportPageBounds()
}), [editor])
```

### Avoid Subscription Multiplication

```typescript
// BAD: Multiple overlapping subscriptions
const zoom = useValue('zoom', () => editor.getZoomLevel(), [editor])
const selectedIds = useValue('selected', () => editor.getSelectedShapeIds(), [editor])
const viewport = useValue('viewport', () => editor.getViewportPageBounds(), [editor])

// GOOD: Combined where they change together
const cameraState = useValue('camera', () => ({
  zoom: editor.getZoomLevel(),
  viewport: editor.getViewportPageBounds()
}), [editor])
const selectedIds = useValue('selected', () => editor.getSelectedShapeIds(), [editor])
```

---

## Performance Testing Checklist

### Frame Rate Testing
- [ ] Zoom in/out: 120fps smooth
- [ ] Pan: 120fps smooth
- [ ] Select shapes: No frame drops
- [ ] Hover shapes: No frame drops
- [ ] Resize shapes: No frame drops

### Memory Leak Testing
- [ ] Create/delete shapes repeatedly: Memory stable
- [ ] Zoom in/out repeatedly: No memory growth
- [ ] Select/deselect repeatedly: No subscriptions leaked

### Subscription Auditing
- [ ] Console.log render counts during interactions
- [ ] Check React DevTools for excessive re-renders
- [ ] Use TLDraw's performance tracker for metrics

---

## Common Mistakes to Avoid

1. **Don't** query `getZoomLevel()` outside of component methods
2. **Don't** call `getShapePageBounds()` in render without `track()`
3. **Don't** use multiple `useValue` calls for related state
4. **Don't** include reactive values in `useMemo` dependencies
5. **Don't** use hover state in shape components
6. **Don't** manually transform coordinates - use `pageToScreen()`
7. **Don't** forget `memo` on frequently re-rendering components
8. **Don't** mix manual subscriptions with `track()`

## Performance Monitoring

Add performance tracking to critical components:

```typescript
import { PerformanceTracker } from '@tldraw/utils'

const tracker = new PerformanceTracker()

function MyExpensiveComponent() {
  tracker.mark('render-start')
  // ... expensive operations
  tracker.mark('render-end')
  tracker.measure('render-time', 'render-start', 'render-end')
}
```

## Summary

TLDraw's reactive system (`track()`, `useValue`) is optimized for performance. The key is to **let TLDraw handle subscriptions** rather than fighting it with manual React patterns. Always prefer `track()` over manual `useValue` + `memo` combinations, and combine related state into single subscriptions.

The most critical performance killer is **multiple subscriptions for camera/viewport state** - always combine them into a single `useValue` call.
