# React Window API Reference & Deck.tsx Integration Plan

## Overview
React Window provides virtualized rendering for large lists and grids. This document compiles all relevant APIs from the official documentation for integrating into Deck.tsx.

## Core Components

### FixedSizeList
Renders a windowed list of items with fixed item heights.

```tsx
import { FixedSizeList as List } from 'react-window'

<List
  height={number}           // Container height in pixels
  width={number}            // Container width in pixels
  itemCount={number}        // Total number of items
  itemSize={number}         // Height of each item in pixels
  layout={'vertical'}       // 'vertical' | 'horizontal'
  overscanCount={number}    // Number of items to render outside visible area (default: 2)
  onScroll={function}       // Callback fired when scroll position changes
  onItemsRendered={function} // Callback fired when items are rendered
  ref={React.Ref}           // Imperative API access
>
  {({ index, style }) => ReactElement}
</List>
```

### VariableSizeList
Renders a windowed list with variable item heights.

```tsx
import { VariableSizeList as List } from 'react-window'

<List
  height={number}
  width={number}
  itemCount={number}
  itemSize={(index) => number}  // Function returning height for item at index
  estimatedItemSize={number}    // Estimated average item height (optional)
  layout={'vertical'}
  overscanCount={number}
  onScroll={function}
  onItemsRendered={function}
  ref={React.Ref}
>
  {({ index, style }) => ReactElement}
</List>
```

### FixedSizeGrid
Renders a windowed grid of items with fixed cell sizes.

```tsx
import { FixedSizeGrid as Grid } from 'react-window'

<Grid
  columnCount={number}      // Number of columns
  columnWidth={number}      // Width of each column in pixels
  height={number}           // Container height in pixels
  rowCount={number}         // Number of rows
  rowHeight={number}        // Height of each row in pixels
  width={number}            // Container width in pixels
  overscanColumnCount={number} // Columns to render outside visible area (default: 2)
  overscanRowCount={number}    // Rows to render outside visible area (default: 2)
  onScroll={function}       // Callback fired when scroll position changes
  onItemsRendered={function} // Callback fired when items are rendered
  ref={React.Ref}           // Imperative API access
>
  {({ columnIndex, rowIndex, style }) => ReactElement}
</Grid>
```

## Common Props (All Components)

### Dimensions
- `height`: Container height in pixels
- `width`: Container width in pixels

### Item Configuration
- `itemCount` (List): Total number of items
- `columnCount` (Grid): Number of columns
- `rowCount` (Grid): Number of rows
- `itemSize` (FixedSizeList): Item height in pixels
- `itemSize(index)` (VariableSizeList): Function returning item height
- `columnWidth` (Grid): Column width in pixels
- `rowHeight` (Grid): Row height in pixels

### Performance
- `overscanCount` (List): Items to render outside visible area (default: 2)
- `overscanColumnCount` (Grid): Columns to render outside visible area (default: 2)
- `overscanRowCount` (Grid): Rows to render outside visible area (default: 2)
- `estimatedItemSize` (VariableSizeList): Average item height estimate

### Callbacks
- `onScroll({ scrollDirection, scrollOffset, scrollUpdateWasRequested })`
- `onItemsRendered({ overscanStartIndex, overscanStopIndex, visibleStartIndex, visibleStopIndex })`
- `onItemsRendered` (Grid): `({ overscanColumnStartIndex, overscanColumnStopIndex, overscanRowStartIndex, overscanRowStopIndex, visibleColumnStartIndex, visibleColumnStopIndex, visibleRowStartIndex, visibleRowStopIndex })`

### Layout
- `layout` (List): `'vertical'` | `'horizontal'` (default: 'vertical')

## Imperative API

### List Methods
```tsx
const listRef = useRef()

// Scroll to specific item
listRef.current.scrollToItem(index, 'start' | 'center' | 'end' | 'smart')

// Scroll to pixel offset
listRef.current.scrollTo(scrollOffset)

// Get current scroll offset
const offset = listRef.current.scrollOffset

// Reset measurement cache (for VariableSizeList)
listRef.current.resetAfterIndex(index, shouldForceUpdate)
```

### Grid Methods
```tsx
const gridRef = useRef()

// Scroll to specific item
gridRef.current.scrollToItem({ columnIndex, rowIndex }, 'start' | 'center' | 'end' | 'smart')

// Scroll to pixel offsets
gridRef.current.scrollTo({ scrollLeft, scrollTop })

// Get current scroll position
const { scrollLeft, scrollTop } = gridRef.current
```

## Render Props

### List Render Function
```tsx
{({ index, style }) => (
  <div style={style}>
    {/* Your item component */}
    <CardItem card={cards[index]} />
  </div>
)}
```

### Grid Render Function
```tsx
{({ columnIndex, rowIndex, style }) => {
  const index = rowIndex * columnCount + columnIndex
  return (
    <div style={style}>
      <CardItem card={cards[index]} />
    </div>
  )
}}
```

## Integration Patterns

### Handling Dynamic Item Sizes
```tsx
// For VariableSizeList, provide itemSize function
const getItemSize = useCallback((index) => {
  const card = cards[index]
  // Calculate dynamic height based on card content
  return calculateCardHeight(card)
}, [cards])

<VariableSizeList itemSize={getItemSize} ... />
```

### Preserving Scroll Position
```tsx
const [scrollOffset, setScrollOffset] = useState(0)

const handleScroll = useCallback(({ scrollOffset }) => {
  setScrollOffset(scrollOffset)
  // Update your existing scroll memory logic
}, [])

<List
  initialScrollOffset={scrollOffset}
  onScroll={handleScroll}
  ...
/>
```

### Handling Resize
```tsx
// Reset cache when container size changes
useEffect(() => {
  if (listRef.current) {
    listRef.current.resetAfterIndex(0, true)
  }
}, [width, height])
```

## Deck.tsx Integration Plan

### Current Rendering (Problematic)
- **Row mode**: `{cards.map(card => <CardItem card={card} />)}` (line 1191)
- **Grid mode**: `{cards.map(card => <CardItem card={card} />)}` (line 1320)
- **Column mode**: `{cards.map(card => <CardItem card={card} />)}` (line 1418)

### Proposed Changes

#### 1. Row Mode → FixedSizeList (horizontal)
```tsx
// Replace cards.map with:
<FixedSizeList
  height={vh}
  width={vw}
  itemCount={cards.length}
  itemSize={cardW + gap}
  layout="horizontal"
  overscanCount={5}
  onScroll={({ scrollOffset }) => {
    // Keep existing scroll memory logic
    const prev = deckScrollMemory.get(deckKey)
    deckScrollMemory.set(deckKey, {
      rowX: scrollOffset,
      colY: prev?.colY ?? 0,
      anchorId: prev?.anchorId,
      anchorFrac: prev?.anchorFrac
    })
    scheduleSelectedRectUpdate()
  }}
  onItemsRendered={() => {
    scheduleSelectedRectUpdate()
  }}
>
  {({ index, style }) => (
    <div style={style}>
      <CardItem card={cards[index]} mode="row" />
    </div>
  )}
</FixedSizeList>
```

#### 2. Column Mode → VariableSizeList (vertical)
```tsx
// Replace cards.map with:
<VariableSizeList
  height={vh}
  width={vw}
  itemCount={cards.length}
  itemSize={(index) => {
    const card = cards[index]
    // Calculate dynamic height based on aspect ratio
    const { h } = getCardSizeWithinSquare(card)
    return h + gap
  }}
  estimatedItemSize={cardH + gap}
  overscanCount={5}
  onScroll={({ scrollOffset }) => {
    // Keep existing scroll memory logic
    const prev = deckScrollMemory.get(deckKey)
    deckScrollMemory.set(deckKey, {
      rowX: prev?.rowX ?? 0,
      colY: scrollOffset,
      anchorId: prev?.anchorId,
      anchorFrac: prev?.anchorFrac
    })
    scheduleSelectedRectUpdate()
  }}
  onItemsRendered={() => {
    scheduleSelectedRectUpdate()
  }}
>
  {({ index, style }) => (
    <div style={style}>
      <CardItem card={cards[index]} mode="column" />
    </div>
  )}
</VariableSizeList>
```

#### 3. Grid Mode → FixedSizeGrid
```tsx
// Replace cards.map with:
const columnCount = Math.max(1, Math.floor(vw / (cardW + gap)))
const rowCount = Math.ceil(cards.length / columnCount)

<FixedSizeGrid
  columnCount={columnCount}
  columnWidth={cardW + gap}
  height={vh}
  rowCount={rowCount}
  rowHeight={cardH + gap}
  width={vw}
  overscanColumnCount={3}
  overscanRowCount={3}
  onScroll={({ scrollTop }) => {
    // Keep existing scroll memory logic
    const prev = deckScrollMemory.get(deckKey)
    deckScrollMemory.set(deckKey, {
      rowX: prev?.rowX ?? 0,
      colY: scrollTop,
      anchorId: prev?.anchorId,
      anchorFrac: prev?.anchorFrac
    })
    scheduleSelectedRectUpdate()
  }}
  onItemsRendered={() => {
    scheduleSelectedRectUpdate()
  }}
>
  {({ columnIndex, rowIndex, style }) => {
    const index = rowIndex * columnCount + columnIndex
    if (index >= cards.length) return null
    return (
      <div style={{ ...style, display: 'flex', justifyContent: 'center', alignItems: 'start' }}>
        <CardItem card={cards[index]} mode="column" />
      </div>
    )
  }}
</FixedSizeGrid>
```

### Anchor-Based Positioning Integration
The existing anchor-based scroll restoration logic can be adapted to use react-window's imperative API:

```tsx
const listRef = useRef()

// Restore scroll using anchor
const restoreUsingAnchor = useCallback((axis: Axis) => {
  const state = deckScrollMemory.get(deckKey)
  if (!state?.anchorId || listRef.current) return

  const anchorIndex = cards.findIndex(card => String(card.id) === state.anchorId)
  if (anchorIndex >= 0) {
    listRef.current.scrollToItem(anchorIndex, 'smart')
  }
}, [deckKey, cards])
```

### Performance Benefits
- **Row/Column/Grid modes**: O(viewport) instead of O(n) rendering
- **Maintains all existing features**: Scroll memory, anchors, selection
- **Minimal code changes**: Only replace `cards.map()` calls
- **Preserves aspect ratio logic**: Move to `itemSize` functions
- **Keeps event handling**: Card interactions unchanged

### Migration Steps
1. `pnpm add react-window`
2. Import components: `import { FixedSizeList, VariableSizeList, FixedSizeGrid } from 'react-window'`
3. Replace row mode `cards.map()` with `FixedSizeList`
4. Replace column mode `cards.map()` with `VariableSizeList`
5. Replace grid mode `cards.map()` with `FixedSizeGrid`
6. Adapt scroll handlers to use react-window callbacks
7. Update anchor restoration to use imperative API

This maintains all existing Deck functionality while providing massive performance improvements for large card collections.
