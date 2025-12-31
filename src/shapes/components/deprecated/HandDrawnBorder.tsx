import type React from 'react'

// Hand-drawn border component - commented out in original implementation
// This component was intended to provide a hand-drawn effect for shape borders
// but is currently not in use

/*
function HandDrawnBorder({
  w, h, cornerRadius,
  borderSize, borderThinning, borderSmoothing, borderStreamline,
  borderSimulatePressure, borderFill, borderFillColor, borderStrokeColor
}: {
  w: number
  h: number
  cornerRadius: number
  borderSize: number
  borderThinning: number
  borderSmoothing: number
  borderStreamline: number
  borderSimulatePressure: boolean
  borderFill: boolean
  borderFillColor: string
  borderStrokeColor: string
}) {
  // Create a PathBuilder path for the rounded rectangle outline
  const path = new PathBuilder()
    .moveTo(cornerRadius, 0)
    .lineTo(w - cornerRadius, 0)
    .arcTo(cornerRadius, cornerRadius, false, true, 0, w, cornerRadius)
    .lineTo(w, h - cornerRadius)
    .arcTo(cornerRadius, cornerRadius, false, true, 0, w - cornerRadius, h)
    .lineTo(cornerRadius, h)
    .arcTo(cornerRadius, cornerRadius, false, true, 0, 0, h - cornerRadius)
    .lineTo(0, cornerRadius)
    .arcTo(cornerRadius, cornerRadius, false, true, 0, cornerRadius, 0)
    .close()

  // Extract points from geometry and apply hand-drawn effect
  const geometry = path.toGeometry()
  const borderPoints = geometry.getVertices({})

  // Convert Vec[] to the format expected by perfect-freehand (arrays of [x,y])
  const strokePoints = borderPoints.map(point => [point.x, point.y])

  // Apply perfect-freehand for authentic hand-drawn effect
  const strokeOutline = getStroke(strokePoints, {
    size: borderSize,
    thinning: borderThinning,
    smoothing: borderSmoothing,
    streamline: borderStreamline,
    simulatePressure: borderSimulatePressure,
    last: true
  })

  // Generate SVG path data from the stroke outline points
  const pathData = strokeOutline.length > 0
    ? `M ${strokeOutline.map(([x, y]) => `${x},${y}`).join(' L ')} Z`
    : ''

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 4, // Above face background (zIndex 3) but below content (zIndex 4)
        overflow: 'visible', // Prevent clipping of the border
      }}
    >
      <path
        d={pathData}
        fill={borderFill ? borderFillColor : 'none'}
        // stroke={borderStrokeColor}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
*/

export {} // Empty export to make this a module
