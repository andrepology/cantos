import { memo, useCallback, useRef, useState, useEffect } from 'react'
import { Grid } from 'react-window'
import { stopEventPropagation } from 'tldraw'
import { CardView } from '../CardRenderer'
import { IntrinsicPreview } from './IntrinsicPreview'
import { getRowColumnCardStyle } from '../../styles/cardStyles'
import { getRowContainerStyle } from '../../styles/deckStyles'
import type { Card } from '../../types'
import { CARD_BORDER_RADIUS } from '../../constants'

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
  onEnsureAspects?: (visibleCards: Card[]) => void
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
  onEnsureAspects,
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
    if (card.type === 'media' && (card as any).thumbnailUrl) return true
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

    // Warm the aspect ratio cache for each rendered cell so later drags have ratios
    onEnsureAspects?.([card])

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
          data-card-type={String((card as any)?.type)}
          data-card-title={String((card as any)?.title ?? '')}
          data-channel-slug={(card as any)?.type === 'channel' ? String((card as any)?.slug ?? '') : undefined}
          data-image-url={(card as any)?.type === 'image' ? String((card as any)?.url ?? '') : (card as any)?.type === 'link' ? String((card as any)?.imageUrl ?? '') : undefined}
          data-url={(card as any)?.type === 'image' ? String((card as any)?.url ?? '') : (card as any)?.type === 'link' ? String((card as any)?.url ?? '') : undefined}
          data-content={(card as any)?.type === 'text' ? String((card as any)?.content ?? '') : undefined}
          data-embed-html={(card as any)?.type === 'media' ? String((card as any)?.embedHtml ?? '') : undefined}
          data-thumbnail-url={(card as any)?.type === 'media' ? String((card as any)?.thumbnailUrl ?? '') : undefined}
          data-original-url={(card as any)?.type === 'media' ? String((card as any)?.originalUrl ?? '') : undefined}
          style={{
            ...baseStyle,
            position: 'relative',
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
            <IntrinsicPreview card={card} mode="column" />
          ) : (
            <CardView card={card} compact={cardW < 180} sizeHint={{ w: Math.min(cardW, cardH), h: Math.min(cardW, cardH) }} />
          )}

          {/* Mix-blend-mode border effect for hover/selection */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              border: selectedCardId === card.id || hoveredId === card.id ? '4px solid rgba(0,0,0,.05)' : '0px solid rgba(0,0,0,.05)',
              borderRadius: CARD_BORDER_RADIUS,
              mixBlendMode: 'multiply',
              pointerEvents: 'none',
              zIndex: 10,
              opacity: selectedCardId === card.id || hoveredId === card.id ? 1 : 0,
              transition: 'opacity 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94), border-width 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }}
          />
        </div>
      </div>
    )
  }, [cards, isImageLike, cardW, cardH, selectedCardId, hoveredId, onCardContextMenu, onCardPointerDown, onCardPointerMove, onCardPointerUp, onCardClick, CARD_BORDER_RADIUS])


  // Unified layout: outer container applies only TB padding; inner flex centers horizontally when needed
  const innerWidth = containerWidth
  const availableHeight = Math.max(0, containerHeight - (paddingRowTB * 2))
  const gridWidth = shouldCenter ? contentWidth : innerWidth

  // Proactively ensure aspect ratios for currently visible cards in row layout
  useEffect(() => {
    if (!cards || cards.length === 0) return
    const columnWidthWithGap = cardW + gap
    const startIndex = Math.max(0, Math.floor(scrollOffset / Math.max(1, columnWidthWithGap)))
    const visibleCols = Math.ceil(containerWidth / Math.max(1, columnWidthWithGap))
    const overscan = 2
    const endIndexExclusive = Math.min(cards.length, startIndex + visibleCols + overscan)
    const slice = cards.slice(startIndex, endIndexExclusive)
    if (slice.length > 0) {
      onEnsureAspects?.(slice)
    }
  }, [cards, cardW, gap, containerWidth, scrollOffset, onEnsureAspects])

  return (
    <div
      style={{
        height: containerHeight,
        padding: `${paddingRowTB}px 0px`,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          justifyContent: shouldCenter ? 'center' : 'flex-start',
        }}
      >
        <Grid
          {...{
            gridRef,
            columnCount: cards.length,
            columnWidth: cardW + gap, // Include gap in column width for proper spacing
            height: availableHeight,
            rowCount: 1,
            rowHeight: availableHeight,
            width: gridWidth,
            overscanCount: 3,
            onScroll: handleScroll,
            cellComponent: Cell,
            cellProps: {},
            style: {},
          }}
          onWheelCapture={(e) => {
            lastUserActivityAtRef.current = Date.now()
            // Allow native scrolling but prevent the event from bubbling to the canvas.
            // If ctrlKey is pressed, we let the event bubble up to be handled for zooming.
            if (e.ctrlKey) return
            e.stopPropagation()
          }}
        />
      </div>
    </div>
  )
})

export { VirtualRowLayout }
