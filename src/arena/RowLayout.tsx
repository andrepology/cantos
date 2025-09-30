import { memo } from 'react'
import { stopEventPropagation } from 'tldraw'
import { CardView } from './components/CardRenderer'
import { IntrinsicPreview } from './components/layouts/IntrinsicPreview'
import { getRowContainerStyle } from './styles/deckStyles'
import { getRowColumnCardStyle } from './styles/cardStyles'
import type { Card } from './types'

export interface RowLayoutProps {
  cards: Card[]
  cardW: number
  cardH: number
  gap: number
  paddingRowTB: number
  paddingRowLR: number
  hoveredId: number | null
  selectedCardId?: number
  rowRef: React.RefObject<HTMLDivElement | null>
  lastUserActivityAtRef: React.RefObject<number>
  scheduleSaveAnchor: (container: HTMLDivElement, axis: 'row' | 'column') => void
  scheduleSelectedRectUpdate: () => void
  onCardClick: (e: React.PointerEvent | React.MouseEvent, card: Card, el: HTMLElement) => void
  onCardPointerDown: (e: React.PointerEvent, card: Card) => void
  onCardPointerMove: (e: React.PointerEvent, card: Card) => void
  onCardPointerUp: (e: React.PointerEvent, card: Card) => void
  onCardContextMenu: (e: React.MouseEvent<HTMLDivElement>, card: Card) => void
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void
}

const RowLayout = memo(function RowLayout({
  cards,
  cardW,
  cardH,
  gap,
  paddingRowTB,
  paddingRowLR,
  hoveredId,
  selectedCardId,
  rowRef,
  lastUserActivityAtRef,
  scheduleSaveAnchor,
  scheduleSelectedRectUpdate,
  onCardClick,
  onCardPointerDown,
  onCardPointerMove,
  onCardPointerUp,
  onCardContextMenu,
}: RowLayoutProps) {
  const isImageLike = (card: Card) => {
    if (card.type === 'image') return true
    if (card.type === 'link' && (card as any).imageUrl) return true
    if (card.type === 'media' && (card as any).thumbnailUrl && !(card as any).embedHtml) return true
    return false
  }

  return (
    <div
      ref={rowRef}
      style={getRowContainerStyle(gap, paddingRowTB, paddingRowLR)}
      onWheelCapture={(e) => {
        lastUserActivityAtRef.current = Date.now()
        // Allow native scrolling but prevent the event from bubbling to the canvas.
        // If ctrlKey is pressed, we let the event bubble up to be handled for zooming.
        if (e.ctrlKey) return
        e.stopPropagation()
      }}
      onScroll={(e) => {
        lastUserActivityAtRef.current = Date.now()
        const x = (e.currentTarget as HTMLDivElement).scrollLeft
        // We'll need to handle the scroll state updates in the parent
        scheduleSaveAnchor(e.currentTarget as HTMLDivElement, 'row')
        scheduleSelectedRectUpdate()
      }}
    >
      {cards.map((card) => {
        const imageLike = isImageLike(card)
        const baseStyle = getRowColumnCardStyle(imageLike, cardW, cardH)

        return (
          <div
            key={card.id}
            data-interactive="card"
            data-card-id={String(card.id)}
            style={{
              ...baseStyle,
              outline:
                selectedCardId === (card as any).id
                  ? '2px solid rgba(0,0,0,.6)'
                  : hoveredId === (card as any).id
                  ? '2px solid rgba(0,0,0,.25)'
                  : 'none',
              outlineOffset: 0,
            }}
            onMouseEnter={() => {}} // handled by parent
            onMouseLeave={() => {}} // handled by parent
            onContextMenu={(e) => onCardContextMenu(e, card)}
            onPointerDown={(e) => {
              stopEventPropagation(e)
              onCardPointerDown(e, card)
            }}
            onPointerMove={(e) => {
              stopEventPropagation(e)
              onCardPointerMove(e, card)
            }}
            onPointerUp={(e) => {
              stopEventPropagation(e)
              onCardPointerUp(e, card)
            }}
            onClick={(e) => {
              stopEventPropagation(e)
              onCardClick(e, card, e.currentTarget as HTMLElement)
            }}
          >
            {imageLike ? <IntrinsicPreview card={card} mode="row" /> : <CardView card={card} compact={cardW < 180} sizeHint={{ w: cardW, h: cardH }} />}
          </div>
        )
      })}
    </div>
  )
})

export { RowLayout }
