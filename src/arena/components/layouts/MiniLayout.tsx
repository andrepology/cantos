import { memo } from 'react'
import { AnimatedDiv, interpolateTransform } from '../../Scrubber'
import { CardView } from '../CardRenderer'
import { getCardBaseStyle } from '../../styles/cardStyles'
import { getMiniContainerStyle, getMiniInnerContainerStyle, getMini3DContainerStyle, getMiniTitleStyle } from '../../styles/deckStyles'
import type { Card } from '../../types'

export interface MiniLayoutProps {
  cards: Card[]
  currentIndex: number
  channelTitle?: string
  miniDesignSide: number
  miniScale: number
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
}

const MiniLayout = memo(function MiniLayout({
  cards,
  currentIndex,
  channelTitle,
  miniDesignSide,
  miniScale,
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
}: MiniLayoutProps) {
  const stackBaseIndex = currentIndex
  const stackCards = cards.slice(stackBaseIndex, Math.min(cards.length, stackBaseIndex + 7)) // stackDepth + 1

  return (
    <div style={getMiniContainerStyle(miniDesignSide, miniScale)}>
      {channelTitle ? (
        <div style={getMiniTitleStyle(miniScale)}>
          {channelTitle}
        </div>
      ) : null}
      <div style={getMiniInnerContainerStyle(miniDesignSide, miniScale)}>
        <div style={getMini3DContainerStyle()}>
          {stackKeys.map((key, i) => {
            const spring = springs[i]
            if (!spring) return null
            const z = 1000 - i
            const card = stackCards[i]
            const { w: sizedW, h: sizedH } = getCardSizeWithinSquare(card)
            const isMediaLike = card.type === 'image' || card.type === 'media'
            const cardStyleStatic = getCardBaseStyle(isMediaLike, 'mini')

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
    </div>
  )
})

export { MiniLayout }
