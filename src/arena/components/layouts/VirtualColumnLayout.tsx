import { memo, useCallback, useRef, useState, useMemo, useLayoutEffect } from 'react'
import { List } from 'react-window'
import { stopEventPropagation } from 'tldraw'
import { CardView } from '../CardRenderer'
import { IntrinsicPreview } from './IntrinsicPreview'
import { getColumnContainerStyle } from '../../styles/deckStyles'
import { getColumnCardStyle } from '../../styles/cardStyles'
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

export interface VirtualColumnLayoutProps {
  cards: Card[]
  cardW: number
  cardH: number
  gap: number
  paddingColTB: number
  paddingColLR: number
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

const VirtualColumnLayout = memo(function VirtualColumnLayout({
  cards,
  cardW,
  cardH,
  gap,
  paddingColTB,
  paddingColLR,
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
}: VirtualColumnLayoutProps) {
  const listRef = useRef<any>(null)

  // Cache for card heights to avoid recalculation
  const [heightCache, setHeightCache] = useState<Map<number, number>>(new Map())

  const [scrollOffset, setScrollOffset] = useState(() => {
    const state = deckScrollMemory.get(computeDeckKey(cards))
    return state?.scrollOffset || 0
  })

  const columnW = Math.min(cardW, Math.max(0, cardW - paddingColLR * 2))

  const isImageLike = useCallback((card: Card) => {
    if (card.type === 'image') return true
    if (card.type === 'link' && (card as any).imageUrl) return true
    if (card.type === 'media' && (card as any).thumbnailUrl && !(card as any).embedHtml) return true
    return false
  }, [])

  // Estimate height for cards not yet measured
  const estimateCardHeight = useCallback((card: Card, index: number): number => {
    const cached = heightCache.get(card.id)
    if (cached !== undefined) return cached

    // For image-like cards, use aspect ratio estimation
    if (isImageLike(card)) {
      const aspectRatio = (card as any).aspectRatio || 1
      return Math.min(cardH * 2, columnW / aspectRatio) // Cap at 2x card height
    }

    // For text/link/media cards, use fixed height
    return cardH
  }, [heightCache, isImageLike, cardH, columnW])

  // Get row height function for react-window
  const getRowHeight = useCallback((index: number) => {
    const card = cards[index]
    return estimateCardHeight(card, index) + gap
  }, [cards, estimateCardHeight, gap])

  // Update height cache when cards change
  useLayoutEffect(() => {
    const newCache = new Map<number, number>()

    // Measure cards that aren't cached yet
    cards.forEach((card) => {
      if (!heightCache.has(card.id)) {
        // Simple estimation: image-like cards get variable height, others get fixed
        const height = isImageLike(card) ? Math.min(cardH * 1.5, cardH) : cardH
        newCache.set(card.id, height + gap)
      } else {
        newCache.set(card.id, heightCache.get(card.id)!)
      }
    })

    if (newCache.size !== heightCache.size) {
      setHeightCache(newCache)
    }
  }, [cards, heightCache, isImageLike, cardH, gap])

  const handleScroll = useCallback((props: any) => {
    lastUserActivityAtRef.current = Date.now()
    setScrollOffset(props.scrollOffset)
    scheduleSelectedRectUpdate()

    // Save scroll position
    const key = computeDeckKey(cards)
    deckScrollMemory.set(key, { scrollOffset: props.scrollOffset })
  }, [cards, lastUserActivityAtRef, scheduleSelectedRectUpdate])

  const Row = useCallback((props: any) => {
    const { index, style } = props
    const card = cards[index]
    if (!card) return <div style={style} />

    const imageLike = isImageLike(card)
    const baseStyle = getColumnCardStyle(imageLike, columnW, cardH)

    return (
      <div style={{
        ...style,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
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
          {imageLike ? <IntrinsicPreview card={card} mode="column" /> : <CardView card={card} compact={columnW < 180} sizeHint={{ w: columnW, h: cardH }} />}
        </div>
      </div>
    )
  }, [cards, isImageLike, columnW, cardH, selectedCardId, hoveredId, onCardContextMenu, onCardPointerDown, onCardPointerMove, onCardPointerUp, onCardClick])

  return (
    <List
      {...{
        listRef,
        height: containerHeight,
        width: containerWidth,
        rowCount: cards.length,
        rowHeight: (index) => getRowHeight(index) + gap,
        overscanCount: 5,
        initialScrollOffset: scrollOffset,
        onScroll: handleScroll,
        rowComponent: Row,
        rowProps: {},
        style: {
          padding: `${paddingColTB}px ${paddingColLR}px`,
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

export { VirtualColumnLayout }
