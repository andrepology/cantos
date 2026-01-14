# Portal Tactile Redesign - Architecture Analysis

## Executive Summary

This document analyzes the current Portal implementation to support a ground-up redesign focused on **tactile, physics-based interactions** with fluid animations between layout modes using Framer Motion.

---

## Current Architecture

### Core Components

#### 1. **PortalShape** (`src/shapes/PortalShape.tsx`)
- **Type**: TLDraw BaseBoxShapeUtil
- **Responsibility**: Root shape component that orchestrates all Portal functionality
- **Key Features**:
  - Manages shape props (channel, userId, dimensions, deck view state)
  - Collision avoidance system with ghost preview
  - Drag-out spawning for blocks and channels
  - Connection management (linking channels)
  - Aspect ratio caching
  
**Critical Pattern**: Currently renders `PortalContent` which conditionally mounts different layout components based on mode.

#### 2. **Deck** (`src/arena/Deck.tsx`)
- **Type**: Container component for all layouts
- **Responsibility**: Routes to appropriate layout component based on `layoutMode`
- **Current Layout Components**:
  - `StackLayout` - Card stack with depth effects
  - `MiniLayout` - Collapsed folder view
  - `VirtualRowLayout` - Horizontal scrollable (with 3D carousel for 5-15 cards)
  - `VirtualGridLayout` - Masonry grid using `masonic` library
  - `TabsLayout` - Horizontal tabs
  - `VerticalTabsLayout` - Vertical tabs

**Critical Issue**: Each layout is a **separate component** that mounts/unmounts on mode change → jarring transitions, lost scroll position.

### Layout Mode Determination

#### **Logic** (`src/arena/layout.ts` - `selectLayoutMode`)

```
Hierarchy of rules (in order):
1. Very short + wide (h ≤ 60, ar ≥ 2.4) → tabs
2. Very narrow + tall (w ≤ 56, ar ≤ 0.65) → htabs  
3. Small shapes (w ≤ 120 OR h ≤ 120):
   - Square-ish (0.75 ≤ ar ≤ 1.33) → mini
   - Landscape (ar ≥ 2.4) → row
   - Portrait (ar ≤ 0.65) → column
   - Gap ranges → mini (default)
4. Large + square (w,h ≥ 216, 0.8 ≤ ar ≤ 1.25) → grid
5. Wide (ar ≥ 2.4) → row
6. Tall (ar ≤ 0.65) → column
7. Fallback → stack
```

**Thresholds** (from `LAYOUT_CONSTANTS`):
- Grid: min 216×216, aspect 0.8-1.25
- Row: aspect ≥ 2.4
- Column: aspect ≤ 0.65
- Mini: max 120×120
- Square range: 0.75-1.33

### Scroll Restoration Systems

**Problem**: Currently **THREE separate implementations**:

#### 1. **Anchor-based** (`useDeckScroll.ts`)
Used by: Row/Column layouts
- Saves anchor card ID + fractional viewport position
- Restores by repositioning anchor card to same viewport fraction
- Memory: `Map<deckKey, {anchorId, anchorFrac, rowX, colY, stackIndex}>`

#### 2. **Pixel-based** (`VirtualRowLayout.tsx`)
Used by: Row layout (separate from anchor system!)
- Stores raw `scrollOffset` in pixels
- Memory: `Map<deckKey, {scrollOffset}>`

#### 3. **Masonic internal** (`VirtualGridLayout.tsx`)
Used by: Grid layout
- Stores `scrollTop` directly
- Memory: `Map<deckKey, {scrollTop}>`

**Deck Key**: Computed from card IDs → `{sortMode}:{length}:{first10}::{last10}`

### Virtualization Implementations

#### 1. **VirtualRowLayout** - react-window `Grid`
- **Library**: `react-window`
- **Strategy**: Single-row grid with horizontal scrolling
- **Special**: 3D carousel for 5-15 cards (non-virtualized)
- **Performance**: Renders ~3-5 cards + overscan

#### 2. **VirtualGridLayout** - Masonic
- **Library**: `masonic` (uses `usePositioner` + `useMasonry`)
- **Strategy**: Masonry layout with dynamic column count
- **Responsive**: 1 column (chat mode) or N columns (grid mode)
- **Performance**: Only renders visible + overscan rows
- **Features**: 
  - Intrinsic image sizing
  - Fade-in animation for NEW cards (not re-virtualized)
  - Chat metadata (profile circles, timestamps) in single-column

#### 3. **StackLayout** - No virtualization
- **Strategy**: Render all cards, apply CSS transforms
- **Performance**: Acceptable for typical channel sizes (<100 cards)
- **Animation**: Smooth depth/stack effects with transitions

### Aspect Ratio Cache

**Implementation** (`useAspectRatioCache.ts`):
- **Shared global cache** across all hooks: `Map<blockId, {ratio, timestamp, accessCount}>`
- **TTL**: 15 minutes
- **Max size**: 500 entries (LFU eviction)
- **Sources** (priority order):
  1. Cached value
  2. Metadata (originalDimensions for images, embed dimensions for media)
  3. Async image load (using `new Image()`)
  4. Fallback ratios (16:9 for media, 3:4 for PDFs)

**Used by**:
- `useCardSizing` - Stack layout intrinsic sizing
- Drag-out spawning - Initial shape dimensions
- Tiling system - Collision-free placement

### Drag Interactions

#### **Drag Out** (`useDeckDragOut.ts`)
1. **PointerDown**: Capture pointer, store start position, measure aspect from DOM
2. **PointerMove**: 
   - If dist < 6px threshold → wait
   - Else → spawn shape, enter drag mode
3. **During drag**: Global listeners (bypasses virtualization) update shape position
4. **PointerUp**: Clear `spawnDragging` flag → triggers scale-up transition

**Tactile Effects**:
- `spawnIntro` → `spawnDragging` → normal
- Scale: 1.0 → 0.96 → 1.0
- Shadow elevation during drag
- 150ms cubic-bezier transitions

#### **Channel Drag Out** (`useChannelDragOut.ts`)
Similar pattern, spawns Portal shapes instead of Block shapes.

### Current Performance Strategies

1. **Memoization**: Heavy use of `memo()`, `useMemo()`, `useCallback()`
2. **Stable callbacks**: `useStableCallback` pattern to prevent prop churn
3. **RAF batching**: Persistence updates batched via `requestAnimationFrame`
4. **Virtualization**: Only render visible items
5. **Lazy aspect measurement**: Async image loads don't block render
6. **Debounced resize**: 80ms debounce on layout mode calculation

---

## Problem Analysis

### 1. **Discontinuous Layout Transitions**
- Each layout = separate component
- Mount/unmount causes flash
- CSS transitions insufficient for complex morphs
- No shared coordinate system between layouts

### 2. **Fragmented Scroll State**
- 3 different systems (anchor, pixel, masonic)
- State doesn't transfer between modes
- Lost scroll position on mode change

### 3. **Inconsistent Animations**
- Stack has smooth depth transitions
- Row/Grid have none
- Drag-out has scale effects
- No retargeting capability

### 4. **Virtualization Conflicts**
- Can't animate cards that aren't mounted
- Different virtualization per layout
- Drag-out requires global listeners to bypass virtualization

---

## Design Constraints

### Must Preserve

1. **PortalLabel** - Zoom-aware search/navigation (works great)
2. **Block rendering** - CardView/IntrinsicPreview components
3. **Data fetching** - useArenaData hooks
4. **Aspect ratio cache** - Shared cache system
5. **Performance** - Must handle 1000+ cards
6. **Collision avoidance** - Ghost overlay + snap-to-grid
7. **Connection management** - Channel linking system

### Can Modify/Replace

1. Layout routing logic
2. Scroll restoration system
3. Virtualization strategy (if unified)
4. Animation system
5. Card positioning logic

---

## Technical Challenges

### 1. **Animation + Virtualization**
- Can't animate cards that aren't mounted
- Solution space:
  - Shared layout calculation (FLIP technique)
  - Temporarily disable virtualization during transitions
  - "Window" of animated cards (N=8) + fade rest

### 2. **Scroll Position Transfer**
- Different scroll axes per mode (row=X, column=Y, grid=Y)
- Need unified "content position" concept
- Solution: Card-relative positioning (which card is at viewport center?)

### 3. **Retargetable Springs**
- User can resize mid-animation
- Springs must redirect smoothly
- Motion's `useSpring` with external state updates

### 4. **Performance Budget**
- Current: <16ms frame time for 1000 cards (virtualized)
- Must maintain with Motion overhead
- Motion's `AnimatePresence` can be expensive

---

## Framer Motion Considerations

### Key APIs for This Use Case

1. **`motion.div`** - Animatable primitives
2. **`AnimatePresence`** - Enter/exit animations (use sparingly)
3. **`useSpring`** - Retargetable spring physics
4. **`useMotionValue`** - External animation state
5. **`animate()`** - Imperative animations
6. **Layout animations** - `layout` prop (may conflict with virtualization)

### Performance Patterns

- **Individual springs** per card (N=8) vs **shared layout transition**
- **`willChange`** hints for GPU acceleration
- **`transform` only** (no layout-triggering props)
- **Avoid `AnimatePresence`** on large lists
- **Exit animations**: Fade out before unmount

---

## Architecture Principles for Redesign

### 1. **Single Layout Container**
- One component handles all modes
- CSS Grid / Flexbox with dynamic styles
- No mount/unmount on mode change

### 2. **Unified Card Registry**
- Track card positions across modes
- FLIP (First, Last, Invert, Play) transitions
- Share coordinate space

### 3. **Selective Animation**
- Only animate N cards (configurable, default 8)
- Others: instant position + fade
- Prioritize visible cards

### 4. **Content-Relative Scroll**
- Store: "Card X is at viewport fraction Y"
- Transfer across modes
- Consistent anchor card concept

### 5. **Motion-First State**
- `useMotionValue` for positions
- Springs update external state
- React for UI, Motion for animation

---

## Data Flow Analysis

### Current: Props Drilling
```
PortalShape
  └─ PortalContent
       └─ Deck
            ├─ StackLayout
            ├─ VirtualRowLayout
            ├─ VirtualGridLayout
            └─ ... (conditionally rendered)
```

### Proposed: Unified Layout
```
PortalShape
  └─ PortalContent
       └─ UnifiedDeck
            └─ (renders all cards, positions via mode)
```

---

## Next Steps

See companion spec document for:
- Detailed interaction design specs
- Animation timing curves
- State machine for modes
- Implementation phases
- Success metrics

