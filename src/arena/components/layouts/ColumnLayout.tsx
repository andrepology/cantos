import { memo, useLayoutEffect } from 'react'
import { stopEventPropagation } from 'tldraw'
import { CardView } from '../CardRenderer'
import { IntrinsicPreview } from './IntrinsicPreview'
import { getColumnContainerStyle } from '../../styles/deckStyles'
import { getColumnCardStyle } from '../../styles/cardStyles'
import type { Card } from '../../types'

// Ephemeral, in-memory scroll state. Avoids localStorage to play well with TLDraw.
type ScrollState = { rowX: number; colY: number; anchorId?: string; anchorFrac?: number; stackIndex?: number }
const deckScrollMemory = new Map<string, ScrollState>()

function computeDeckKey(cards: { id: number }[]): string {
  if (!cards || cards.length === 0) return 'empty'
  // Keep the key short but stable: use length + first/last 10 ids
  const head = cards.slice(0, 10).map((c) => String(c.id))
  const tail = cards.slice(-10).map((c) => String(c.id))
  return `${cards.length}:${head.join('|')}::${tail.join('|')}`
}

export interface ColumnLayoutProps {
  cards: Card[]
  cardW: number
  cardH: number
  gap: number
  paddingColTB: number
  paddingColLR: number
  hoveredId: number | null
  selectedCardId?: number
  colRef: React.RefObject<HTMLDivElement | null>
  lastUserActivityAtRef: React.RefObject<number>
  scheduleSaveAnchor: (container: HTMLDivElement, axis: 'row' | 'column') => void
  restoreUsingAnchor: (container: HTMLDivElement, axis: 'row' | 'column', fallbackScroll: number) => void
  scheduleSelectedRectUpdate: () => void
  onCardClick: (e: React.PointerEvent | React.MouseEvent, card: Card, el: HTMLElement) => void
  onCardPointerDown: (e: React.PointerEvent, card: Card) => void
  onCardPointerMove: (e: React.PointerEvent, card: Card) => void
  onCardPointerUp: (e: React.PointerEvent, card: Card) => void
  onCardContextMenu: (e: React.MouseEvent<HTMLDivElement>, card: Card) => void
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void
}

const ColumnLayout = memo(function ColumnLayout({
  cards,
  cardW,
  cardH,
  gap,
  paddingColTB,
  paddingColLR,
  hoveredId,
  selectedCardId,
  colRef,
  lastUserActivityAtRef,
  scheduleSaveAnchor,
  restoreUsingAnchor,
  scheduleSelectedRectUpdate,
  onCardClick,
  onCardPointerDown,
  onCardPointerMove,
  onCardPointerUp,
  onCardContextMenu,
}: ColumnLayoutProps) {
  const isImageLike = (card: Card) => {
    if (card.type === 'image') return true
    if (card.type === 'link' && (card as any).imageUrl) return true
    if (card.type === 'media' && (card as any).thumbnailUrl && !(card as any).embedHtml) return true
    return false
  }

  // Restore scroll position when component mounts, cards change, or restoration function changes
  useLayoutEffect(() => {
    if (colRef.current) {
      const state = deckScrollMemory.get(computeDeckKey(cards)) || { rowX: 0, colY: 0 }
      restoreUsingAnchor(colRef.current, 'column', state.colY || 0)
    }
  }, [cards, restoreUsingAnchor])

  return (
    <div
      ref={colRef}
      style={getColumnContainerStyle(gap, paddingColTB, paddingColLR)}
      onWheelCapture={(e) => {
        lastUserActivityAtRef.current = Date.now()
        // Allow native scrolling but prevent the event from bubbling to the canvas.
        // If ctrlKey is pressed, we let the event bubble up to be handled for zooming.
        if (e.ctrlKey) return
        e.stopPropagation()
      }}
      onScroll={(e) => {
        lastUserActivityAtRef.current = Date.now()
        const y = (e.currentTarget as HTMLDivElement).scrollTop
        // We'll need to handle the scroll state updates in the parent
        scheduleSaveAnchor(e.currentTarget as HTMLDivElement, 'column')
        scheduleSelectedRectUpdate()
      }}
    >
      {cards.map((card) => {
        const columnW = Math.min(cardW, Math.max(0, cardW - paddingColLR * 2)) // This needs to be calculated properly
        const imageLike = isImageLike(card)
        const baseStyle = getColumnCardStyle(imageLike, columnW, cardH)

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
            {imageLike ? <IntrinsicPreview card={card} mode="column" /> : <CardView card={card} compact={columnW < 180} sizeHint={{ w: columnW, h: cardH }} />}
          </div>
        )
      })}
    </div>
  )
})

export { ColumnLayout }
