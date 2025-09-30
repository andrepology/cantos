import { memo, useCallback, useRef, useState, useMemo, useEffect } from 'react'
import { Masonry, CellMeasurer, CellMeasurerCache, createMasonryCellPositioner } from 'react-virtualized'
import { stopEventPropagation } from 'tldraw'
import { CardView } from '../CardRenderer'
import { IntrinsicPreview } from './IntrinsicPreview'
import { getGridContainerStyle } from '../../styles/deckStyles'
import type { Card } from '../../types'

// Simplified scroll state - just pixel offsets, no anchor complexity
type ScrollState = { scrollLeft?: number; scrollTop?: number }
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
  const masonryRef = useRef<any>(null)
  const cacheRef = useRef(
    new CellMeasurerCache({
      defaultHeight: cardH,
      defaultWidth: cardW,
      fixedWidth: true,
    })
  )

  // Stable key for cache identity across re-renders
  const deckKey = useMemo(() => computeDeckKey(cards), [cards])

  // Masonry column configuration derived from container and card sizes
  const { columnCount, columnWidth, spacer } = useMemo(() => {
    const columnWidth = cardW
    const spacer = gap
    const columnCount = Math.max(1, Math.floor(containerWidth / (columnWidth + spacer)))
    return { columnCount, columnWidth, spacer }
  }, [containerWidth, cardW, gap])

  const positionerRef = useRef(
    createMasonryCellPositioner({
      cellMeasurerCache: cacheRef.current,
      columnCount,
      columnWidth,
      spacer,
    })
  )

  // Log virtualization setup for debugging
  useEffect(() => {
    console.log('🧱 Masonry active:', {
      cards: cards.length,
      columns: columnCount,
      colWidth: columnWidth,
      spacer,
      container: `${containerWidth}×${containerHeight}px`,
    })
  }, [cards.length, columnCount, columnWidth, spacer, containerWidth, containerHeight])

  const [scrollState, setScrollState] = useState(() => {
    const state = deckScrollMemory.get(computeDeckKey(cards))
    return state || { scrollTop: 0 }
  })
  const [controlledScrollTop, setControlledScrollTop] = useState<number | undefined>(() => scrollState.scrollTop)

  // Rebuild positioner when sizing inputs change
  useEffect(() => {
    positionerRef.current.reset({
      columnCount,
      columnWidth,
      spacer,
    })
    masonryRef.current?.recomputeCellPositions()
  }, [columnCount, columnWidth, spacer])

  // Clear cache and recompute when card data or width changes
  useEffect(() => {
    cacheRef.current.clearAll()
    positionerRef.current.reset({ columnCount, columnWidth, spacer })
    masonryRef.current?.clearCellPositions?.()
    masonryRef.current?.recomputeCellPositions()
  }, [deckKey, cardW, columnCount, columnWidth, spacer])

  const isImageLike = useCallback((card: Card) => {
    if (card.type === 'image') return true
    if (card.type === 'link' && (card as any).imageUrl) return true
    if (card.type === 'media' && (card as any).thumbnailUrl && !(card as any).embedHtml) return true
    return false
  }, [])

  const handleScroll = useCallback((props: any) => {
    lastUserActivityAtRef.current = Date.now()
    const scrollTop = props.scrollTop || 0
    setScrollState({ scrollTop })
    scheduleSelectedRectUpdate()
    const key = computeDeckKey(cards)
    deckScrollMemory.set(key, { scrollTop })
    if (controlledScrollTop !== undefined) setControlledScrollTop(undefined)
  }, [cards, lastUserActivityAtRef, scheduleSelectedRectUpdate, controlledScrollTop])

  const Cell = useCallback(({ index, key, parent, style }: any) => {
    if (index >= cards.length) return <div key={key} style={style} />

    const card = cards[index]
    const imageLike = isImageLike(card)

    // Masonry-specific card style: let height be determined by content
    const cardStyle: React.CSSProperties = imageLike
      ? {
          width: cardW,
          background: '#fff',
          border: '1px solid rgba(0,0,0,.08)',
          boxShadow: '0 6px 18px rgba(0,0,0,.08)',
          borderRadius: 8,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }
      : {
          width: cardW,
          height: cardH,
          background: '#fff',
          border: '1px solid rgba(0,0,0,.08)',
          boxShadow: '0 6px 18px rgba(0,0,0,.08)',
          borderRadius: 8,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column' as const,
        }

    return (
      <CellMeasurer cache={cacheRef.current} index={index} key={key} parent={parent}>
        {({ registerChild }: any) => (
          <div ref={registerChild} style={style}>
            <div
              data-interactive="card"
              data-card-id={String(card.id)}
              style={{
                ...cardStyle,
                outline:
                  selectedCardId === card.id
                    ? '2px solid rgba(0,0,0,.6)'
                    : hoveredId === card.id
                    ? '2px solid rgba(0,0,0,.25)'
                    : 'none',
                outlineOffset: 0,
              }}
              onMouseEnter={() => {}}
              onMouseLeave={() => {}}
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
                <CardView card={card} compact={cardW < 180} sizeHint={{ w: cardW, h: cardH }} />
              )}
            </div>
          </div>
        )}
      </CellMeasurer>
    )
  }, [cards, isImageLike, cardW, cardH, selectedCardId, hoveredId, onCardContextMenu, onCardPointerDown, onCardPointerMove, onCardPointerUp, onCardClick])

  const gridWidth = columnCount * columnWidth + Math.max(0, columnCount - 1) * spacer
  const needsCentering = gridWidth < containerWidth

  return (
    <div
      style={{
        padding: `${paddingColTB}px 0`,
        transform: needsCentering ? `translateX(${(containerWidth - gridWidth) / 2}px)` : undefined,
      }}
      onWheelCapture={(e) => {
        lastUserActivityAtRef.current = Date.now()
        if (e.ctrlKey) return
        e.stopPropagation()
      }}
    >
      <Masonry
        ref={masonryRef}
        autoHeight={false}
        width={containerWidth}
        height={containerHeight}
        cellCount={cards.length}
        cellMeasurerCache={cacheRef.current}
        cellPositioner={positionerRef.current}
        cellRenderer={Cell}
        keyMapper={(index: number) => String(cards[index]?.id ?? index)}
        overscanByPixels={Math.max(0, 2 * (cardH + gap))}
        scrollTop={controlledScrollTop}
        onScroll={handleScroll}
      />
    </div>
  )
})

export { VirtualGridLayout }
