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
  // slope is roughly "how much font per px of width"
  // We can use the CSS calc approach for exactness:
  
  return `clamp(
    ${minFontSize}px, 
    calc(${minFontSize}px + (${maxFontSize} - ${minFontSize}) * ((100cqw - ${minContainerWidth}px) / (${maxContainerWidth} - ${minContainerWidth}))), 
    ${maxFontSize}px
  )`
}

/**
 * Generates a CSS padding string that scales fluidly with container size (cqmin).
 * Uses asymmetric ratios for better text readability (more padding on right).
 * 
 * Base Padding Formula: Linear interpolation between min and max padding based on min dimension.
 * 
 * @param minPadding - Minimum base padding at smallest size (default: 8)
 * @param maxPadding - Maximum base padding at largest size (default: 24)
 * @param minContainerSize - Container dimension where min padding applies (default: 64)
 * @param maxContainerSize - Container dimension where max padding applies (default: 256)
 * @returns CSS padding string: "top right bottom left" (e.g., "calc(...) calc(...) ...")
 */
export function getFluidPadding(
  minPadding: number = 8,
  maxPadding: number = 24,
  minContainerSize: number = 64,
  maxContainerSize: number = 256
): string {
  // Linear interpolation: y = mx + c
  // m = (y2 - y1) / (x2 - x1)
  const slope = (maxPadding - minPadding) / (maxContainerSize - minContainerSize)
  const intercept = minPadding - slope * minContainerSize
  
  // Base expression: clamp(min, intercept + slope * 100cqmin, max)
  const baseExpr = `clamp(${minPadding}px, ${intercept.toFixed(2)}px + ${(slope * 100).toFixed(2)}cqmin, ${maxPadding}px)`
  
  // Asymmetric multipliers for text readability
  // Top: 0.8x (tighter header)
  // Right: 1.2x (ragged edge breathing room)
  // Bottom: 0.9x
  // Left: 1.0x (alignment edge)
  return `calc(0.8 * ${baseExpr}) calc(1.2 * ${baseExpr}) calc(0.9 * ${baseExpr}) ${baseExpr}`
}
