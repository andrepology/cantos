# TLDraw Learnings

Practical patterns and anti-patterns discovered while building a metadata panel overlay system in TLDraw. Covers state machine usage, reactivity optimization, zoom-aware UI, and common pitfalls.

---

## Table of Contents

1. [State Machine & Interaction Patterns](#state-machine--interaction-patterns)
2. [Reactivity & Performance Patterns](#reactivity--performance-patterns)
3. [Zoom-Aware UI Patterns](#zoom-aware-ui-patterns)
4. [Common Mistakes & Testing](#common-mistakes--testing)

---

## State Machine & Interaction Patterns

### Using `editor.isIn()` for UI State

**Problem**: Detecting when to show/hide UI during interactions has timing gaps. Checking `inputs.isDragging` creates a delay between mouse down and drag detection, causing brief UI flashes.

**Solution**: Use TLDraw's state machine with `editor.isIn()`.

```typescript
// ❌ BAD: Timing gap causes flashes
const isInteracting = !!(editor.inputs?.isDragging)

// When user starts dragging:
// 1. Mouse down → shape selected → isDragging = false → UI shows
// 2. Drag detected → isDragging = true → UI hides
// Brief flash in the gap!
```

```typescript
// ✅ GOOD: State machine eliminates timing gaps
const isIdle = editor.isIn('select.idle')

// When user starts dragging:
// 1. Mouse down → select.pointing_shape → UI hidden immediately
// 2. Drag detected → select.translating → UI stays hidden
// No flash!
```

**State Hierarchy**:
- `select.idle` - At rest with selection
- `select.pointing_shape` - Mouse down (before drag confirmed)
- `select.translating` - Actively dragging
- `select.resizing` - Actively resizing

**Why it works**: `pointing_shape` state is entered immediately on mouse down, before any drag detection. This eliminates the timing gap.

### Reactive vs Non-Reactive Properties

**Critical**: Not all `editor.inputs` properties are reactive.

```typescript
// ❌ BAD: inputs.buttons is NOT reactive
const isInteracting = editor.inputs.buttons.size > 0
// Component won't re-render when buttons changes!
// Must move cursor to trigger unrelated update

// ✅ GOOD: Use state machine instead
const isIdle = editor.isIn('select.idle')
// Fully reactive - component re-renders on state transitions
```

**Rule**: Mutable properties (Sets, Maps, plain objects) on `editor.inputs` don't trigger reactivity. Use state machine APIs instead.

### Shape Lifecycle Hooks

Shapes can deselect themselves after transforms using lifecycle hooks:

```typescript
export class MyShapeUtil extends BaseBoxShapeUtil<MyShape> {
  // Called when drag completes
  onTranslateEnd(_initial: MyShape, _current: MyShape) {
    this.editor.setSelectedShapes([])
  }

  // Called when resize completes
  onResizeEnd(_initial: MyShape, _current: MyShape) {
    this.editor.setSelectedShapes([])
  }
}
```

**Use case**: Prevent metadata panels from appearing after transform gestures while maintaining click-to-select functionality.

---

## Reactivity & Performance Patterns

### 1. Camera/Viewport Tracking

**❌ Anti-Pattern**: Multiple separate subscriptions for camera state

```typescript
// BAD: Subscriptions multiply re-renders exponentially
const zoom = useValue('zoom', () => editor.getZoomLevel(), [editor])
const viewport = useValue('viewport', () => editor.getViewportPageBounds(), [editor])
```

**✅ Correct Pattern**: Single combined subscription

```typescript
// GOOD: TLDraw batches camera updates
const cameraState = useValue('camera', () => ({
  viewport: editor.getViewportPageBounds(),
  zoom: editor.getZoomLevel()
}), [editor])
```

**Why**: Camera updates are batched internally. Separate subscriptions cause cascading re-renders during pan/zoom.

---

### 2. `track()` vs Manual Subscriptions

**❌ Anti-Pattern**: Manual `useValue` + `memo`

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

**✅ Correct Pattern**: `track()` HOC

```typescript
// GOOD: Proxy-based automatic subscriptions
export const MyOverlay = track(function MyOverlay() {
  const editor = useEditor()
  const selectedIds = editor.getSelectedShapeIds() // Auto-subscribed

  const shapes = selectedIds
    .map(id => editor.getShape(id)) // Auto-subscribed per shape
    .filter(/*...*/)

  return shapes.map(shape => <MyComponent key={shape.id} />)
})
```

**Why**: `track()` uses JavaScript Proxy to intercept property access and create optimal subscriptions. Manual approaches can't batch updates effectively.

---

### 3. Expensive Queries in Render

**❌ Anti-Pattern**: Untracked shape queries

```typescript
// BAD: Called every render without caching
const MyComponent = memo(({ shapeId }) => {
  const editor = useEditor()
  const shape = editor.getShape(shapeId) // Expensive!
  const bounds = editor.getShapePageBounds(shape) // Very expensive!

  return <div>...</div>
})
```

**✅ Correct Pattern**: Let `track()` handle it

```typescript
// GOOD: Automatic caching and subscription
const MyComponent = track(({ shapeId }) => {
  const editor = useEditor()
  const shape = editor.getShape(shapeId) // Subscribed + cached
  const bounds = editor.getShapePageBounds(shape) // Subscribed + cached

  return <div>...</div>
})
```

**Why**: `editor.getShapePageBounds()` is computationally expensive. TLDraw caches these when using reactive subscriptions.

---

### 4. `useMemo` with Reactive Dependencies

**❌ Anti-Pattern**: Reactive values in dependency arrays

```typescript
// BAD: Re-memoizes mid-frame
const positioning = useMemo(() => {
  return calculatePosition(shape.x, shape.y, shape.props.w, shape.props.h)
}, [editor, shape, shape.x, shape.y, shape.props.w, shape.props.h, zoom])
// Reactive deps trigger re-memoization during same frame
```

**✅ Correct Pattern**: Stable dependencies only

```typescript
// GOOD: track() handles reactivity, useMemo for pure computation
const positioning = useMemo(() => {
  return calculatePosition(shape.x, shape.y, shape.props.w, shape.props.h)
}, [shape.x, shape.y, shape.props.w, shape.props.h]) // Only stable deps
```

**Why**: Reactive dependencies cause layout thrashing by triggering re-memoization during the same frame.

---

### 5. Coordinate Transformations

**❌ Anti-Pattern**: Manual viewport math

```typescript
// BAD: Error-prone and not reactive
const screenX = (pageX - camera.x) * zoom
const screenY = (pageY - camera.y) * zoom
```

**✅ Correct Pattern**: Use built-in APIs

```typescript
// GOOD: Handles all viewport math + reactive
const screenPos = editor.pageToScreen({ x: pageX, y: pageY })
```

**Why**: `pageToScreen()` is reactive to camera changes and handles edge cases.

---

### 6. Hover State in Components

**❌ Anti-Pattern**: React state for hover effects

```typescript
// BAD: Triggers re-renders on every mouse move
const [isHovered, setIsHovered] = useState(false)

return (
  <HTMLContainer onMouseEnter={() => setIsHovered(true)}>
    <div style={{ opacity: isHovered ? 1 : 0.5 }} />
  </HTMLContainer>
)
```

**✅ Correct Pattern**: CSS-only or TLDraw's hover system

```typescript
// GOOD: No state updates during mouse movement
return (
  <HTMLContainer>
    <div className="hover-effect" />
  </HTMLContainer>
)
```

**Why**: Hover state causes React re-renders during mouse movements, leading to frame drops.

---

## Zoom-Aware UI Patterns

### Inside Shape Components (HTMLContainer)

Props are in **page space** - `HTMLContainer` handles scaling automatically.

```typescript
component(shape: MyShape) {
  const { w, h } = shape.props // Page space units

  return (
    <HTMLContainer style={{ width: w, height: h }}>
      {/* Everything scales with zoom automatically */}
      <div style={{ fontSize: 14, padding: 8 }} />
    </HTMLContainer>
  )
}
```

### Outside Shape Components (InFrontOfTheCanvas)

Manual zoom scaling with clamping to prevent extreme sizes.

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

**Key**: Always clamp zoom values to prevent UI from becoming unusable at extreme zoom levels.

---

## Common Mistakes & Testing

### Common Mistakes to Avoid

1. **Don't** check `inputs.isDragging` - use state machine (`editor.isIn()`)
2. **Don't** use `inputs.buttons` for reactivity - it's a mutable Set
3. **Don't** query `getZoomLevel()` outside component methods
4. **Don't** call `getShapePageBounds()` without `track()`
5. **Don't** use multiple `useValue` calls for related state (camera/viewport)
6. **Don't** include reactive values in `useMemo` dependencies
7. **Don't** use hover state in shape components
8. **Don't** manually transform coordinates - use `pageToScreen()`
9. **Don't** mix manual subscriptions with `track()`

### Performance Testing Checklist

#### Frame Rate Testing
- [ ] Zoom in/out: 120fps smooth
- [ ] Pan: 120fps smooth
- [ ] Select shapes: No frame drops
- [ ] Hover shapes: No frame drops
- [ ] Resize/drag shapes: No frame drops

#### Memory Leak Testing
- [ ] Create/delete shapes repeatedly: Memory stable
- [ ] Zoom in/out repeatedly: No memory growth
- [ ] Select/deselect repeatedly: No subscriptions leaked

#### Subscription Auditing
- [ ] Console.log render counts during interactions
- [ ] Check React DevTools for excessive re-renders
- [ ] Verify single camera subscription per component
- [ ] Confirm no mutable properties used for reactivity

---

## Summary

**Key Principles**:

1. **State Machine First**: Use `editor.isIn()` for interaction states, not `inputs.*` properties
2. **Let TLDraw Handle Subscriptions**: Prefer `track()` over manual `useValue` + `memo`
3. **Combine Related State**: Single subscription for camera (zoom + viewport)
4. **Reactivity Boundaries**: Don't put reactive values in `useMemo` deps
5. **Trust the Framework**: TLDraw's built-in APIs (`pageToScreen`, shape caching) are optimized

**Most Critical Performance Killer**: Multiple subscriptions for camera/viewport state - always combine them into a single `useValue` call.
