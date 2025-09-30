import { memo } from 'react'
import { AnimatedDiv, interpolateTransform } from '../../Scrubber'
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
  springs: any[]
  getCardSizeWithinSquare: (card: Card) => { w: number; h: number }
  hoveredId: number | null
  selectedCardId?: number
  onCardClick: (e: React.PointerEvent | React.MouseEvent, card: Card, el: HTMLElement) => void
  onCardPointerDown: (e: React.PointerEvent, card: Card) => void
  onCardPointerMove: (e: React.PointerEvent, card: Card) => void
  onCardPointerUp: (e: React.PointerEvent, card: Card) => void
  onCardContextMenu: (e: React.MouseEvent<HTMLDivElement>, card: Card) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

const StackLayout = memo(function StackLayout({
  cards,
  currentIndex,
  stageSide,
  stackStageOffset,
  stackKeys,
  springs,
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
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div style={{
        position: 'relative',
        width: stageSide,
        height: stageSide,
        marginTop: stackStageOffset,
      }}>
        {stackKeys.map((key, i) => {
        const spring = springs[i]
        if (!spring) return null
        const z = 1000 - i
        const card = stackCards[i]
        const { w: sizedW, h: sizedH } = getCardSizeWithinSquare(card)
        const isMediaLike = card.type === 'image' || card.type === 'media'
        const cardStyleStatic = getCardBaseStyle(isMediaLike, 'stack')

        return (
          <AnimatedDiv
            data-interactive="card"
            data-card-id={String(card.id)}
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
              transform: interpolateTransform((spring as any).x, (spring as any).y, (spring as any).rot, (spring as any).scale),
              opacity: (spring as any).opacity,
              zIndex: z,
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
              <CardView card={card} compact={sizedW < 180} sizeHint={{ w: sizedW, h: sizedH }} />
            </div>
          </AnimatedDiv>
        )
      })}
      </div>
    </div>
  )
})

export { StackLayout }
