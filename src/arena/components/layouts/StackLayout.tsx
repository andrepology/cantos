import { memo } from 'react'
import { CardView } from '../CardRenderer'
import { getCardBaseStyle } from '../../styles/cardStyles'
import { getStackContainerStyle } from '../../styles/deckStyles'
import type { Card } from '../../types'

export interface StackLayoutProps {
  cards: Card[]
  currentIndex: number
  stageSide: number
  stackStageOffset: number
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
  onCardPointerDown: (e: React.PointerEvent, card: Card) => void
  onCardPointerMove: (e: React.PointerEvent, card: Card) => void
  onCardPointerUp: (e: React.PointerEvent, card: Card) => void
  onCardContextMenu: (e: React.MouseEvent<HTMLDivElement>, card: Card) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

const StackLayout = memo(function StackLayout({
  cards,
  currentIndex,
  stageSide,
  stackStageOffset,
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
  onMouseEnter,
  onMouseLeave,
}: StackLayoutProps) {
  const stackBaseIndex = currentIndex
  const stackCards = cards.slice(stackBaseIndex, Math.min(cards.length, stackBaseIndex + 7)) // stackDepth + 1

  return (
    <div
      style={getStackContainerStyle(stageSide, stackStageOffset)}
      {...(onMouseEnter && { onMouseEnter })}
      {...(onMouseLeave && { onMouseLeave })}
    >
      <div style={{
        position: 'relative',
        width: stageSide,
        height: stageSide,
        marginTop: stackStageOffset,
      }}>
        {stackKeys.map((key, i) => {
        const position = positions[i]
        if (!position) return null
        const card = stackCards[i]
        const { w: sizedW, h: sizedH } = getCardSizeWithinSquare(card)
        const isMediaLike = card.type === 'image' || card.type === 'media'
        const isPDF = card.type === 'pdf'
        const isTopmost = i === 0
        const cardStyleStatic = getCardBaseStyle(isMediaLike, 'stack')

        // Remove shadow from non-topmost cards in the stack
        const cardStyle = isTopmost ? cardStyleStatic : {
          ...cardStyleStatic,
          boxShadow: 'none'
        }

        const transform = `translate(-50%, -50%) translate3d(${position.x}px, ${position.y}px, 0) rotate(${position.rot}deg) scale(${position.scale})`

        // For PDFs, use document aspect ratio and don't constrain to square container
        const pdfAdjustedSize = isPDF ? {
          w: Math.min(sizedW, stageSide * 0.8), // Slightly smaller to fit better
          h: Math.min(sizedH, stageSide * 1.2)  // Allow taller than square
        } : { w: sizedW, h: sizedH }

        return (
          <div
            data-interactive="card"
            data-card-id={String(card.id)}
            data-card-type={String((card as any)?.type)}
            data-card-title={String((card as any)?.title ?? '')}
            data-channel-slug={(card as any)?.type === 'channel' ? String((card as any)?.slug ?? '') : undefined}
            data-image-url={(card as any)?.type === 'image' ? String((card as any)?.url ?? '') : (card as any)?.type === 'link' ? String((card as any)?.imageUrl ?? '') : undefined}
            data-url={(card as any)?.type === 'image' ? String((card as any)?.url ?? '') : (card as any)?.type === 'link' ? String((card as any)?.url ?? '') : undefined}
            data-content={(card as any)?.type === 'text' ? String((card as any)?.content ?? '') : undefined}
            data-embed-html={(card as any)?.type === 'media' ? String((card as any)?.embedHtml ?? '') : undefined}
            data-thumbnail-url={(card as any)?.type === 'media' ? String((card as any)?.thumbnailUrl ?? '') : undefined}
            data-original-url={(card as any)?.type === 'media' ? String((card as any)?.originalUrl ?? '') : undefined}
            key={key}
            style={{
              ...cardStyle,
              width: isPDF ? pdfAdjustedSize.w : sizedW,
              height: isPDF ? pdfAdjustedSize.h : sizedH,
              outline:
                selectedCardId === (card as any).id
                  ? '2px solid rgba(0,0,0,.1)'
                  : hoveredId === (card as any).id
                  ? '2px solid rgba(0,0,0,.05)'
                  : 'none',
              outlineOffset: 0,
              transform,
              opacity: position.opacity,
              zIndex: position.zIndex,
            }}
            onMouseEnter={() => {}} // handled by parent
            onMouseLeave={() => {}} // handled by parent
            onContextMenu={(e) => onCardContextMenu(e as React.MouseEvent<HTMLDivElement>, card)}
            onClick={(e) => onCardClick(e, card, e.currentTarget as HTMLElement)}
            onPointerDown={(e) => onCardPointerDown(e, card)}
            onPointerMove={(e) => onCardPointerMove(e, card)}
            onPointerUp={(e) => onCardPointerUp(e, card)}
          >
            <div style={{ width: '100%', height: '100%', pointerEvents: 'auto', display: 'flex', flexDirection: 'column' }}>
              <CardView
                card={card}
                compact={(isPDF ? pdfAdjustedSize.w : sizedW) < 180}
                sizeHint={{
                  w: isPDF ? pdfAdjustedSize.w : sizedW,
                  h: isPDF ? pdfAdjustedSize.h : sizedH
                }}
              />
            </div>
          </div>
        )
      })}
      </div>
    </div>
  )
})

export { StackLayout }
