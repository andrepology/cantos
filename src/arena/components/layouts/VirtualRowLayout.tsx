import { memo, useCallback, useRef, useState, useEffect } from 'react'
import { Grid } from 'react-window'
import { stopEventPropagation } from 'tldraw'
import { CardView } from '../CardRenderer'
import { IntrinsicPreview } from './IntrinsicPreview'
import { getRowColumnCardStyle } from '../../styles/cardStyles'
import { getRowContainerStyle } from '../../styles/deckStyles'
import type { Card } from '../../types'

// Simplified scroll state - just pixel offset, no anchor complexity
type ScrollState = { scrollOffset: number }
const deckScrollMemory = new Map<string, ScrollState>()

function computeDeckKey(cards: { id: number }[]): string {
  if (!cards || cards.length === 0) return 'empty'
  // Keep the key short but stable: use length + first/last 10 ids
  const head = cards.slice(0, 10).map((c) => String(c.id))
  const tail = cards.slice(-10).map((c) => String(c.id))
  return `${cards.length}:${head.join('|')}::${tail.join('|')}`
}

export interface VirtualRowLayoutProps {
  cards: Card[]
  cardW: number
  cardH: number
  gap: number
  paddingRowTB: number
  paddingRowLR: number
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

const VirtualRowLayout = memo(function VirtualRowLayout({
  cards,
  cardW,
  cardH,
  gap,
  paddingRowTB,
  paddingRowLR,
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
}: VirtualRowLayoutProps) {
  const gridRef = useRef<any>(null)
  const [scrollOffset, setScrollOffset] = useState(() => {
    const state = deckScrollMemory.get(computeDeckKey(cards))
    return state?.scrollOffset || 0
  })

  // Set initial scroll position on the DOM element
  useEffect(() => {
    if (gridRef.current?.element && scrollOffset !== 0) {
      const element = gridRef.current.element
      element.scrollLeft = scrollOffset
    }
  }, []) // Only run on mount

  // Calculate total content width: cards + gaps between them
  const contentWidth = cards.length > 0 ? (cards.length * cardW) + ((cards.length - 1) * gap) : 0
  const shouldCenter = contentWidth <= containerWidth

  const isImageLike = useCallback((card: Card) => {
    if (card.type === 'image') return true
    if (card.type === 'link' && (card as any).imageUrl) return true
    if (card.type === 'media' && (card as any).thumbnailUrl && !(card as any).embedHtml) return true
    return false
  }, [])

  const handleScroll = useCallback((props: any) => {
    lastUserActivityAtRef.current = Date.now()
    setScrollOffset(props.scrollLeft)
    scheduleSelectedRectUpdate()

    // Only save scroll position when not centering
    if (!shouldCenter) {
      const key = computeDeckKey(cards)
      deckScrollMemory.set(key, { scrollOffset: props.scrollLeft })
    }
  }, [cards, lastUserActivityAtRef, scheduleSelectedRectUpdate, shouldCenter])

  const Cell = useCallback((props: any) => {
    const { columnIndex, style } = props
    const card = cards[columnIndex]
    if (!card) return <div style={style} />

    const imageLike = isImageLike(card)
    const baseStyle = getRowColumnCardStyle(imageLike, cardW, cardH, true) // Use square containers for row layout

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
          {imageLike ? (
            <IntrinsicPreview card={card} mode="square" />
          ) : (
            <CardView card={card} compact={cardW < 180} sizeHint={{ w: Math.min(cardW, cardH), h: Math.min(cardW, cardH) }} />
          )}
        </div>
      </div>
    )
  }, [cards, isImageLike, cardW, cardH, selectedCardId, hoveredId, onCardContextMenu, onCardPointerDown, onCardPointerMove, onCardPointerUp, onCardClick])

  // Calculate padding for centering
  const getContainerPadding = () => {
    if (!shouldCenter) return `${paddingRowTB}px ${paddingRowLR}px`
    // Center the content by adding left padding
    const centerPadding = Math.max(0, (containerWidth - contentWidth) / 2)
    return `${paddingRowTB}px ${centerPadding + paddingRowLR}px`
  }

  return (
    <Grid
      {...{
        gridRef,
        columnCount: cards.length,
        columnWidth: cardW + gap, // Include gap in column width for proper spacing
        height: containerHeight,
        rowCount: 1,
        rowHeight: cardH,
        width: containerWidth,
        overscanCount: 3,
        onScroll: handleScroll,
        cellComponent: Cell,
        cellProps: {},
        style: {
          padding: getContainerPadding(),
        },
      }}
      onWheelCapture={(e) => {
        lastUserActivityAtRef.current = Date.now()
        // Allow native scrolling but prevent the event from bubbling to the canvas.
        // If ctrlKey is pressed, we let the event bubble up to be handled for zooming.
        if (e.ctrlKey) return
        e.stopPropagation()
      }}
    />
  )
})

export { VirtualRowLayout }
