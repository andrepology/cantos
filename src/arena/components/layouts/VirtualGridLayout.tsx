import { memo, useCallback, useRef, useState, useMemo } from 'react'
import { Grid } from 'react-window'
import { stopEventPropagation } from 'tldraw'
import { CardView } from '../CardRenderer'
import { IntrinsicPreview } from './IntrinsicPreview'
import { getGridContainerStyle } from '../../styles/deckStyles'
import { getGridCardStyle } from '../../styles/cardStyles'
import type { Card } from '../../types'

// Simplified scroll state - just pixel offsets, no anchor complexity
type ScrollState = { scrollLeft: number; scrollTop: number }
const deckScrollMemory = new Map<string, ScrollState>()

function computeDeckKey(cards: { id: number }[]): string {
  if (!cards || cards.length === 0) return 'empty'
  // Keep the key short but stable: use length + first/last 10 ids
  const head = cards.slice(0, 10).map((c) => String(c.id))
  const tail = cards.slice(-10).map((c) => String(c.id))
  return `${cards.length}:${head.join('|')}::${tail.join('|')}`
}

export interface VirtualGridLayoutProps {
  cards: Card[]
  cardW: number
  cardH: number
  gap: number
  paddingColTB: number
  hoveredId: number | null
  selectedCardId?: number
  lastUserActivityAtRef: React.RefObject<number>
  scheduleSelectedRectUpdate: () => void
  onCardClick: (e: React.PointerEvent | React.MouseEvent, card: Card, el: HTMLElement) => void
  onCardPointerDown: (e: React.PointerEvent, card: Card) => void
  onCardPointerMove: (e: React.PointerEvent, card: Card) => void
  onCardPointerUp: (e: React.PointerEvent, card: Card) => void
  onCardContextMenu: (e: React.MouseEvent<HTMLDivElement>, card: Card) => void
  containerHeight: number
  containerWidth: number
}

const VirtualGridLayout = memo(function VirtualGridLayout({
  cards,
  cardW,
  cardH,
  gap,
  paddingColTB,
  hoveredId,
  selectedCardId,
  lastUserActivityAtRef,
  scheduleSelectedRectUpdate,
  onCardClick,
  onCardPointerDown,
  onCardPointerMove,
  onCardPointerUp,
  onCardContextMenu,
  containerHeight,
  containerWidth,
}: VirtualGridLayoutProps) {
  const gridRef = useRef<any>(null)

  // Calculate grid dimensions dynamically - match original GridLayout behavior
  const { columnCount, rowCount } = useMemo(() => {
    const availableWidth = containerWidth
    const columnCount = Math.max(1, Math.floor(availableWidth / (cardW + gap)))
    const rowCount = Math.ceil(cards.length / columnCount)
    return { columnCount, rowCount }
  }, [cards.length, cardW, gap, containerWidth])

  const [scrollState, setScrollState] = useState(() => {
    const state = deckScrollMemory.get(computeDeckKey(cards))
    return state || { scrollLeft: 0, scrollTop: 0 }
  })

  const isImageLike = useCallback((card: Card) => {
    if (card.type === 'image') return true
    if (card.type === 'link' && (card as any).imageUrl) return true
    if (card.type === 'media' && (card as any).thumbnailUrl && !(card as any).embedHtml) return true
    return false
  }, [])

  const handleScroll = useCallback((props: any) => {
    lastUserActivityAtRef.current = Date.now()
    setScrollState({ scrollLeft: props.scrollLeft, scrollTop: props.scrollTop })
    scheduleSelectedRectUpdate()

    // Save scroll position
    const key = computeDeckKey(cards)
    deckScrollMemory.set(key, { scrollLeft: props.scrollLeft, scrollTop: props.scrollTop })
  }, [cards, lastUserActivityAtRef, scheduleSelectedRectUpdate])

  const Cell = useCallback((props: any) => {
    const { columnIndex, rowIndex, style } = props
    const index = rowIndex * columnCount + columnIndex
    if (index >= cards.length) return <div style={style} />

    const card = cards[index]
    const imageLike = isImageLike(card)
    const baseStyle = getGridCardStyle(imageLike, cardW, cardH)

    return (
      <div style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div
          data-interactive="card"
          data-card-id={String(card.id)}
          style={{
            ...baseStyle,
            outline:
              selectedCardId === card.id
                ? '2px solid rgba(0,0,0,.6)'
                : hoveredId === card.id
                ? '2px solid rgba(0,0,0,.25)'
                : 'none',
            outlineOffset: 0,
          }}
          onMouseEnter={() => {}} // handled by parent
          onMouseLeave={() => {}} // handled by parent
          onContextMenu={(e) => onCardContextMenu(e, card)}
          onPointerDown={(e) => {
            onCardPointerDown(e, card)
          }}
          onPointerMove={(e) => {
            onCardPointerMove(e, card)
          }}
          onPointerUp={(e) => {
            onCardPointerUp(e, card)
          }}
          onClick={(e) => {
            onCardClick(e, card, e.currentTarget as HTMLElement)
          }}
        >
          {imageLike ? <IntrinsicPreview card={card} mode="column" /> : <CardView card={card} compact={cardW < 180} sizeHint={{ w: cardW, h: cardH }} />}
        </div>
      </div>
    )
  }, [cards, columnCount, isImageLike, cardW, cardH, selectedCardId, hoveredId, onCardContextMenu, onCardPointerDown, onCardPointerMove, onCardPointerUp, onCardClick])

  const gridWidth = columnCount * (cardW + gap)
  const needsCentering = gridWidth < containerWidth

  return (
    <Grid
      {...{
        gridRef,
        columnCount,
        columnWidth: cardW + gap,
        height: containerHeight,
        rowCount,
        rowHeight: cardH + gap,
        width: containerWidth,
        overscanCount: 2,
        initialScrollLeft: scrollState.scrollLeft,
        initialScrollTop: scrollState.scrollTop,
        onScroll: handleScroll,
        cellComponent: Cell,
        cellProps: {},
        style: {
          padding: `${paddingColTB}px 0`,
          // Center the grid content when it doesn't fill the width
          transform: needsCentering ? `translateX(${(containerWidth - gridWidth) / 2}px)` : undefined,
        },
      }}
      onWheelCapture={(e) => {
        lastUserActivityAtRef.current = Date.now()
        if (e.ctrlKey) return
        e.stopPropagation()
      }}
    />
  )
})

export { VirtualGridLayout }
