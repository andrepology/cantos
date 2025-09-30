import { memo, useCallback, useRef, useState, useMemo, useEffect } from 'react'
import { Masonry, CellMeasurer, CellMeasurerCache, createMasonryCellPositioner } from 'react-virtualized'
// @ts-expect-error - library ships no types
import ImageMeasurer from 'react-virtualized-image-measurer'
import { stopEventPropagation } from 'tldraw'
import { CardView } from '../CardRenderer'
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

  // rAF throttle for recompute to avoid thrash
  const rafRef = useRef<number | null>(null)
  const scheduleRecompute = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      masonryRef.current?.recomputeCellPositions()
      rafRef.current = null
    })
  }, [])

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

  const getImageSrc = (card: Card): string | undefined => {
    if (card.type === 'image') return (card as any).url
    if (card.type === 'link') return (card as any).imageUrl
    if (card.type === 'media') return (card as any).thumbnailUrl
    return undefined
  }

  const Cell = useCallback(({ index, key, parent, style }: any) => {
    if (index >= cards.length) return <div key={key} style={style} />

    const card = cards[index]
    const imageLike = isImageLike(card)
    
    // Debug: log positioning info
    if (index % 20 === 0) {
      console.log(`📦 Cell ${index} (${card.id}):`, {
        imageLike,
        cachedHeight: cacheRef.current.getHeight(index, 0),
        styleTop: style.top,
        styleLeft: style.left,
      })
    }

    // Masonry-specific card style: let height be determined by content
    const cardStyle: React.CSSProperties = imageLike
      ? {
          width: cardW,
          background: '#fff',
          border: '1px solid rgba(0,0,0,.08)',
          boxShadow: '0 6px 18px rgba(0,0,0,.08)',
          borderRadius: 8,
          overflow: 'hidden',
          display: 'block',
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
        {({ registerChild, measure }: any) => (
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
                (() => {
                  const src = getImageSrc(card)
                  if (!src) return null
                  return (
                    <img
                      src={src}
                      alt={card.title}
                      loading="lazy"
                      decoding="async"
                      style={{ width: '100%', height: 'auto', display: 'block' }}
                      onLoad={() => {
                        // Re-measure once image has its final layout
                        measure()
                        requestAnimationFrame(() => measure())
                      }}
                    />
                  )
                })()
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
      <ImageMeasurer
        items={cards}
        image={(card: Card) => {
          if ((card as any).type === 'image') return (card as any).url
          if ((card as any).type === 'media') return (card as any).thumbnailUrl
          if ((card as any).type === 'link') return (card as any).imageUrl
          return undefined as any
        }}
        defaultWidth={columnWidth}
        defaultHeight={Math.max(cardH, Math.round(columnWidth * 0.75))}
      >
        {({ itemsWithSizes }: any) => {
          // Build a quick lookup from id to measured size
          const sizeById = new Map<number, { w: number; h: number }>()
          for (let i = 0; i < itemsWithSizes.length; i++) {
            const entry = itemsWithSizes[i]
            const card: Card = entry.item
            const s = entry.size
            if (card && s && s.width > 0 && s.height > 0) {
              sizeById.set(card.id, { w: s.width, h: s.height })
            }
          }

          const MeasuredCell = ({ index, key, parent, style }: any) => {
            if (index >= cards.length) return <div key={key} style={style} />
            const card = cards[index]
            const imageLike = isImageLike(card)
            let height = cardH
            if (imageLike) {
              const s = sizeById.get(card.id)
              if (s && s.w > 0 && s.h > 0) {
                height = Math.round(columnWidth * (s.h / s.w))
              } else {
                height = Math.max(cardH, Math.round(columnWidth * 0.75))
              }
            }
            // If cache holds a different height for this row, clear and schedule recompute
            const cached = cacheRef.current.getHeight(index, 0)
            if (typeof cached === 'number' && cached > 0 && cached !== height) {
              cacheRef.current.clear(index, 0)
              scheduleRecompute()
            }
            const styleMeasured: React.CSSProperties = imageLike
              ? {
                  width: columnWidth,
                  height,
                  background: '#fff',
                  border: '1px solid rgba(0,0,0,.08)',
                  boxShadow: '0 6px 18px rgba(0,0,0,.08)',
                  borderRadius: 8,
                  overflow: 'hidden',
                }
              : {
                  width: columnWidth,
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
                <div style={style}>
                  <div
                    data-interactive="card"
                    data-card-id={String(card.id)}
                    style={{
                      ...styleMeasured,
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
                      <img src={((card as any).url || (card as any).thumbnailUrl || (card as any).imageUrl) as string} alt={card.title} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                    ) : (
                      <CardView card={card} compact={columnWidth < 180} sizeHint={{ w: columnWidth, h: cardH }} />
                    )}
                  </div>
                </div>
              </CellMeasurer>
            )
          }

          return (
            <Masonry
              ref={masonryRef}
              autoHeight={false}
              width={containerWidth}
              height={containerHeight}
              cellCount={cards.length}
              cellMeasurerCache={cacheRef.current}
              cellPositioner={positionerRef.current}
              cellRenderer={MeasuredCell}
              keyMapper={(index: number) => String(cards[index]?.id ?? index)}
              overscanByPixels={Math.max(0, 2 * (cardH + gap))}
              scrollTop={controlledScrollTop}
              onScroll={handleScroll}
            />
          )
        }}
      </ImageMeasurer>
    </div>
  )
})

export { VirtualGridLayout }
