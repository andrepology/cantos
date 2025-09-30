# React Window v2 API Reference

## Overview
React Window v2 provides high-performance virtualized rendering for large lists and grids. This document covers the current v2 API for integrating windowing into Deck.tsx layouts.

## Core Components

### List
Renders a windowed list of items with fixed or variable dimensions.

```tsx
import { List } from 'react-window'

<List
  height={400}                    // Container height in pixels
  width={300}                     // Container width in pixels
  rowCount={1000}                 // Total number of items
  rowHeight={50}                  // Fixed height per row (or function for variable heights)
  overscanCount={5}               // Items to render outside visible area
  direction="ltr"                 // 'ltr' | 'rtl'
  initialScrollOffset={0}         // Initial scroll position
  onScroll={handleScroll}         // Scroll callback
  onRowsRendered={handleRendered} // Items rendered callback
  listRef={listRef}               // Imperative API ref
>
  {({ index, style }) => (
    <div style={style}>
      Item {index}
    </div>
  )}
</List>
```

**Key Props:**
- `rowCount`: Total number of items
- `rowHeight`: Fixed height (number) or function for variable heights
- `listRef`: For imperative scrolling
- `overscanCount`: Buffer items outside viewport

### Variable Height Lists
For dynamic item heights, pass a function to `rowHeight`:

```tsx
const getRowHeight = (index) => calculateItemHeight(items[index])

<List
  rowHeight={getRowHeight}
  // ... other props
/>
```

### Grid
Renders a windowed 2D grid of items.

```tsx
import { Grid } from 'react-window'

<Grid
  columnCount={10}                // Number of columns
  columnWidth={100}               // Width per column
  height={400}                    // Container height
  rowCount={50}                   // Number of rows
  rowHeight={50}                  // Height per row
  width={300}                     // Container width
  overscanCount={3}               // Cells to render outside viewport
  initialScrollLeft={0}           // Initial horizontal scroll
  initialScrollTop={0}            // Initial vertical scroll
  onScroll={handleScroll}         // Scroll callback
  onCellsRendered={handleRendered} // Cells rendered callback
  gridRef={gridRef}               // Imperative API ref
>
  {({ columnIndex, rowIndex, style }) => {
    const index = rowIndex * columnCount + columnIndex
    return (
      <div style={style}>
        Cell {index}
      </div>
    )
  }}
</Grid>
```

## Imperative API

### List Methods
```tsx
const listRef = useRef()

// Scroll to specific row
listRef.current.scrollToRow({
  index: 100,
  align: 'start' | 'center' | 'end' | 'smart',
  behavior: 'auto' | 'instant' | 'smooth'
})

// Access DOM element
const element = listRef.current.element
```

### Grid Methods
```tsx
const gridRef = useRef()

// Scroll to specific cell
gridRef.current.scrollToCell({
  columnIndex: 5,
  rowIndex: 10,
  columnAlign: 'smart',
  rowAlign: 'smart',
  behavior: 'smooth'
})

// Scroll to column/row
gridRef.current.scrollToColumn({ index: 5, align: 'center' })
gridRef.current.scrollToRow({ index: 10, align: 'center' })

// Access DOM element
const element = gridRef.current.element
```

## Integration Patterns

### Dynamic Heights
```tsx
const getRowHeight = useCallback((index) => {
  const item = items[index]
  return calculateDynamicHeight(item)
}, [items])

<List rowHeight={getRowHeight} />
```

### Scroll Position Preservation
```tsx
const [scrollOffset, setScrollOffset] = useState(0)

const handleScroll = ({ scrollOffset }) => {
  setScrollOffset(scrollOffset)
  // Save to your scroll memory system
}

<List
  initialScrollOffset={scrollOffset}
  onScroll={handleScroll}
/>
```

### Resize Handling
```tsx
const handleResize = (size, prevSize) => {
  // Handle container resize
  console.log('New size:', size)
}

<List onResize={handleResize} />
```

## Deck.tsx Integration

### Row Layout (Horizontal Scrolling)
```tsx
<List
  height={containerHeight}
  width={containerWidth}
  rowCount={cards.length}
  rowHeight={cardWidth + gap}  // Fixed width per card
  direction={direction}
  listRef={listRef}
>
  {({ index, style }) => (
    <div style={style}>
      <CardItem card={cards[index]} mode="row" />
    </div>
  )}
</List>
```

### Column Layout (Vertical Scrolling)
```tsx
const getRowHeight = (index) => {
  const card = cards[index]
  const { height } = getCardDimensions(card)
  return height + gap
}

<List
  height={containerHeight}
  width={containerWidth}
  rowCount={cards.length}
  rowHeight={getRowHeight}
  listRef={listRef}
>
  {({ index, style }) => (
    <div style={style}>
      <CardItem card={cards[index]} mode="column" />
    </div>
  )}
</List>
```

### Grid Layout (2D Scrolling)
```tsx
const columnCount = Math.floor(containerWidth / (cardWidth + gap))
const rowCount = Math.ceil(cards.length / columnCount)

<Grid
  columnCount={columnCount}
  columnWidth={cardWidth + gap}
  height={containerHeight}
  rowCount={rowCount}
  rowHeight={cardHeight + gap}
  width={containerWidth}
  gridRef={gridRef}
>
  {({ columnIndex, rowIndex, style }) => {
    const index = rowIndex * columnCount + columnIndex
    if (index >= cards.length) return <div style={style} />

    return (
      <div style={style}>
        <CardItem card={cards[index]} mode="grid" />
      </div>
    )
  }}
</Grid>
```

### Anchor-Based Scrolling
```tsx
// For List
const restoreAnchor = () => {
  const anchorIndex = cards.findIndex(card => card.id === anchorId)
  if (anchorIndex >= 0) {
    listRef.current.scrollToRow({ index: anchorIndex, align: 'smart' })
  }
}

// For Grid
const restoreAnchor = () => {
  const anchorIndex = cards.findIndex(card => card.id === anchorId)
  if (anchorIndex >= 0) {
    const rowIndex = Math.floor(anchorIndex / columnCount)
    const columnIndex = anchorIndex % columnCount
    gridRef.current.scrollToCell({
      columnIndex,
      rowIndex,
      columnAlign: 'smart',
      rowAlign: 'smart'
    })
  }
}
```

## Performance Benefits
- **Memory**: 90-95% reduction for large collections
- **Rendering**: Constant time viewport operations
- **Scrolling**: 60fps regardless of collection size
- **Scalability**: Handles 10k+ items smoothly

# Deck.tsx Windowing Implementation Plan

## Core Strategy: Selective Layout Virtualization

**Only virtualize RowLayout, ColumnLayout, and GridLayout.** StackLayout and MiniLayout remain as-is since they're already effectively virtualized (rendering only 7-8 cards max).

## Layout-Specific Implementation Plans

### RowLayout → `Grid` (Horizontal, Single Row)
```tsx
<Grid
  columnCount={cards.length}
  columnWidth={cardWidth + gap}
  rowCount={1}                    // Single row = horizontal scrolling
  rowHeight={containerHeight}     // Full container height
  height={containerHeight}
  width={containerWidth}
  overscanCount={3}
  gridRef={gridRef}
>
  {({ columnIndex, rowIndex, style }) => {
    const card = cards[columnIndex]
    return (
      <div style={style}>
        <CardItem card={card} mode="row" />
      </div>
    )
  }}
</Grid>
```
- **Fixed widths**: Cards maintain consistent width, perfect for `columnWidth` as number
- **Grid approach**: Per react-window docs, horizontal lists are grids with `rowCount={1}`

### ColumnLayout → `List` (Vertical)
```tsx
const getRowHeight = (index) => {
  const card = cards[index]
  // Calculate actual rendered height for this card
  return calculateCardHeight(card, cardWidth) + gap
}

<List
  height={containerHeight}
  width={containerWidth}
  rowCount={cards.length}
  rowHeight={getRowHeight}        // Variable: each card can have different height
  overscanCount={5}               // More buffer for variable heights
  listRef={listRef}
>
  {({ index, style }) => (
    <div style={style}>
      <CardItem card={cards[index]} mode="column" />
    </div>
  )}
</List>
```
- **Variable heights**: Must use function to measure each card's actual height
- **Performance cost**: Height calculation on every render, but acceptable with memoization

### GridLayout → `Grid` (2D)
```tsx
// Calculate grid dimensions dynamically
const columnCount = Math.floor(containerWidth / (cardWidth + gap))
const rowCount = Math.ceil(cards.length / columnCount)

<Grid
  columnCount={columnCount}
  columnWidth={cardWidth + gap}
  height={containerHeight}
  rowCount={rowCount}
  rowHeight={cardHeight + gap}    // Fixed height assumption
  width={containerWidth}
  overscanCount={2}               // Smaller buffer for 2D
  gridRef={gridRef}
>
  {({ columnIndex, rowIndex, style }) => {
    const index = rowIndex * columnCount + columnIndex
    if (index >= cards.length) return <div style={style} />

    return (
      <div style={style}>
        <CardItem card={cards[index]} mode="grid" />
      </div>
    )
  }}
</Grid>
```
- **Fixed dimensions**: Assumes uniform card sizes (current implementation)
- **Index mapping**: Convert 1D card array to 2D grid coordinates

## Critical Integration Challenges

### 1. Scroll Position Preservation
**Problem**: Current system saves `{anchorId, anchorFrac, rowX, colY}` but react-window uses pixel offsets.

**Solution**:
- On scroll, save `scrollOffset` to `deckScrollMemory`
- On mount, use `initialScrollOffset` to restore position
- **No anchor-based positioning** - sacrifice this complex feature for performance
- Accept that windowing means losing precise card-based scroll restoration

### 2. Dynamic Card Heights (ColumnLayout)
**Problem**: Variable heights require measuring each card, expensive for large collections.

**Solutions** (in priority order):
1. **Cache heights**: Pre-calculate and cache card heights during initial load
2. **Estimate heights**: Use average height * item count for initial layout
3. **Progressive measurement**: Only measure visible + buffer cards
4. **Fallback to fixed**: If too expensive, force fixed heights

### 3. Event Handling Integration
**Problem**: react-window's scroll container ≠ current container ref system.

**Solution**:
```tsx
<List
  listRef={(ref) => {
    // Store react-window's scroll element
    scrollRef.current = ref?.element
  }}
  onScroll={(props) => {
    // Forward to existing scroll handlers
    existingOnScroll(props)
  }}
/>
```

### 4. Card Sizing & Layout Preservation
- **Maintain existing**: `useCardSizing`, `getCardSizeWithinSquare` unchanged
- **Pass through**: All existing props (hoveredId, selectedCardId, event handlers)
- **Style injection**: Apply existing card styles to react-window's `style` prop

## Performance Optimizations

### Overscan Strategy
- **RowLayout**: `overscanCount={3}` (minimal buffer)
- **ColumnLayout**: `overscanCount={5}` (more buffer for variable heights)
- **GridLayout**: `overscanCount={2}` (2D needs less)

### Memory Management
- **Clear caches**: Reset height caches when `cards` array changes
- **Debounce measurements**: Don't measure during rapid scroll
- **Pool measurements**: Reuse measurement results across layouts

## Migration Steps

1. **Add react-window dependency**
2. **Create VirtualRowLayout**: Replace RowLayout's `cards.map()` with `Grid` (rowCount={1})
3. **Create VirtualColumnLayout**: Handle variable heights with cached measurements
4. **Create VirtualGridLayout**: Map 1D cards to 2D grid
5. **Update Deck.tsx**: Conditionally use virtual layouts
6. **Remove anchor-based scrolling**: Accept this limitation for performance

## Expected Performance Gains

- **Memory**: 90-95% reduction (from 1000 cards → ~10-15 rendered)
- **Rendering**: Constant-time viewport operations
- **Frame rate**: 60fps maintained even with 10k+ cards
- **Scalability**: Handle unlimited card counts

## Trade-offs Accepted

1. **No precise anchor scrolling**: Cards may not restore to exact previous positions
2. **Height calculation overhead**: Variable height layouts need measurement
3. **Layout complexity**: Three separate virtualized components instead of one
