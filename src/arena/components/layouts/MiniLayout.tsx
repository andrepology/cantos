import { memo } from 'react'
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
            const position = positions[i]
            if (!position) return null
            const card = stackCards[i]
            const { w: sizedW, h: sizedH } = getCardSizeWithinSquare(card)
            const isMediaLike = card.type === 'image' || card.type === 'media'
            const cardStyleStatic = getCardBaseStyle(isMediaLike, 'mini')
            const transform = `translate(-50%, -50%) translate3d(${position.x}px, ${position.y}px, 0) rotate(${position.rot}deg) scale(${position.scale})`

            return (
              <div
                data-interactive="card"
                data-card-id={String(card.id)}
                data-card-type={(card as any)?.type === 'channel' ? 'channel' : undefined}
                data-channel-slug={(card as any)?.type === 'channel' ? String((card as any)?.slug ?? '') : undefined}
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
                  opacity: position.opacity,
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
