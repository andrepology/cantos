import { memo, useMemo } from 'react'
import { CardView } from '../CardRenderer'
import { getCardBaseStyle } from '../../styles/cardStyles'
import { getMiniContainerStyle, getMiniInnerContainerStyle, getMini3DContainerStyle, getMiniTitleStyle } from '../../styles/deckStyles'
import { computePackedFont } from '../../typography'
import type { Card } from '../../types'

// Seeded random number generator
function seededRandom(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i)
    hash = hash & hash
  }
  
  return function() {
    hash = (hash * 9301 + 49297) % 233280
    return hash / 233280
  }
}

// Generate a rich, organic scribbly closed shape (deterministic by seed)
function generateScribblePath(seed: string): string {
  const rand = seededRandom(seed || 'default')

  // More points allow richer modulation; still lightweight
  const numPoints = 24 + Math.floor(rand() * 12) // 24–35

  const centerX = 50
  const centerY = 50

  // Multi-frequency radial modulation parameters (deterministic)
  const baseRadius = 20 + rand() * 12
  const k1 = 2 + Math.floor(rand() * 3) // 2–4 lobes
  const k2 = 5 + Math.floor(rand() * 4) // 5–8 lobes
  const k3 = 9 + Math.floor(rand() * 4) // 9–12 micro undulations

  const a1 = 6 + rand() * 6
  const a2 = 3 + rand() * 5
  const a3 = 1 + rand() * 2.5

  const p1 = rand() * Math.PI * 2
  const p2 = rand() * Math.PI * 2
  const p3 = rand() * Math.PI * 2

  // Small deterministic random-walk jitter for organic wobble
  let jitterR = 0
  let jitterA = 0
  const jitterStepR = 0.6 + rand() * 0.6
  const jitterStepA = 0.05 + rand() * 0.05
  const jitterDamping = 0.85 + rand() * 0.1

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

  // Catmull–Rom -> cubic Bezier for a smooth closed curve
  // tension ~ 0.5 keeps it lively but controlled
  const tension = 0.5
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
function generateScribbleDisplacement(seed: string): { x: number; y: number } {
  const rand = seededRandom(seed || 'default')
  // Generate semi-random displacement within reasonable bounds
  return {
    x: (rand()) * 20, // ±10px displacement
    y: (rand()) * 20
  }
}

export interface MiniLayoutProps {
  cards: Card[]
  currentIndex: number
  channelTitle?: string
  miniDesignSide: number
  miniScale: number
  stackKeys: readonly any[]
  positions: Array<{
    x: number
    y: number
    rot: number
    scale: number
    opacity: number
    zIndex: number
  }>
  getCardSizeWithinSquare: (card: Card) => { w: number; h: number }
  hoveredId: number | null
  selectedCardId?: number
  onCardClick: (e: React.PointerEvent | React.MouseEvent, card: Card, el: HTMLElement) => void
  onCardPointerDown?: (e: React.PointerEvent, card: Card) => void
  onCardPointerMove?: (e: React.PointerEvent, card: Card) => void
  onCardPointerUp?: (e: React.PointerEvent, card: Card) => void
  onCardContextMenu: (e: React.MouseEvent<HTMLDivElement>, card: Card) => void
  blurIntensity?: number
  blurEnabled?: boolean
}

const MiniLayout = memo(function MiniLayout({
  cards,
  currentIndex,
  channelTitle,
  miniDesignSide,
  miniScale,
  stackKeys,
  positions,
  getCardSizeWithinSquare,
  hoveredId,
  selectedCardId,
  onCardClick,
  onCardPointerDown,
  onCardPointerMove,
  onCardPointerUp,
  onCardContextMenu,
  blurIntensity = 4,
  blurEnabled = true,
}: MiniLayoutProps) {
  const stackBaseIndex = currentIndex
  const stackCards = cards.slice(stackBaseIndex, Math.min(cards.length, stackBaseIndex + 7)) // stackDepth + 1

  // Compute packed font for title using same technique as typography.ts
  // Note: Channel titles are typically short, so this will likely return null and fall back to manual sizing
  const titleWidth = 140 * miniScale // Fixed width for top-right placement
  const titleHeight = 24 * miniScale // Smaller height for compact top-right placement
  const titlePackedFont = channelTitle ? computePackedFont({
    text: channelTitle,
    width: titleWidth - 16, // Account for horizontal padding (8px on each side)
    height: titleHeight,
    minFontSize: 8,
    maxFontSize: Math.max(12, Math.round(14 * miniScale)),
    // lineHeight now dynamically adjusts based on font size (typographic best practice)
  }) : null

  // Generate deterministic scribble path and displacement based on channel title
  const scribblePath = useMemo(() =>
    generateScribblePath(channelTitle || 'default'),
    [channelTitle]
  )

  const scribbleDisplacement = useMemo(() =>
    generateScribbleDisplacement(channelTitle || 'default'),
    [channelTitle]
  )

  return (
    <div style={{
      ...getMiniContainerStyle(miniDesignSide, miniScale),
      position: 'relative',
    }}>
      {channelTitle ? (
        <div style={{
          ...getMiniTitleStyle(miniScale),
          fontSize: titlePackedFont?.fontSizePx || Math.max(10, Math.round(14 * miniScale)),
          lineHeight: titlePackedFont?.lineHeight || 1.2,
          hyphens: 'auto',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
        }}>
          {channelTitle}
        </div>
      ) : null}

      {/* Blur overlay - cached for performance */}
      {blurEnabled && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backdropFilter: `blur(${blurIntensity}px) saturate(16.8)`,
            WebkitBackdropFilter: `blur(${blurIntensity}px) saturate(5.8)`,
            backgroundColor: 'rgba(255,255,255,0.85)',
            pointerEvents: 'none',
            scale: 4.0,
            zIndex: 1,
            opacity: 1,

          }}
        />
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
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
      >
        <path
          d={scribblePath}
          stroke="rgba(0,0,0,.15)"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div style={getMiniInnerContainerStyle(miniDesignSide, miniScale)}>
        <div style={getMini3DContainerStyle()}>
          {stackKeys.map((key, i) => {
            const position = positions[i]
            if (!position) return null
            const card = stackCards[i]
            const { w: sizedW, h: sizedH } = getCardSizeWithinSquare(card)
            const isMediaLike = card.type === 'image' || card.type === 'media'
            const cardStyleStatic = getCardBaseStyle(isMediaLike, 'mini')
            const transform = `translate(-50%, -50%) translate3d(${position.x}px, ${position.y}px, 0) rotate(${position.rot}deg) scale(${position.scale})`

            return (
              <div
                // data-interactive="card"
                data-card-id={String(card.id)}
                data-card-type={(card as any)?.type === 'channel' ? 'channel' : undefined}
                data-card-title={String((card as any)?.title ?? '')}
                data-channel-slug={(card as any)?.type === 'channel' ? String((card as any)?.slug ?? '') : undefined}
                data-channel-author={(card as any)?.type === 'channel' ? String((card as any)?.user?.full_name || (card as any)?.user?.username || '') : undefined}
                data-channel-updated-at={(card as any)?.type === 'channel' ? String((card as any)?.updatedAt ?? '') : undefined}
                data-channel-block-count={(card as any)?.type === 'channel' ? String((card as any)?.length ?? 0) : undefined}
                key={key}
                style={{
                  ...cardStyleStatic,
                  width: sizedW,
                  height: sizedH,
                  outline:
                    selectedCardId === (card as any).id
                      ? '2px solid rgba(0,0,0,.6)'
                      : hoveredId === (card as any).id
                      ? '2px solid rgba(0,0,0,.25)'
                      : 'none',
                  outlineOffset: 0,
                  transform,
                  opacity: 1,
                  scale: 1.4,
                  zIndex: position.zIndex,
                }}
                onMouseEnter={() => {}} // handled by parent
                onMouseLeave={() => {}} // handled by parent
                onContextMenu={(e) => onCardContextMenu(e as React.MouseEvent<HTMLDivElement>, card)}
                onClick={(e) => onCardClick(e, card, e.currentTarget as HTMLElement)}
                {...(onCardPointerDown && { onPointerDown: (e: React.PointerEvent) => onCardPointerDown(e, card) })}
                {...(onCardPointerMove && { onPointerMove: (e: React.PointerEvent) => onCardPointerMove(e, card) })}
                {...(onCardPointerUp && { onPointerUp: (e: React.PointerEvent) => onCardPointerUp(e, card) })}
              >
                <div style={{ width: '100%', height: '100%', pointerEvents: onCardPointerDown ? 'auto' : 'none', display: 'flex', flexDirection: 'column' }}>
                  <CardView card={card} compact={(card as any)?.type === 'channel' ? sizedW < 100 : sizedW < 180} sizeHint={{ w: sizedW, h: sizedH }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
})

export { MiniLayout }
