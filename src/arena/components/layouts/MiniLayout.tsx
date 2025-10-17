import { memo, useMemo } from 'react'
import { getMiniContainerStyle } from '../../styles/deckStyles'
import { computeResponsiveFont } from '../../typography'
import { TEXT_SECONDARY } from '../../constants'

// Seeded random number generator with better distribution
function seededRandom(seed: string) {
  // Use djb2 hash algorithm for better seed distribution
  let hash = 5381
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash) + seed.charCodeAt(i)  // hash * 33 + char
  }

  // Use better LCG constants for randomness
  const a = 1664525
  const c = 1013904223
  const m = Math.pow(2, 32)

  return function() {
    hash = (a * hash + c) % m
    return (hash % 1000000) / 1000000  // Return value between 0 and 1
  }
}

// Color utility functions
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const C = (1 - Math.abs(2 * l - 1)) * s
  const Hp = (h % 360) / 60
  const X = C * (1 - Math.abs((Hp % 2) - 1))
  let r1 = 0, g1 = 0, b1 = 0
  if (0 <= Hp && Hp < 1) { r1 = C; g1 = X; b1 = 0 }
  else if (1 <= Hp && Hp < 2) { r1 = X; g1 = C; b1 = 0 }
  else if (2 <= Hp && Hp < 3) { r1 = 0; g1 = C; b1 = X }
  else if (3 <= Hp && Hp < 4) { r1 = 0; g1 = X; b1 = C }
  else if (4 <= Hp && Hp < 5) { r1 = X; g1 = 0; b1 = C }
  else { r1 = C; g1 = 0; b1 = X }
  const m = l - C / 2
  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (x: number) => x.toString(16).padStart(2, '0')
  return `#${toHex(Math.round(Math.max(0, Math.min(255, r))))}${toHex(Math.round(Math.max(0, Math.min(255, g))))}${toHex(Math.round(Math.max(0, Math.min(255, b))))}`
}

// Generate a rich, organic scribbly closed shape (deterministic by seed)
function generateScribblePath(seed: string): string {
  const rand = seededRandom(seed || 'default')

  // More points allow richer modulation; increased for more scribbliness
  const numPoints = 32 + Math.floor(rand() * 20) // 32–51 points (more detail)

  const centerX = 50
  const centerY = 50

  // Multi-frequency radial modulation parameters (deterministic) - increased ranges
  const baseRadius = 18 + rand() * 16
  const k1 = 2 + Math.floor(rand() * 4) // 2–5 lobes (more variation)
  const k2 = 6 + Math.floor(rand() * 6) // 6–11 lobes (more detail)
  const k3 = 2 + Math.floor(rand() * 8) // 12–19 micro undulations (finer detail)

  const a1 = 8 + rand() * 9  // 8-16 (stronger main modulation)
  const a2 = 4 + rand() * 7  // 4-11 (stronger medium detail)
  const a3 = 2 + rand() * 4  // 2-6 (stronger micro undulations)

  const p1 = rand() * Math.PI * 2
  const p2 = rand() * Math.PI * 2
  const p3 = rand() * Math.PI * 2

  // Stronger deterministic random-walk jitter for more organic scribbly wobble
  let jitterR = 0
  let jitterA = 0
  const jitterStepR = 6.2 + rand() * 1.2  // 1.2-2.4 (doubled for more wobble)
  const jitterStepA = 0.4 + rand() * 0.   // 0.1-0.2 (doubled for more angular variation)
  const jitterDamping = 0.8 + rand() * 0.1 // 0.8-0.9 (slightly less damping for more persistence)

  const points: Array<{ x: number; y: number }> = []
  for (let i = 0; i < numPoints; i++) {
    const t = i / numPoints
    const angleBase = t * Math.PI * 2

    // Update jitters
    jitterR = jitterR * jitterDamping + (rand() - 0.5) * jitterStepR
    jitterA = jitterA * jitterDamping + (rand() - 0.5) * jitterStepA

    const angle = angleBase + jitterA
    const r =
      baseRadius +
      a1 * Math.sin(k1 * angle + p1) +
      a2 * Math.cos(k2 * angle + p2) +
      a3 * Math.sin(k3 * angle + p3) +
      jitterR

    const x = centerX + Math.cos(angle) * r
    const y = centerY + Math.sin(angle) * r
    points.push({ x, y })
  }

  // Catmull–Rom -> cubic Bezier for a scribbly closed curve
  // Lower tension creates more wobbly, less smooth curves
  const tension = 1  // 0.3-0.5 (more variation, generally lower)
  const n = points.length
  if (n < 3) {
    return n === 0
      ? ''
      : n === 1
      ? `M ${points[0].x} ${points[0].y} Z`
      : `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y} Z`
  }

  let path = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n]
    const p1 = points[i]
    const p2 = points[(i + 1) % n]
    const p3 = points[(i + 2) % n]

    const c1x = p1.x + (p2.x - p0.x) * (tension / 6)
    const c1y = p1.y + (p2.y - p0.y) * (tension / 6)
    const c2x = p2.x - (p3.x - p1.x) * (tension / 6)
    const c2y = p2.y - (p3.y - p1.y) * (tension / 6)

    path += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`
  }
  path += ' Z'
  return path
}

// Generate deterministic displacement based on channel title
function generateScribbleDisplacement(seed: string, containerWidth: number, containerHeight: number): { x: number; y: number } {
  const rand = seededRandom(seed || 'default')
  // Generate semi-random displacement within reasonable bounds, clamped to container
  const rawX = (rand() - 0.5) * 20 // ±20px displacement
  const rawY = (rand() - 0.5) * 20
  
  return {
    x: Math.max(0, Math.min(containerWidth, rawX)),
    y: Math.max(0, Math.min(containerHeight, rawY))
  }
}


export interface MiniLayoutProps {
  channelTitle?: string
  miniDesignSide: number
  miniScale: number
  cornerRadius?: number
  blurIntensity?: number
  scribbleStyle?: 'smooth'
}

const MiniLayout = memo(function MiniLayout({
  channelTitle,
  miniDesignSide,
  miniScale,
  cornerRadius = 0,
  blurIntensity = 4,
  scribbleStyle = 'smooth',
}: MiniLayoutProps) {

  // Compute responsive font for title (short titles use responsive sizing, not packed)
  const titleWidth = 120 * miniScale // Constraint width for wrapping
  const titleHeight = 30 * miniScale // Available height for wrapped lines
  const titleResponsiveFont = channelTitle ? computeResponsiveFont({
    width: titleWidth,
    height: titleHeight,
    minPx: 8,
    maxPx: Math.max(12, Math.round(16 * miniScale)),
    compact: true,
  }) : null

  // Generate harmonious triad colors based on channel title
  const triadColors = useMemo(() => {
    const seed = `${channelTitle || 'default'}-colors`
    const rand = seededRandom(seed)

    // Generate base hue with some randomness, but ensure good distribution
    const baseHue = rand() * 360

    // Add some variation to the triad spacing for more variety
    const triadOffset = 100 + rand() * 80  // 100-180 degrees

    // Create triad: three colors with varied spacing on color wheel
    const hues = [
      baseHue,
      (baseHue + triadOffset) % 360,
      (baseHue + triadOffset * 2) % 360
    ]

    // console.log('🎨 Raw hues for', channelTitle, ':', hues.map(h => Math.round(h)))

    // Ensure bright, saturated colors for visibility with more variety
    return hues.map((hue, index) => {
      // Add hue variation per color in the triad
      const hueVariation = (rand() - 0.5) * 60  // ±30 degrees variation
      const finalHue = (hue + hueVariation + 360) % 360

      const saturation = 0.6 + rand() * 0.4  // 60-100% saturation (good range)
      const lightness = 0.5 + rand() * 0.4   // 50-90% lightness (broader range)

      const [r, g, b] = hslToRgb(finalHue, saturation, lightness)
      const hex = rgbToHex(r, g, b)
      return hex
    })
  }, [channelTitle])

  // Generate deterministic scribble path segments and displacement based on channel title
  const scribbleSegments = useMemo(() => {
    if (scribbleStyle !== 'smooth') return null
    const rand = seededRandom(channelTitle || 'default')

    // Use same parameters as generateScribblePath for consistency
    const numPoints = 32 + Math.floor(rand() * 0)
    const centerX = 50
    const centerY = 50
    const baseRadius = 20 + rand() * 2
    const k1 = 2 + Math.floor(rand() * 4)
    const k2 = 6 + Math.floor(rand() * 6)
    const k3 = 12 + Math.floor(rand() * 8)
    const a1 = 8 + rand() * 8
    const a2 = 4 + rand() * 7
    const a3 = 2 + rand() * 4
    const p1 = rand() * Math.PI * 2
    const p2 = rand() * Math.PI * 2
    const p3 = rand() * Math.PI * 2

    let jitterR = 0
    let jitterA = 0
    const jitterStepR = 3.2 + rand() * 2.2
    const jitterStepA = 1.3 + rand() * 1.7
    const jitterDamping = 0.5 + rand() * 20.0

    const points: Array<{ x: number; y: number }> = []
    for (let i = 0; i < numPoints; i++) {
      const t = i / numPoints
      const angleBase = t * Math.PI * 2

      jitterR = jitterR * jitterDamping + (rand() - 0.5) * jitterStepR
      jitterA = jitterA * jitterDamping + (rand() - 0.5) * jitterStepA

      const angle = angleBase + jitterA
      const r = baseRadius + a1 * Math.sin(k1 * angle + p1) + a2 * Math.cos(k2 * angle + p2) + a3 * Math.sin(k3 * angle + p3) + jitterR

      const x = centerX + Math.cos(angle) * r
      const y = centerY + Math.sin(angle) * r
      points.push({ x, y })
    }

    // Convert to overlapping path segments with smooth color transitions and tapering
    const segments: Array<{ path: string; gradientId: string; strokeWidth: number; opacity: number }> = []
    const numSegments = 8 // Even more segments for ultra-smooth transitions

    for (let i = 0; i < numSegments; i++) {
      // Create overlapping segments for smoother blending
      const overlap = 0.15 // 15% overlap between segments
      const segmentSize = (1 + overlap) / numSegments
      const startIdx = Math.floor(Math.max(0, (i * segmentSize - overlap * 0.5) * points.length))
      const endIdx = Math.floor(Math.min(points.length - 1, ((i + 1) * segmentSize) * points.length))
      const segmentPoints = points.slice(startIdx, endIdx + 1)

      if (segmentPoints.length >= 2) {
        let path = `M ${segmentPoints[0].x} ${segmentPoints[0].y}`
        for (let j = 1; j < segmentPoints.length - 1; j++) {
          // Simple quadratic curves for smooth segments
          const prev = segmentPoints[j - 1]
          const curr = segmentPoints[j]
          const next = segmentPoints[j + 1]
          const cpX = (curr.x + next.x) / 2
          const cpY = (curr.y + next.y) / 2
          path += ` Q ${curr.x} ${curr.y} ${cpX} ${cpY}`
        }
        if (segmentPoints.length > 1) {
          const last = segmentPoints[segmentPoints.length - 1]
          path += ` L ${last.x} ${last.y}`
        }

        // Create gradient for this segment that blends between colors
        const gradientId = `segment-gradient-${i}-${channelTitle || 'default'}`.replace(/\s+/g, '-').toLowerCase()

        // Taper effect: stroke gets thicker in the middle, thinner at ends
        const taperProgress = i / (numSegments - 1) // 0 to 1
        const strokeWidth = 1.5 + Math.sin(taperProgress * Math.PI) * 2.5 // 1.5-4.0 range

        // Vary opacity for blending effect - middle segments more opaque
        const opacity = 0.3 + Math.sin(taperProgress * Math.PI) * 0.4 // 0.3-0.7 range

        segments.push({
          path,
          gradientId,
          strokeWidth,
          opacity
        })
      }
    }

    return segments
  }, [channelTitle, scribbleStyle, triadColors])

  const scribbleDisplacement = useMemo(() =>
    generateScribbleDisplacement(channelTitle || 'default', miniDesignSide * miniScale, miniDesignSide * miniScale),
    [channelTitle, miniDesignSide, miniScale]
  )

  return (
    <div style={{
      ...getMiniContainerStyle(miniDesignSide, miniScale),
      position: 'relative',
      borderRadius: `${cornerRadius}px`,
      overflow: 'hidden', // Ensure SVG shapes don't overflow the rounded corners
    }}>
      {channelTitle ? (
        <div style={{
          position: 'absolute',
          bottom: 9,
          left: 0.09 * miniDesignSide * miniScale,
          width: titleWidth, // Use computed width directly to enforce wrapping
          textAlign: 'left',
          pointerEvents: 'none',
          color: TEXT_SECONDARY,
          fontFamily: "'Alte Haas Grotesk', sans-serif",
          fontWeight: 700,
          letterSpacing: '-0.0125em',
          fontSize: titleResponsiveFont?.fontSizePx || Math.max(8, Math.round(14 * miniScale)),
          lineHeight: 1.155,
          hyphens: 'auto',
          wordBreak: 'break-word',
          whiteSpace: 'normal',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          zIndex: 9999,
        }}>
          {channelTitle}
        </div>
      ) : null}

      {/* Color rectangles overlay - harmonious triad colors */}
      {triadColors.length > 0 && (
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: 'none',
            zIndex: 1,
          }}
          width="100%"
          height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMinYMax meet"
        >
          <defs>
            <filter id="rectangleBlur" x="-50%" y="-50%" width="300%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation={blurIntensity * 0.4} />
            </filter>

            {/* Define gradients for each rectangle */}
            {triadColors.map((color, index) => {
              const uniqueId = `${channelTitle || 'default'}-${index}`.replace(/\s+/g, '-').toLowerCase()
              return (
                <linearGradient key={`gradient-${uniqueId}`} id={`gradient-${uniqueId}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={color} stopOpacity="0.0" />
                  <stop offset="100%" stopColor={color} stopOpacity="1.0" />
                </linearGradient>
              )
            })}
          </defs>

          Render collective blurred shape with overlapping rectangles
          <g filter="url(#rectangleBlur)">
            {triadColors.map((color, index) => {
              // Create spine-like formation: bottom-left, staggered upward
              const uniqueId = `${channelTitle || 'default'}-${index}`.replace(/\s+/g, '-').toLowerCase()

              // Vertical spine formation with horizontal staggering for overlap
              const baseX = 0 // Base horizontal position - left edge
              const baseY = 100 // Start from bottom
              const verticalStep = 16 // Smaller step creates vertical overlap

              const x = baseX // Same X position for all (vertical column)
              const y = baseY - (index * verticalStep) // Overlapping stack upward
              const width = 4 // Fixed width for spine-like appearance
              const height = 8 + (index * 5) // Increasing height as we go up

              return (
                <rect
                  key={index}
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill={`url(#gradient-${uniqueId})`}
                  style={{ mixBlendMode: index === 0 ? 'normal' : 'difference' }}
                />
              )
            })}
          </g>
        </svg>
      )}

      {/* Scribbly overlay */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 100,
          transform: `translate(${scribbleDisplacement.x}px, ${scribbleDisplacement.y}px)`,
        }}
        width="130%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMinYMax meet"
      >
        <defs>
          <filter id="scribbleBlur" x="-50%" y="-50%" width="300%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={blurIntensity * 0.0} />
          </filter>

          {/* Create gradients for each segment to blend between triad colors */}
          {scribbleSegments && scribbleSegments.map((segment, index) => {
            const colorIndex = Math.floor((index / scribbleSegments.length) * triadColors.length)
            const nextColorIndex = (colorIndex + 1) % triadColors.length
            return (
              <linearGradient
                key={segment.gradientId}
                id={segment.gradientId}
                x1="0%" y1="0%" x2="100%" y2="0%"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor={triadColors[colorIndex]} stopOpacity="0.6" />
                <stop offset="100%" stopColor={triadColors[nextColorIndex]} stopOpacity="0.6" />
              </linearGradient>
            )
          })}
        </defs>
        <g filter="url(#scribbleBlur)">
          {scribbleStyle === 'smooth' && scribbleSegments && scribbleSegments.map((segment, index) => (
            <path
              key={index}
              d={segment.path}
              stroke="none"
              strokeWidth={segment.strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={segment.opacity}
            />
          ))}
        </g>
      </svg>
    </div>
  )
})

export { MiniLayout }