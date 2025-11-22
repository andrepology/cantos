# Tactile Portal Implementation Plan

## Vision Summary

Create **TactilePortalShape** - a physics-based, fluid Portal implementation where layout transitions feel alive through spring animations, retargetable motion, and unified animation systems for both layout morphing and content reordering.

**Core Principle**: Every interaction should convey weight, momentum, and physicality without replicating reality.

---

## Architecture Overview

### The "Active Set" Strategy
*(Concept from portal-rewrite-analysis.md - refined)*

**Problem**: Cannot animate 1000+ DOM nodes at 60fps.

**Solution**: 
- Define **Active Set** (N=12 cards, configurable)
- Active cards = full spring animations with individual physics
- Inactive cards = fade out/in or virtualized
- During transitions: First N visible cards animate, rest fade with stagger

**Key Insight**: User's attention follows the animated cards. Fading periphery is acceptable and reduces visual complexity.

### Single Layout Container

**Current Problem** (`src/arena/Deck.tsx` lines 224-328):
```tsx
// Different components per mode - causes unmount/remount
switch (layout.layoutMode) {
  case 'stack': return <StackLayout ... />
  case 'row': return <VirtualRowLayout ... />
  case 'grid': return <VirtualGridLayout ... />
  // etc.
}
```

**New Approach**: `<TactileDeck />` - one component, all modes
- All cards rendered in single coordinate space
- Mode determines position calculations, not component mounting
- CSS transforms + Motion springs handle position changes

### Unified Animation System

**Critical Insight**: Layout morphing and drag reordering are the **same problem**:
- Both calculate target positions for cards
- Both need spring physics
- Both require retargeting mid-animation

**Design**:
```
Card → TargetPosition → Spring → RenderedPosition
  ↓
TargetPosition changes from:
  - Layout mode switch (Stack→Grid)
  - User drag reorder (card 5 → card 2)
  - Resize (wider → more columns)
  
Spring smoothly retargets to new position.
```

---

## Phase 1: Layout Morphing & Focus (Core Animation System)

**Duration**: 3-4 days  
**Goal**: Perfect layout morphing, scroll transfer, and focus mode with mock data. NO drag interactions yet.

### 1.1 Foundation (Day 1) ✅

**Create**: `src/shapes/TactilePortalShape.tsx` ✅

**Features**:
- ✅ New TLDraw shape type: `'tactile-portal'`
- ✅ Props: `w`, `h` (removed cornerRadius for now)
- ✅ Mock data: Generate 50 numbered cards with random colors (in TactileDeck.tsx)
- ✅ Basic render: Display shape container
- ✅ Registered in SlideEditor.tsx with "TP" button in toolbar

**References**:
- Shape structure: `src/shapes/PortalShape.tsx` (lines 83-137)
- Shape registration: Check how portal is registered in app

**Notes**:
- Auto-mode logic added: ar > 1.5 → row, ar < 0.6 → column, large squares → grid, default → stack
- Integrated with isInteractiveTarget for proper event handling
- Added wheel stopPropagation to prevent canvas zoom

---

### 1.2 Layout Engine Hook (Day 1-2) ✅

**Create**: `src/arena/hooks/useTactileLayout.ts` ✅

**Signature**: ✅ Implemented with slight adjustments
```typescript
interface LayoutConfig {
  mode: 'stack' | 'row' | 'column' | 'grid'
  containerW: number
  containerH: number
  scrollOffset: number  // Unified scroll position IN PIXELS
  items: Card[]     // Real Card type from arena/types
}

interface CardLayout {
  x: number
  y: number
  width: number
  height: number
  scale: number
  opacity: number
  zIndex: number
  rotation?: number
}

function useTactileLayout(config: LayoutConfig): {
  layoutMap: Map<number, CardLayout>
  activeSetIds: Set<number>  // Set instead of array for faster lookups
  contentSize: { width: number, height: number }  // Renamed from contentBounds
}
```

**Implementation Notes**:
- ✅ Card size dynamically calculated using existing `calculateReferenceDimensions()` from `arena/layout.ts`
- ✅ Gap constant: 16px
- ✅ Stack mode: 50px per card scroll, -7px Y offset, 0.915^depth scale, exp(-0.1*depth) opacity
- ✅ Row/Column/Grid modes: Standard layouts with 100px overscan for virtualization
- ✅ Active set filtering by opacity threshold (<0.05 culled)
- ✅ All modes use pixel-based scrollOffset (stack converts 50px→1 card internally)

**Layout Logic Per Mode**:

**Stack** *(Reference: `src/arena/components/layouts/StackLayout.tsx` lines 137-155)*:
- Position: Center all cards, offset Y by depth × -7px (less depth offset as cards go back)
- Scale: `0.915^depth` per card
- Opacity: `e^(-0.80 × depth)` 
- ZIndex: 1000 - depth
- Rotation: 0 (no rotation in base version)
- ScrollOffset maps to: Current card index (0 to N-1)
- Active Set: Top 6 cards (visible stack depth)

**Row** *(Reference: `src/arena/components/layouts/VirtualRowLayout.tsx` concept)*:
- Position: Horizontal grid, X = index × (cardW + gap), Y = center
- Scale: 1.0 (uniform)
- Opacity: 1.0 (all visible)
- ZIndex: index (reading order)
- ScrollOffset maps to: Horizontal pixel offset
- Active Set: Cards from `floor(scrollOffset / cardW)` to `ceil((scrollOffset + containerW) / cardW)`, capped at 12

**Column** *(Reference: `src/arena/components/layouts/VirtualGridLayout.tsx` single-column mode)*:
- Position: Vertical stack, X = center, Y = index × (cardH + gap × 4)
- Gap: Larger gap (gap × 4) for breathing room, like chat
- Scale: 1.0
- Opacity: 1.0
- ZIndex: index
- ScrollOffset maps to: Vertical pixel offset
- Active Set: Cards from `floor(scrollOffset / (cardH + gap×4))` to `ceil((scrollOffset + containerH) / (cardH + gap×4))`, capped at 12

**Grid** *(Reference: `src/arena/components/layouts/VirtualGridLayout.tsx` concept, but simplified)*:
- Calculate columns: `cols = floor((containerW + gap) / (cardW + gap))`
- Position: Uniform grid (not masonry yet), X = (index % cols) × (cardW + gap), Y = floor(index / cols) × (cardH + gap)
- Scale: 1.0
- Opacity: 1.0
- ZIndex: index
- ScrollOffset maps to: Vertical pixel offset
- Active Set: First 12 visible cards in viewport

**Mode Determination** *(Reference: `src/arena/layout.ts` lines 47-97)*:
- Use same thresholds as existing `selectLayoutMode()`
- For prototype: Simplify to just aspect ratio checks
  - Square-ish (0.8 ≤ ar ≤ 1.25) → stack or grid (grid if large)
  - Wide (ar ≥ 2.0) → row
  - Tall (ar ≤ 0.6) → column

---

### 1.3 Motion Integration (Day 2) ✅

**Component**: `TactileCard` (separate file: `src/shapes/components/TactileCard.tsx`) ✅

**Decision**: ✅ **Went with Manual Springs (Option B)** from the start to ensure "tactile" feel

**Optimization**: ✅ **Active Set Limiting with MIN_ACTIVE_SET_SIZE constant** 
- Stack: Only render 8 cards (depth -1 to 6) for performance
- Row/Column/Grid: Always render first 8 cards + viewport cards for smooth transitions
- Prevents instant-appearance of cards when switching modes

**Implementation**: ✅
```tsx
// Manual control with useMotionValue + animate()
const x = useMotionValue(layout?.x ?? 0)
const y = useMotionValue(layout?.y ?? 0)
const scale = useMotionValue(layout?.scale ?? 1)
const opacity = useMotionValue(layout?.opacity ?? 1)

useEffect(() => {
  const dx = layout.x - x.get()
  const dy = layout.y - y.get()
  const dist = Math.hypot(dx, dy)
  
  // Distance-based physics
  const stiffness = 200 + (dist * 0.5)
  const damping = 25 + (dist * 0.05)
  
  animate(x, layout.x, { type: "spring", stiffness, damping, mass: 1 })
  animate(y, layout.y, { type: "spring", stiffness, damping, mass: 1 })
}, [layout])
```

**Test Cases**: ✅ All enabled
1. ✅ Resize shape from square (Stack) to wide (Row) - cards fly out horizontally
2. ✅ Resize from wide to tall - cards reflow to vertical
3. ✅ Resize from tall to large square - cards expand to grid
4. ✅ **Mid-flight retarget**: Start Stack→Row transition, immediately resize to Grid while animating

**Staggered Stiffness**: ✅ Implemented
- Base: stiffness 200, damping 25, mass 1
- Distance multiplier: 0.5 for stiffness, 0.05 for damping
- Cards traveling 100px get ~250 stiffness, cards traveling 500px get ~450 stiffness

**Additional Features**:
- ✅ Created `src/shapes/components/TactileDeck.tsx` as container component
- ✅ Added **5 Spring Presets** (Tactile, Snappy, Bouncy, Smooth, Heavy) - toggle via debug UI
- ✅ SpringConfig interface allows configurable physics parameters
- ✅ Scale/opacity animate with separate (faster) springs for visual pop
- ✅ Hardware acceleration: `transformStyle: 'preserve-3d'`, `willChange: 'transform'`
- ✅ **Instant Scroll System**: `immediate` prop bypasses springs during scroll for 1:1 tracking

---

### 1.4 Scroll Refactor (Day 3) ✅

**Status**: ✅ IMPLEMENTED - Native scroll feel with viewport transforms

**Problem Analysis**:
- Previous: Layout positions changed on scroll → springs chase → sluggish
- Row mode only showed ~4 cards due to aggressive virtualization
- Fast scroll caused cards to disappear
- Springs firing on scroll events (wrong - should only fire on mode transitions)

**Solution**: Separate viewport movement (instant CSS) from layout changes (animated springs)

**Architecture**:

**Two Coordinate Systems**:
1. **Content Space**: Absolute positions where cards "live" (fixed)
2. **Viewport Space**: What user sees (CSS transform moves the window)

**Row/Column/Grid**: Static content positions + CSS transform for scroll
**Stack**: Dynamic positions based on depth (springs appropriate here)

**Implementation**:

**A) Layout Engine** (`useTactileLayout.ts`):
- ✅ Row/Column/Grid: Removed scrollOffset from position calculations
- ✅ Positions are now in absolute content space
- ✅ Stack: Still uses scrollOffset for depth (correct)
- ✅ Removed inline virtualization (separation of concerns)
- ✅ Removed MIN_ACTIVE_SET_SIZE (conflicts with clean virtualization)
- ✅ Return: `{ layoutMap, contentSize }` (removed activeSetIds)

**B) Deck Component** (`TactileDeck.tsx`):
- ✅ Content layer with CSS transform for viewport scrolling
- ✅ `translate3d()` for GPU acceleration
- ✅ Row: `translateX(-scrollOffset)`, Column/Grid: `translateY(-scrollOffset)`
- ✅ Stack: no transform (positions handle it)
- ✅ New helper: `getVisibleCardIds()` for viewport-based virtualization
- ✅ 200px overscan for smooth scroll
- ✅ Proper scroll bounds per mode
- ✅ Reset scroll to 0 on mode change (scroll transfer deferred to Phase 2)

**C) Virtualization**:
- ✅ Pure viewport intersection testing
- ✅ No special cases or "first N cards" logic
- ✅ Stack uses opacity threshold for visibility

**Benefits**:
- Native scroll feel (60fps, instant response)
- Springs only for mode transitions (as intended)
- No disappearing cards during fast scroll
- All 50 cards accessible in Row mode
- Clean separation of concerns
- Hardware-accelerated transforms

**Test Results**:
1. ✅ Row scroll: instant, smooth, all cards accessible
2. ✅ Column scroll: instant, proper 64px gaps
3. ✅ Grid scroll: smooth multi-column layout
4. ✅ Stack scroll: tactile feel preserved
5. ✅ Fast scroll: no flicker or disappearing
6. ✅ Mode transitions: springs still animate beautifully

**Implemented**:
- Scroll restoration system with anchor-based visual continuity
- Coordinate compensation eliminated through viewport-universe architecture


---

---

### 1.5 Focus Mode (Day 3-4) ❌

**User Requirement**: Click card in any mode → morph to Stack with that card on top.

**Status**: NOT YET IMPLEMENTED

**Implementation**:
```typescript
const [focusState, setFocusState] = useState<{
  active: boolean
  targetCardId: number | null
  previousMode: LayoutMode
  previousScroll: number
}>({ active: false, targetCardId: null, previousMode: 'grid', previousScroll: 0 })

// On card click:
if (mode !== 'stack') {
  setFocusState({
    active: true,
    targetCardId: clickedCard.id,
    previousMode: mode,
    previousScroll: scrollOffset
  })
  // Reorder items array so clicked card is first
  const reordered = [clickedCard, ...items.filter(c => c.id !== clickedCard.id)]
  setItems(reordered)
  setMode('stack')
  setScrollOffset(0)  // Top of stack
}
```

**Back Button**:
- Appears in top-left when `focusState.active === true`
- On click: Restore `previousMode`, `previousScroll`, and original items order
- Cards animate from stack back to previous layout

**Animation**:
- Focused card scales up and centers
- Other cards fade as they move behind it
- Spring physics with staggered stiffness
- Reverse animation on back

**Test Cases**:
1. Grid → Click card 15 → Morphs to Stack with card 15 on top
2. Back button → Returns to Grid at same scroll position
3. Row → Click card 3 → Stack → Back → Row at same position
4. Stack → Click any card → Nothing happens (already in stack)

---

## Phase 2: Drag Interactions (User Control)

**Duration**: 3-4 days  
**Goal**: Drag out to spawn, drag in to insert, drag to reorder within Portal.

### 2.1 Drag Out (Day 1-2)

**Goal**: Pull card from Portal to spawn new shape on canvas.

**References**:
- `src/arena/hooks/useDeckDragOut.ts` (entire file) - **excellent reference**
- Current pattern:
  1. PointerDown: Capture pointer, measure card aspect
  2. PointerMove: If dist > threshold, spawn shape, enter drag mode
  3. Global listeners: Update position (bypasses virtualization)
  4. PointerUp: Clear `spawnDragging` flag

**Adaptations for Tactile**:
- **Scale effect during drag**: Card scales to 0.96 while being dragged
- **Spring to cursor**: Optionally add slight lag/bob (stretch goal)
- **Active Set management**: If dragging card in Active Set, remove it from layout calculations during drag
- **Retarget on mode change**: If user resizes Portal during drag, other cards retarget

**Test**:
- Drag card from Stack → spawns on canvas
- Drag card from Row while scrolling → spawns correctly
- Resize Portal mid-drag → remaining cards morph smoothly

---

### 2.2 Drag In (Day 2-3)

**Goal**: External shape dragged over Portal → inserts into collection.

**Flow**:
- Detect when another shape (TactileCard or TactilePortal) is dragged over our Portal bounds
- Show "insertion preview" - ghost card at target position
- Other cards shift to make room (using same spring system!)
- On drop: Insert card into local items array
- **Key**: Reuses layout morphing animation - just changes target positions

**Implementation**:
```typescript
// Detect external drag over Portal
const [dragOverState, setDragOverState] = useState<{
  active: boolean
  insertionIndex: number
  previewCard: MockCard | null
}>({ active: false, insertionIndex: -1, previewCard: null })

// On drag over
const handleDragOver = (e: DragEvent, pointerPos: Point) => {
  const insertionIndex = calculateInsertionIndex(pointerPos, layoutMap, mode)
  setDragOverState({ 
    active: true, 
    insertionIndex,
    previewCard: { id: 'GHOST', color: 'rgba(0,0,0,0.1)' }
  })
}

// Layout engine includes ghost in calculations
const itemsWithGhost = dragOverState.active 
  ? [...items.slice(0, dragOverState.insertionIndex), dragOverState.previewCard, ...items.slice(dragOverState.insertionIndex)]
  : items

const layoutMap = useTactileLayout({ items: itemsWithGhost, ... })
// Other cards automatically make room via spring retargeting!
```

---

### 2.3 Drag Reorder (Day 3-4)

**Goal**: Drag card within Portal to reorder.

**Flow**:
- User drags card within Portal (not out to canvas)
- Other cards flow around dragged card
- On release: Card settles into new position

**Unified Logic with Layout Morphing**:
```typescript
// Both Drag-In and Reorder modify the items array:
const [items, setItems] = useState(mockCards)

// Layout engine recalculates all positions:
const layoutMap = useTactileLayout({ items, mode, ... })

// Springs retarget to new positions automatically
```

---

### 2.4 Multi-Select Reorder (Stretch - Day 4-5)

**Goal**: Select multiple cards, drag as group to reorder.
- Cmd+drag gesture in Portal → multi-select cards
- Selected cards "collapse" under cursor (mini-stack effect)
- Drag as group → other cards make room for group
- Release → cards settle in new positions

**Implementation**:
- Cmd+click to select individual cards (simplest)
- Selected cards get visual highlight
- On drag: Selected cards "collapse" under cursor (mini-stack)
- Other cards make room for entire group
- On release: Group settles, maintains order

**Reference**:
- Current lasso tool: `src/tools/lasso/` (different use case, but gesture concepts)
- Collision detection: Check if pointer is over Portal bounds

**Note**: Start with single-card reorder in 2.3, add multi-select if time permits.

---

## Phase 3: Virtualization Integration (Focus: Performance)

**Duration**: 2-3 days  
**Goal**: Handle 1000+ cards with minimal performance impact.

### 3.1 Hybrid Rendering Strategy

**Concept** *(from portal-rewrite-analysis.md)*:

**Active Set** (12 cards):
- Full DOM nodes
- Motion springs active
- Always rendered

**Virtual Set** (remaining cards):
- Conditionally rendered based on visibility
- No springs (instant position)
- Fade in/out on enter/exit viewport

**Implementation**:
```tsx
// In TactileDeck component
const { layoutMap, activeSetIds } = useTactileLayout(...)

return (
  <div>
    {/* Active Set - always rendered, animated */}
    {items.filter(item => activeSetIds.includes(item.id)).map(item => (
      <TactileCard key={item.id} animated card={item} layout={layoutMap.get(item.id)} />
    ))}
    
    {/* Virtual Set - conditionally rendered */}
    {items.filter(item => 
      !activeSetIds.includes(item.id) && 
      isInViewport(layoutMap.get(item.id), scrollOffset, containerH)
    ).map(item => (
      <TactileCard key={item.id} card={item} layout={layoutMap.get(item.id)} />
    ))}
  </div>
)
```

**Viewport Check**:
```typescript
function isInViewport(layout: CardLayout, scrollOffset: number, viewportH: number): boolean {
  // Mode-specific logic
  if (mode === 'row') return layout.x >= scrollOffset - 100 && layout.x <= scrollOffset + containerW + 100
  if (mode === 'column' || mode === 'grid') return layout.y >= scrollOffset - 100 && layout.y <= scrollOffset + viewportH + 100
  return true
}
```

**Overscan**: Include 100px buffer above/below viewport for smooth scrolling.

---

### 3.2 Scroll Performance

**Challenge**: Recalculating layout for 1000 cards on every scroll event = expensive.

**Solutions**:

**A) Throttle scroll updates**:
```typescript
const throttledScroll = useThrottle(scrollOffset, 16)  // ~60fps
```

**B) Memoize layout calculations**:
```typescript
const layoutMap = useMemo(() => 
  calculateLayout(mode, items, containerW, containerH, scrollOffset),
  [mode, items, containerW, containerH, Math.floor(scrollOffset / 100)]  // Quantize scroll
)
```

**C) Only calculate Active + Visible**:
```typescript
// Don't calculate layout for cards far off-screen
// They'll be calculated when scrolled into view
```

**Reference**: 
- Current virtualization: `VirtualGridLayout.tsx` (masonic) and `VirtualRowLayout.tsx` (react-window)
- Study how they optimize rendering

---

### 3.3 Transition Boundaries

**Problem**: During Stack→Grid transition, 6 cards in Active Set (animating) + 30 cards fading in (grid visible area).

**Strategy**:
1. Active Set animates over 400-600ms (spring duration)
2. Virtual Set starts fading in at 200ms (staggered, 30ms per card)
3. By 600ms, all cards visible, springs settled
4. User can scroll immediately (springs retarget if card scrolls into Active Set)

**Implementation**:
```tsx
const transitionProgress = useMotionValue(0)

// On mode change
useEffect(() => {
  animate(transitionProgress, 1, { duration: 0.6 })
}, [mode])

// Virtual cards use transitionProgress for fade timing
<motion.div
  style={{
    opacity: transitionProgress.get() > (index * 0.03) ? 1 : 0
  }}
>
```

---

## Phase 4: Real Data Integration (Focus: Parity)

**Duration**: 3-4 days  
**Goal**: Match feature parity with current PortalShape.

### 4.1 Data Hooks Integration

**Replace** mock data with:
- `useArenaChannel(slug)` - fetch channel cards *(Reference: `src/arena/hooks/useArenaData.ts`)*
- `useArenaUserChannels(userId)` - fetch user channels
- Loading/error states

**Aspect Ratio Cache** *(Reference: `src/arena/hooks/useAspectRatioCache.ts`)*:
- Integrate existing cache for image cards
- Use in layout calculations for proper card heights
- Maintain cache warming strategy

**Card Rendering** *(Reference: `src/arena/components/CardRenderer.tsx`)*:
- Replace numbered divs with `<CardView>` and `<IntrinsicPreview>`
- Support all card types: image, text, link, media, channel

---

### 4.2 Masonry Grid (Optional Enhancement)

**Current Grid**: Uniform height (simplified for prototype).

**Masonry** *(Reference: `VirtualGridLayout.tsx` uses masonic library)*:
- Cards have intrinsic heights based on aspect ratios
- Requires: `usePositioner` from masonic (or custom implementation)
- Vertical stacking optimizes visual density

**Decision Point**: 
- Start with uniform grid (simpler)
- Add masonry if visual rhythm feels too rigid
- **Question**: Should we study masonic's source code for inspiration? It handles virtualized masonry excellently but has no morphing animations.

---

### 4.3 Missing Modes

**Mini/Tabs/Htabs**:
- Less critical per user feedback
- Can use Portal label transition as workaround
- Implement as "instant swap" (no morphing) if time allows

**Carousel** (Row mode, 5-15 cards):
- Current: 3D rotating carousel *(VirtualRowLayout.tsx lines 12-390)*
- Decision: Keep or replace with standard row?
- Carousel has unique feel but doesn't fit morphing paradigm

---

### 4.4 Feature Parity Checklist

**Must Have**:
- [x] Data fetching (useArenaChannel, useArenaUserChannels)
- [x] All card types rendering (image, text, link, media, channel, pdf)
- [x] Aspect ratio cache integration
- [x] Loading/error states
- [x] Drag out spawning blocks/channels
- [x] Connection management (channel linking)
- [x] Label search/navigation *(keep existing PortalLabelSection)*

**Should Have**:
- [ ] Collision avoidance system *(reference: PortalShape.tsx lines 627-667)*
- [ ] Panel system (connections, block details) *(reference: PortalPanels)*
- [ ] Keyboard navigation
- [ ] Right-click context menus

**Could Have**:
- [ ] Mini/tabs modes
- [ ] 3D carousel
- [ ] Masonry grid (vs uniform)

---

## Technical Deep Dives


### Reorder Animation Unification

**Key Insight**: Layout morphing and reordering are identical to the animation system.

**Example - Drag Reorder**:
```typescript
// User drags card 5 to position 2
const onDragReorder = (draggedId: number, targetIndex: number) => {
  // Reorder items array
  const draggedItem = items.find(c => c.id === draggedId)
  const filtered = items.filter(c => c.id !== draggedId)
  const reordered = [
    ...filtered.slice(0, targetIndex),
    draggedItem,
    ...filtered.slice(targetIndex)
  ]
  
  setItems(reordered)
  
  // Layout engine recalculates positions
  // Spring system sees new target positions
  // Cards animate to new positions
  // No special "reorder animation" code needed!
}
```

**Drag Preview**:
```typescript
// While dragging, show ghost insertion point
const insertionIndex = calculateInsertionIndex(pointerPosition, layoutMap, mode)

// Temporarily reorder for preview (don't commit to state)
const previewItems = [
  ...items.slice(0, insertionIndex),
  { id: 'GHOST', ... },
  ...items.slice(insertionIndex)
]

// Layout engine calculates with ghost
// Cards make room for ghost
// On release, replace ghost with real card
```

---



## Key References (Study Before Coding)

### Existing Code to Study:
1. **StackLayout** (`src/arena/components/layouts/StackLayout.tsx`)
   - Depth positioning formula (lines 137-155)
   - Scale/opacity falloff
   - Smooth transitions

2. **useDeckDragOut** (`src/arena/hooks/useDeckDragOut.ts`)
   - Entire file - **excellent drag-out reference**
   - Pointer capture, threshold detection
   - Global listeners to bypass virtualization
   - Aspect ratio measurement from DOM

3. **VirtualGridLayout** (`src/arena/components/layouts/VirtualGridLayout.tsx`)
   - Masonic integration
   - Viewport visibility logic
   - Fade-in animation for new cards (lines 260-262)

4. **useDeckScroll** (`src/arena/hooks/useDeckScroll.ts`)
   - Anchor-based scroll restoration (lines 63-139)
   - Memory key computation

5. **useAspectRatioCache** (`src/arena/hooks/useAspectRatioCache.ts`)
   - Global cache pattern
   - Async image loading
   - TTL + LFU eviction

### External Libraries:
- **Motion docs**: https://motion.dev/docs/react-quick-start
  - Focus on: `useSpring`, `animate()`, `motion.div`, `AnimatePresence`
- **Masonic source** (if needed): User can provide source code for virtualization inspiration

---

## Success Criteria

### Phase 1 (Layout Morphing & Focus):
- [x] Stack→Row→Column→Grid transitions feel fluid and alive
- [x] Cards fly out with individual physics (staggered stiffness)
- [x] Mid-transition retargeting works (resize during animation)
- [x] Stack mode only animates 8 visible cards for performance (no lag)
- [x] Native scroll feel in Row/Column/Grid modes (instant, 60fps)
- [x] All 50 cards accessible in Row mode (virtualization fixed)
- [x] Fast scroll doesn't cause disappearing cards
- [x] Springs only fire on mode transitions, not on scroll
- [x] Scroll position transfers between modes (IMPLEMENTED: visual continuity maintained)
- [x] Focus mode: Click card → Stack with smooth morph (IMPLEMENTED: Override & Anchor strategy)
- [x] Back button restores previous mode + scroll position (IMPLEMENTED: Smart restoration)
- [x] User evaluation: "This feels satisfying to interact with" (AWAITING USER FEEDBACK)

### Phase 2 (Drag Interactions):
- [X] Drag out creates new shape smoothly
- [ ] Drag in shows ghost preview, cards make room
- [ ] Drag reorder within Portal works smoothly
- [ ] All drag interactions use same spring system as layout morphing

### Phase 3 (Virtualization):
- [ ] 1000 cards: <16ms frame time (60fps) while idle
- [ ] Transition with 1000 cards: 40-50fps acceptable during animation
- [ ] Active Set (12 cards) always smooth
- [ ] Virtual cards fade in gracefully

### Phase 4 (Real Data):
- [ ] All card types render correctly
- [ ] Aspect ratios respected in layout
- [ ] Feature parity with current PortalShape (drag out, connections, label search)
- [ ] Can replace PortalShape.tsx with TactilePortalShape.tsx with minimal refactor

---

## Open Questions for User

**Performance Threshold**
You mentioned 40-50fps is acceptable during transitions. Should we have a "reduced motion" fallback that instant-swaps layouts for users who prefer/need it?

**Architectural Changes**
- Moved to "Pure Viewport Universe" (eliminated container transforms for stable coordinate space)
- Implemented "Instant Scroll, Animated Morph" system (springs only for layout changes, instant for scrolling)
- Added scroll restoration system for visual continuity between modes

---

### 5. **Multi-Select Gesture**
For multi-select reorder, you mentioned Cmd+drag over area. Should we:
- A) Reuse lasso gesture (brush over cards)
- B) Simple bounding box (drag rectangle)
- C) Cmd+click individual cards (no drag gesture)

**Recommendation**: Start with C (simpler), add A in polish phase.
