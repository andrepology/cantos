import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import type React from 'react'
import { stopEventPropagation } from 'tldraw'
import { Masonry, CellMeasurer, CellMeasurerCache, createMasonryCellPositioner } from 'react-virtualized'
import ImageMeasurer from 'react-virtualized-image-measurer'
import { CardView } from '../CardRenderer'
import type { Card } from '../../types'

// No scroll restoration: we only use onScroll to notify activity

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
  active?: boolean
}

const isImageLike = (card: Card) => {
  if (card.type === 'image') return true
  if (card.type === 'link' && (card as any).imageUrl) return true
  if (card.type === 'media' && (card as any).thumbnailUrl && !(card as any).embedHtml) return true
  return false
}

const getImageUrl = (card: Card): string | undefined => {
  if (card.type === 'image') return (card as any).url
  if (card.type === 'link') return (card as any).imageUrl
  // media
  return (card as any).thumbnailUrl
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
  active = true,
}: VirtualGridLayoutProps) {
  const masonryRef = useRef<any>(null)

  // Geometry
  const columnWidth = Math.max(1, cardW)
  const spacer = Math.max(0, gap)
  const columnCount = Math.max(1, Math.floor(containerWidth / (columnWidth + spacer)) || 1)

  // Measurement cache (fixed width)
  const cacheRef = useRef(
    new CellMeasurerCache({
      defaultHeight: Math.max(1, cardH),
      defaultWidth: columnWidth,
      fixedWidth: true,
    })
  )

  // Positioner
  const positionerRef = useRef(
    createMasonryCellPositioner({
      cellMeasurerCache: cacheRef.current,
      columnCount,
      columnWidth,
      spacer,
    })
  )

  // Reset logic when geometry changes
  useEffect(() => {
    if (!active) return
    // Only reset the positioner using the new geometry; do not clear measurement cache
    // Keeping Cache avoids re-measuring and preserves Masonry layout during resize
    positionerRef.current.reset({
      columnCount,
      columnWidth,
      spacer,
    })
    // Recompute positions synchronously next frame
    requestAnimationFrame(() => {
      masonryRef.current?.recomputeCellPositions()
    })
  }, [active, columnCount, columnWidth, spacer])

  // Prepare image measurer defaults - keep constant across resizes to avoid re-measure/refetch
  const measurerDefaultsRef = useRef({
    defaultWidth: Math.max(1, cardW),
    defaultHeight: Math.max(1, cardH),
  })
  const measurerDefaultWidth = measurerDefaultsRef.current.defaultWidth
  const measurerDefaultHeight = measurerDefaultsRef.current.defaultHeight

  // No scroll restoration; nothing to do here

  const renderMeasuredMasonry = useCallback(() => {
    return (
      <ImageMeasurer
        items={cards}
        image={getImageUrl}
        defaultHeight={measurerDefaultHeight}
        defaultWidth={measurerDefaultWidth}
      >
        {({ itemsWithSizes }) => {
          const cellRenderer = ({ index, key, parent, style }: any) => {
            const entry = itemsWithSizes[index]
            if (!entry) return <div key={key} style={style} />

            const card = entry.item as Card
            const size = entry.size
            const ratio = size && size.width ? size.height / size.width : undefined
            // Important: base display height on the measured defaultWidth to keep heights stable across resizes,
            // then scale by the current columnWidth to match new geometry. This prevents zero/flash states.
            const base = ratio ? measurerDefaultWidth * ratio : measurerDefaultHeight
            const scale = columnWidth / measurerDefaultWidth
            const displayHeight = Math.max(1, Math.round(base * scale))

            const imageLike = isImageLike(card)
            const outlineStyle =
              selectedCardId === card.id
                ? '2px solid rgba(0,0,0,.6)'
                : hoveredId === card.id
                ? '2px solid rgba(0,0,0,.25)'
                : 'none'

            const src = imageLike ? getImageUrl(card) : undefined

            // Compose a unique, stable key per item: id-index
            const uniqueKey = `${String((card as any).id ?? index)}-${index}`
            return (
              <CellMeasurer cache={cacheRef.current} index={index} key={uniqueKey} parent={parent}>
                <div style={style}>
                  <div
                    data-interactive="card"
                    data-card-id={String(card.id)}
                    style={{
                      width: columnWidth,
                      outline: outlineStyle,
                      outlineOffset: 0,
                      borderRadius: 8,
                      boxShadow: '0 6px 18px rgba(0,0,0,.08)',
                      background: 'transparent',
                    }}
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
                      onCardClick(e, card, (e.currentTarget as HTMLElement))
                    }}
                  >
                    {imageLike && src ? (
                      <img
                        src={src}
                        alt={(card as any).title}
                        width={columnWidth}
                        height={displayHeight}
                        loading="lazy"
                        decoding="async"
                        style={{
                          display: 'block',
                          borderRadius: 8,
                        }}
                      />
                    ) : (
                      <CardView
                        card={card}
                        compact={columnWidth < 180}
                        sizeHint={{ w: columnWidth, h: displayHeight }}
                      />
                    )}
                  </div>
                </div>
              </CellMeasurer>
            )
          }

          return (
            <Masonry
              ref={masonryRef}
              width={containerWidth}
              height={containerHeight}
              autoHeight={false}
              cellCount={itemsWithSizes.length}
              cellMeasurerCache={cacheRef.current}
              cellPositioner={positionerRef.current}
              cellRenderer={cellRenderer}
              keyMapper={(index: number) => {
                const entry = (itemsWithSizes as any)[index]
                const base = entry && entry.item ? String(entry.item.id) : String(index)
                return `${base}-${index}`
              }}
              overscanByPixels={Math.max(0, 2 * (measurerDefaultHeight + spacer))}
              onScroll={({ scrollTop }: { clientHeight: number; scrollHeight: number; scrollTop: number }) => {
                lastUserActivityAtRef.current = Date.now()
                scheduleSelectedRectUpdate()
              }}
              style={{
                padding: `${paddingColTB}px 0px`,
              }}
            />
          )
        }}
      </ImageMeasurer>
    )
  }, [
    cards,
    columnWidth,
    measurerDefaultHeight,
    measurerDefaultWidth,
    selectedCardId,
    hoveredId,
    onCardContextMenu,
    onCardPointerDown,
    onCardPointerMove,
    onCardPointerUp,
    onCardClick,
    containerWidth,
    containerHeight,
    spacer,
    lastUserActivityAtRef,
    scheduleSelectedRectUpdate,
    paddingColTB,
  ])

  return (
    <div
      onWheelCapture={(e) => {
        lastUserActivityAtRef.current = Date.now()
        if (e.ctrlKey) return
        e.stopPropagation()
      }}
    >
      {renderMeasuredMasonry()}
    </div>
  )
})

export { VirtualGridLayout }