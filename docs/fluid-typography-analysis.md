# Fluid Typography Implementation Plan

We are deprecating the binary font-size switches and JS-based font packing in favor of CSS Container Query-based fluid typography. This will provide smoother resizing and better performance on the zoomable canvas.

## 1. Helper Utility
Create a reusable utility to generate the CSS `clamp()` string. This ensures consistency across components.

```typescript
// src/arena/typography.ts

/**
 * Generates a CSS clamp() string for fluid typography based on container width (cqw).
 * 
 * Formula: Size = MinSize + (MaxSize - MinSize) * ((100cqw - MinWidth) / (MaxWidth - MinWidth))
 */
export function getFluidFontSize(
  minFontSize: number,
  maxFontSize: number,
  minContainerWidth: number = 200,
  maxContainerWidth: number = 800
): string {
  const slope = (maxFontSize - minFontSize) / (maxContainerWidth - minContainerWidth)
  const yAxisIntersection = -minContainerWidth * slope + minFontSize
  
  // slope is roughly "how much font per px of width"
  // We can use the CSS calc approach for exactness:
  
  return `clamp(
    ${minFontSize}px, 
    calc(${minFontSize}px + (${maxFontSize} - ${minFontSize}) * ((100cqw - ${minContainerWidth}px) / (${maxContainerWidth} - ${minContainerWidth}))), 
    ${maxFontSize}px
  )`
}
```

## 2. Component Updates

### A. `src/shapes/ArenaBlockShape.tsx`
*   **Container**: Add `containerType: 'size'` to the wrapper `div` surrounding the text.
*   **Font Size**: Replace `computePackedFont` and `textTypography` usage with the fluid helper.
    *   Target Range: 10px (at 200px width) -> 24px (at 800px width).
*   **Optimization**: Remove the `computePackedFont` `useMemo` calculation entirely. This removes a heavy render-blocking calculation.

### B. `src/shapes/components/BlockRenderer.tsx`
*   **Container**: Add `containerType: 'size'` to the card style.
*   **Font Size**: Remove the `shouldTypesetText` / `TEXT_BASE_FONT` / `TEXT_FOCUSED_FONT` binary logic.
    *   Use the same fluid range as the shape to ensure visual consistency between Canvas and Deck views.
*   **Transition**: Keep the color/padding transitions, but let the font-size handle itself via the layout engine.

## 3. Benefits
*   **Performance**: Removes JS-based text measuring and loop-based font fitting.
*   **UX**: Text grows linearly with the box. No more "too small" text in a "medium" box.
*   **Maintainability**: Typography rules are declarative CSS rather than imperative JS logic.
