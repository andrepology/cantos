import { memo, useCallback, useRef, useState, useEffect, useMemo } from 'react'
import { Grid } from 'react-window'
import { stopEventPropagation } from 'tldraw'
import { CardView } from '../CardRenderer'
import { IntrinsicPreview } from './IntrinsicPreview'
import { getRowColumnCardStyle } from '../../styles/cardStyles'
import type { Card } from '../../types'
import { CARD_BORDER_RADIUS } from '../../constants'
import { Scrubber } from '../../Scrubber'

// 3D Carousel Layout for short channels (< 16 cards)
const ThreeDCarouselLayout = memo(function ThreeDCarouselLayout({
  cards,
  cardW,
  cardH,
  gap,
  paddingRowTB,
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
  const containerRef = useRef<HTMLDivElement>(null)
  const carouselRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  const wheelAccumRef = useRef(0)
  const wheelTimeoutRef = useRef<number | undefined>(undefined)

  // Calculate carousel parameters based on desandro's algorithm
  const cardCount = cards.length

  // Pre-calculate static carousel values
  const carouselParams = useMemo(() => {
    const rotationAngle = 360 / cardCount
    const cellSize = cardW + gap
    const translateZ = Math.round((cellSize / 2) / Math.tan((Math.PI * 2) / (cardCount * 2)))
    return { rotationAngle, cellSize, translateZ }
  }, [cardCount, cardW, gap])

  const { rotationAngle, cellSize, translateZ } = carouselParams

  // Perspective distance - adjust based on container size
  const perspective = Math.max(containerWidth, containerHeight) * 2

  // Snap rotation derived from active index, allowing visual wrapping
  const computedRotation = -activeIndex * rotationAngle

  // Memoized visual effects cache to prevent frequent re-renders
  const visualEffectsCache = useMemo(() => {
    return cards.map((_, cardIndex) => {
      const visualActiveIndex = ((activeIndex % cardCount) + cardCount) % cardCount
      const directDistance = Math.abs(cardIndex - visualActiveIndex)
      const wrappedDistance = Math.min(directDistance, cardCount - directDistance)

      // Scale down cards further away (0.4 minimum scale)
      const scale = Math.max(0.2, 1.0 - (wrappedDistance * 0.15))

      // Reduce opacity for cards further away (0.3 minimum opacity)
      // Opacity is 0 if wrapped distance > 2, otherwise decrease per step
      const opacity = wrappedDistance > 2 ? 0 : Math.max(0.0, 1.0 - (wrappedDistance * 0.3))

      return { scale, opacity, wrappedDistance }
    })
  }, [activeIndex, cardCount, cards.length])

  const isImageLike = useCallback((card: Card) => {
    if (card.type === 'image') return true
    if (card.type === 'link' && (card as any).imageUrl) return true
    if (card.type === 'media' && (card as any).thumbnailUrl) return true
    return false
  }, [])

  // Calculate available height and adaptive card height
  const availableHeight = Math.max(0, containerHeight - (paddingRowTB * 2))
  const minCardSize = 24
  const scrubberHeight = 32
  const carouselTopOffset = 32
  const carouselHeight = containerHeight - scrubberHeight - carouselTopOffset
  const effectiveCardH = Math.max(minCardSize, Math.min(cardH, carouselHeight - (paddingRowTB * 2)))

  // Ensure aspect ratios for all cards in carousel (no virtualization)
  useEffect(() => {
    if (cards.length > 0) {
      onEnsureAspects?.(cards)
    }
  }, [cards, onEnsureAspects])

  // Wheel event handler with debouncing for smoother performance
  const onWheelCapture = useCallback((e: WheelEvent) => {
    lastUserActivityAtRef.current = Date.now()
    // Allow ctrl+wheel to bubble for zoom
    if ((e as WheelEvent).ctrlKey) return
    // Prevent TLDraw pan/scroll handling higher up
    e.preventDefault()
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation()
    e.stopPropagation()

    // Debounce wheel events for smoother performance
    if (wheelTimeoutRef.current) return

    wheelTimeoutRef.current = setTimeout(() => {
      // Accumulate the dominant axis delta in pixel units
      const { deltaX, deltaY, deltaMode } = e
      const linePx = 40 // px per line unit heuristic
      const pagePx = window.innerHeight // page unit heuristic
      const unit = deltaMode === 1 ? linePx : deltaMode === 2 ? pagePx : 1
      const dx = deltaX * unit
      const dy = deltaY * unit
      const dominantDelta = Math.abs(dy) >= Math.abs(dx) ? dy : dx

      // Threshold to advance exactly one index per meaningful gesture
      const stepThreshold = 60 // px

      let accum = wheelAccumRef.current + dominantDelta
      let step = 0
      while (Math.abs(accum) >= stepThreshold) {
        step += accum > 0 ? 1 : -1
        accum -= stepThreshold * (accum > 0 ? 1 : -1)
      }
      wheelAccumRef.current = accum

      if (step !== 0 && cardCount > 0) {
        setActiveIndex((prev) => prev + step)
      }

      wheelTimeoutRef.current = undefined
    }, 16) // ~60fps
  }, [lastUserActivityAtRef, cardCount])

  // Intercept wheel at the container in capture phase before TLDraw,
  // convert deltas into discrete index steps and snap rotation
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    el.addEventListener('wheel', onWheelCapture, { passive: false, capture: true })
    return () => el.removeEventListener('wheel', onWheelCapture, { capture: true } as any)
  }, [onWheelCapture])

  // Reset to 0 if no cards
  useEffect(() => {
    if (cardCount <= 0 && activeIndex !== 0) {
      setActiveIndex(0)
    }
  }, [cardCount, activeIndex])

  // Notify selection-rect consumers when the snapped rotation changes
  useEffect(() => {
    scheduleSelectedRectUpdate()
  }, [activeIndex, scheduleSelectedRectUpdate])

  // Reserve space for scrubber (36px height + 16px padding)

  return (
    <div
      ref={containerRef}
      style={{
        height: containerHeight,
        position: 'relative',
        overflow: 'hidden',
        // Improve wheel responsiveness across devices
        touchAction: 'none',
        WebkitOverflowScrolling: 'auto',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Mark as interactive to prevent TLDraw pan events */}
      <div
        ref={carouselRef}
        data-interactive="carousel"
        style={{
          position: 'absolute',
          top: carouselTopOffset,
          left: '50%',
          transform: 'translateX(-50%)',
          width: containerWidth,
          height: carouselHeight,
          perspective: `${perspective}px`,
          transformStyle: 'preserve-3d',
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            transformStyle: 'preserve-3d',
            transform: `rotateY(${computedRotation}deg)`,
            transition: 'transform 0.25s ease-out',
          }}
        >
          {cards.map((card, index) => {
            const imageLike = isImageLike(card)
            const isPDF = card.type === 'pdf'
            const isTextOrChannel = card.type === 'text' || card.type === 'channel'

            // For text/channel cards, maintain square aspect ratio using original cardH
            // For image/media cards, use constrained height to fit carousel
            const cardHeight = isTextOrChannel ? Math.max(minCardSize, Math.min(cardH, availableHeight)) : effectiveCardH
            const pdfHeight = isPDF ? Math.min(cardHeight, cardW * (4/3)) : cardHeight
            const baseStyle = getRowColumnCardStyle(imageLike, cardW, pdfHeight, !isPDF)
            const { scale, opacity, wrappedDistance } = visualEffectsCache[index]

            return (
              <div
                key={card.id}
                style={{
                  position: 'absolute',
                  width: cardW,
                  height: cardHeight,
                  left: '50%',
                  top: '50%',
                  marginLeft: -(cardW / 2),
                  marginTop: -(cardHeight / 2),
                  transform: `rotateY(${rotationAngle * index}deg) translateZ(${translateZ}px) scale(${scale})`,
                  transformOrigin: 'center center',
                  opacity: opacity,
                  transition: `transform ${wrappedDistance === 0 ? '0.4s' : '0.1s'} cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity ${wrappedDistance === 0 ? '0.4s' : '0.1s'} cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
                }}
              >
                <div
                  data-interactive="card"
                  data-card-id={String(card.id)}
                  data-card-type={String((card as any)?.type)}
                  data-card-title={String((card as any)?.title ?? '')}
                  data-channel-slug={(card as any)?.type === 'channel' ? String((card as any)?.slug ?? '') : undefined}
                  data-channel-author={(card as any)?.type === 'channel' ? String((card as any)?.user?.full_name || (card as any)?.user?.username || '') : undefined}
                  data-channel-updated-at={(card as any)?.type === 'channel' ? String((card as any)?.updatedAt ?? '') : undefined}
                  data-channel-block-count={(card as any)?.type === 'channel' ? String((card as any)?.length ?? 0) : undefined}
                  data-image-url={(card as any)?.type === 'image' ? String((card as any)?.url ?? '') : (card as any)?.type === 'link' ? String((card as any)?.imageUrl ?? '') : undefined}
                  data-url={(card as any)?.type === 'image' ? String((card as any)?.url ?? '') : (card as any)?.type === 'link' ? String((card as any)?.url ?? '') : undefined}
                  data-content={(card as any)?.type === 'text' ? String((card as any)?.content ?? '') : undefined}
                  data-embed-html={(card as any)?.type === 'media' ? String((card as any)?.embedHtml ?? '') : undefined}
                  data-thumbnail-url={(card as any)?.type === 'media' ? String((card as any)?.thumbnailUrl ?? '') : undefined}
                  data-original-url={(card as any)?.type === 'media' ? String((card as any)?.originalUrl ?? '') : undefined}
                  style={{
                    ...baseStyle,
                    position: 'relative',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={() => {}} // handled by parent
                  onMouseLeave={() => {}} // handled by parent
                  onContextMenu={(e) => onCardContextMenu(e, card)}
                  onPointerDown={(e) => {
                    stopEventPropagation(e)
                    onCardPointerDown(e, card)
                  }}
                  onPointerMove={(e) => onCardPointerMove(e, card)}
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
                    <IntrinsicPreview
                      card={card}
                      mode="column"
                      dataInteractive="card"
                      dataCardId={String(card.id)}
                      dataCardType={String((card as any)?.type)}
                      dataCardTitle={String((card as any)?.title ?? '')}
                      dataChannelSlug={(card as any)?.type === 'channel' ? String((card as any)?.slug ?? '') : undefined}
                      dataChannelAuthor={(card as any)?.type === 'channel' ? String((card as any)?.user?.full_name || (card as any)?.user?.username || '') : undefined}
                      dataChannelUpdatedAt={(card as any)?.type === 'channel' ? String((card as any)?.updatedAt ?? '') : undefined}
                      dataChannelBlockCount={(card as any)?.type === 'channel' ? String((card as any)?.length ?? 0) : undefined}
                      dataImageUrl={(card as any)?.type === 'image' ? String((card as any)?.url ?? '') : (card as any)?.type === 'link' ? String((card as any)?.imageUrl ?? '') : undefined}
                      dataUrl={(card as any)?.type === 'image' ? String((card as any)?.url ?? '') : (card as any)?.type === 'link' ? String((card as any)?.url ?? '') : undefined}
                      dataContent={(card as any)?.type === 'text' ? String((card as any)?.content ?? '') : undefined}
                      dataEmbedHtml={(card as any)?.type === 'media' ? String((card as any)?.embedHtml ?? '') : undefined}
                      dataThumbnailUrl={(card as any)?.type === 'media' ? String((card as any)?.thumbnailUrl ?? '') : undefined}
                      dataOriginalUrl={(card as any)?.type === 'media' ? String((card as any)?.originalUrl ?? '') : undefined}
                      onMouseEnter={() => {}} // handled by parent
                      onMouseLeave={() => {}} // handled by parent
                      onContextMenu={(e) => onCardContextMenu(e, card)}
                      onPointerDown={(e) => {
                        stopEventPropagation(e)
                        onCardPointerDown(e, card)
                      }}
                      onPointerMove={(e) => onCardPointerMove(e, card)}
                      onPointerUp={(e) => {
                        stopEventPropagation(e)
                        onCardPointerUp(e, card)
                      }}
                      onClick={(e) => {
                        stopEventPropagation(e)
                        onCardClick(e, card, e.currentTarget as HTMLElement)
                      }}
                    />
                  ) : (
                    <CardView
                      card={card}
                      compact={(card as any)?.type === 'channel' ? cardW < 100 : cardW < 180}
                      sizeHint={{ w: cardW, h: cardHeight }}
                      dataInteractive="card"
                      dataCardId={String(card.id)}
                      dataCardType={String((card as any)?.type)}
                      dataCardTitle={String((card as any)?.title ?? '')}
                      dataChannelSlug={(card as any)?.type === 'channel' ? String((card as any)?.slug ?? '') : undefined}
                      dataChannelAuthor={(card as any)?.type === 'channel' ? String((card as any)?.user?.full_name || (card as any)?.user?.username || '') : undefined}
                      dataChannelUpdatedAt={(card as any)?.type === 'channel' ? String((card as any)?.updatedAt ?? '') : undefined}
                      dataChannelBlockCount={(card as any)?.type === 'channel' ? String((card as any)?.length ?? 0) : undefined}
                      dataImageUrl={(card as any)?.type === 'image' ? String((card as any)?.url ?? '') : (card as any)?.type === 'link' ? String((card as any)?.imageUrl ?? '') : undefined}
                      dataUrl={(card as any)?.type === 'image' ? String((card as any)?.url ?? '') : (card as any)?.type === 'link' ? String((card as any)?.url ?? '') : undefined}
                      dataContent={(card as any)?.type === 'text' ? String((card as any)?.content ?? '') : undefined}
                      dataEmbedHtml={(card as any)?.type === 'media' ? String((card as any)?.embedHtml ?? '') : undefined}
                      dataThumbnailUrl={(card as any)?.type === 'media' ? String((card as any)?.thumbnailUrl ?? '') : undefined}
                      dataOriginalUrl={(card as any)?.type === 'media' ? String((card as any)?.originalUrl ?? '') : undefined}
                      onMouseEnter={() => {}} // handled by parent
                      onMouseLeave={() => {}} // handled by parent
                      onContextMenu={(e) => onCardContextMenu(e, card)}
                      onPointerDown={(e) => {
                        stopEventPropagation(e)
                        onCardPointerDown(e, card)
                      }}
                      onPointerMove={(e) => onCardPointerMove(e, card)}
                      onPointerUp={(e) => {
                        stopEventPropagation(e)
                        onCardPointerUp(e, card)
                      }}
                      onClick={(e) => {
                        stopEventPropagation(e)
                        onCardClick(e, card, e.currentTarget as HTMLElement)
                      }}
                    />
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
          })}
        </div>
      </div>

      {/* Scrubber navigation - absolutely positioned below container */}
      <div
        data-interactive="scrubber"
        style={{
          position: 'absolute',
          bottom: -10,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          padding: '8px',
          opacity: isHovered ? 1 : 0,
          transition: 'opacity 0.2s ease-out',
          pointerEvents: isHovered ? 'auto' : 'none',
        }}
      >
        <Scrubber
          count={cards.length}
          index={activeIndex % cards.length}
          onChange={setActiveIndex}
          width={containerWidth}
        />
      </div>
    </div>
  )
})

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
  onCardContextMenu: (e: React.MouseEvent<Element>, card: Card) => void
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
  // Use 3D carousel for short channels (>= 5 cards and < 16 cards), virtualization for longer ones
  const use3DCarousel = cards.length >= 5 && cards.length < 16
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
  // Add 36px padding on each side for edge scrolling
  const scrollableWidth = contentWidth + 72
  const shouldCenter = contentWidth <= containerWidth

  const isImageLike = useCallback((card: Card) => {
    if (card.type === 'image') return true
    if (card.type === 'link' && (card as any).imageUrl) return true
    if (card.type === 'media' && (card as any).thumbnailUrl) return true
    return false
  }, [])

  // Calculate available height and adaptive card height early
  const availableHeight = Math.max(0, containerHeight - (paddingRowTB * 2))
  const minCardSize = 32
  const effectiveCardH = Math.max(minCardSize, Math.min(cardH, availableHeight))

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
    const isPDF = card.type === 'pdf'
    const pdfHeight = isPDF ? Math.min(effectiveCardH, cardW * (4/3)) : effectiveCardH
    const baseStyle = getRowColumnCardStyle(imageLike, cardW, pdfHeight, !isPDF) // Allow PDFs to be taller than square

    // Warm the aspect ratio cache for each rendered cell so later drags have ratios
    onEnsureAspects?.([card])

    return (
      <div style={{
        ...style,
        left: (style.left as number) + 24, // Add 36px left padding to each cell
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div
          style={{
            ...baseStyle,
            position: 'relative',
          }}
        >
          {imageLike ? (
            <IntrinsicPreview
              card={card}
              mode="column"
              dataInteractive="card"
              dataCardId={String(card.id)}
              dataCardType={String((card as any)?.type)}
              dataCardTitle={String((card as any)?.title ?? '')}
              dataChannelSlug={(card as any)?.type === 'channel' ? String((card as any)?.slug ?? '') : undefined}
              dataChannelAuthor={(card as any)?.type === 'channel' ? String((card as any)?.user?.full_name || (card as any)?.user?.username || '') : undefined}
              dataChannelUpdatedAt={(card as any)?.type === 'channel' ? String((card as any)?.updatedAt ?? '') : undefined}
              dataChannelBlockCount={(card as any)?.type === 'channel' ? String((card as any)?.length ?? 0) : undefined}
              dataImageUrl={(card as any)?.type === 'image' ? String((card as any)?.url ?? '') : (card as any)?.type === 'link' ? String((card as any)?.imageUrl ?? '') : undefined}
              dataUrl={(card as any)?.type === 'image' ? String((card as any)?.url ?? '') : (card as any)?.type === 'link' ? String((card as any)?.url ?? '') : undefined}
              dataContent={(card as any)?.type === 'text' ? String((card as any)?.content ?? '') : undefined}
              dataEmbedHtml={(card as any)?.type === 'media' ? String((card as any)?.embedHtml ?? '') : undefined}
              dataThumbnailUrl={(card as any)?.type === 'media' ? String((card as any)?.thumbnailUrl ?? '') : undefined}
              dataOriginalUrl={(card as any)?.type === 'media' ? String((card as any)?.originalUrl ?? '') : undefined}
              onMouseEnter={() => {}} // handled by parent
              onMouseLeave={() => {}} // handled by parent
              onContextMenu={(e) => onCardContextMenu(e, card)}
              onPointerDown={(e) => {
                stopEventPropagation(e)
                onCardPointerDown(e, card)
              }}
              onPointerMove={(e) => onCardPointerMove(e, card)}
              onPointerUp={(e) => {
                stopEventPropagation(e)
                onCardPointerUp(e, card)
              }}
              onClick={(e) => {
                stopEventPropagation(e)
                onCardClick(e, card, e.currentTarget as HTMLElement)
              }}
            />
          ) : (
            <CardView
              card={card}
              compact={(card as any)?.type === 'channel' ? cardW < 100 : cardW < 180}
              sizeHint={{ w: cardW, h: pdfHeight }}
              dataInteractive="card"
              dataCardId={String(card.id)}
              dataCardType={String((card as any)?.type)}
              dataCardTitle={String((card as any)?.title ?? '')}
              dataChannelSlug={(card as any)?.type === 'channel' ? String((card as any)?.slug ?? '') : undefined}
              dataChannelAuthor={(card as any)?.type === 'channel' ? String((card as any)?.user?.full_name || (card as any)?.user?.username || '') : undefined}
              dataChannelUpdatedAt={(card as any)?.type === 'channel' ? String((card as any)?.updatedAt ?? '') : undefined}
              dataChannelBlockCount={(card as any)?.type === 'channel' ? String((card as any)?.length ?? 0) : undefined}
              dataImageUrl={(card as any)?.type === 'image' ? String((card as any)?.url ?? '') : (card as any)?.type === 'link' ? String((card as any)?.imageUrl ?? '') : undefined}
              dataUrl={(card as any)?.type === 'image' ? String((card as any)?.url ?? '') : (card as any)?.type === 'link' ? String((card as any)?.url ?? '') : undefined}
              dataContent={(card as any)?.type === 'text' ? String((card as any)?.content ?? '') : undefined}
              dataEmbedHtml={(card as any)?.type === 'media' ? String((card as any)?.embedHtml ?? '') : undefined}
              dataThumbnailUrl={(card as any)?.type === 'media' ? String((card as any)?.thumbnailUrl ?? '') : undefined}
              dataOriginalUrl={(card as any)?.type === 'media' ? String((card as any)?.originalUrl ?? '') : undefined}
              onMouseEnter={() => {}} // handled by parent
              onMouseLeave={() => {}} // handled by parent
              onContextMenu={(e) => onCardContextMenu(e, card)}
              onPointerDown={(e) => {
                stopEventPropagation(e)
                onCardPointerDown(e, card)
              }}
              onPointerMove={(e) => onCardPointerMove(e, card)}
              onPointerUp={(e) => {
                stopEventPropagation(e)
                onCardPointerUp(e, card)
              }}
              onClick={(e) => {
                stopEventPropagation(e)
                onCardClick(e, card, e.currentTarget as HTMLElement)
              }}
            />
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
  }, [cards, isImageLike, cardW, effectiveCardH, selectedCardId, hoveredId, onCardContextMenu, onCardPointerDown, onCardPointerMove, onCardPointerUp, onCardClick, CARD_BORDER_RADIUS])


  // Unified layout: outer container applies only TB padding; inner flex centers horizontally when needed
  const innerWidth = containerWidth
  const gridWidth = shouldCenter ? contentWidth : scrollableWidth

  // Proactively ensure aspect ratios for currently visible cards in row layout
  useEffect(() => {
    if (!cards || cards.length === 0) return
    const columnWidthWithGap = cardW + gap
    // Adjust scrollOffset by -36px to account for the left padding offset
    const adjustedScrollOffset = scrollOffset - 36
    const startIndex = Math.max(0, Math.floor(adjustedScrollOffset / Math.max(1, columnWidthWithGap)))
    const visibleCols = Math.ceil(containerWidth / Math.max(1, columnWidthWithGap))
    const overscan = 2
    const endIndexExclusive = Math.min(cards.length, startIndex + visibleCols + overscan)
    const slice = cards.slice(startIndex, endIndexExclusive)
    if (slice.length > 0) {
      onEnsureAspects?.(slice)
    }
  }, [cards, cardW, gap, containerWidth, scrollOffset, onEnsureAspects])

  // Render 3D carousel for short channels, virtual grid for longer ones
  if (use3DCarousel) {
    return (
      <ThreeDCarouselLayout
        cards={cards}
        cardW={cardW}
        cardH={cardH}
        gap={gap}
        paddingRowTB={paddingRowTB}
        paddingRowLR={paddingRowLR}
        hoveredId={hoveredId}
        selectedCardId={selectedCardId}
        lastUserActivityAtRef={lastUserActivityAtRef}
        scheduleSelectedRectUpdate={scheduleSelectedRectUpdate}
        onCardClick={onCardClick}
        onCardPointerDown={onCardPointerDown}
        onCardPointerMove={onCardPointerMove}
        onCardPointerUp={onCardPointerUp}
        onCardContextMenu={onCardContextMenu}
        containerHeight={containerHeight}
        containerWidth={containerWidth}
        onEnsureAspects={onEnsureAspects}
      />
    )
  }

  return (
    <div
      style={{
        height: containerHeight,
        position: 'relative',
        overflow: 'hidden',
      }}
      onWheelCapture={(e) => {
        lastUserActivityAtRef.current = Date.now()
        // Allow ctrl+wheel for zooming, but prevent wheel events from becoming canvas pan gestures
        if (e.ctrlKey) return
        e.stopPropagation()
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          justifyContent: shouldCenter ? 'center' : 'flex-start',
          padding: `${paddingRowTB}px 0px`,
        }}
      >
        <Grid
          {...{
            gridRef,
            columnCount: cards.length,
            columnWidth: cardW + gap, // Include gap in column width for proper spacing
            height: containerHeight,
            rowCount: 1,
            rowHeight: containerHeight, // Use full container height
            width: gridWidth,
            overscanCount: 3,
            onScroll: handleScroll,
            cellComponent: Cell,
            cellProps: {},
            style: {
              position: 'absolute',
              top: 10,
              left: shouldCenter ? '50%' : 0,
              transform: shouldCenter ? 'translateX(-50%)' : 'none',
            },
          }}
          onWheelCapture={(e) => {
            lastUserActivityAtRef.current = Date.now()
            // Container-level onWheelCapture handles propagation stopping
          }}
        />
      </div>
    </div>
  )
})

export { VirtualRowLayout }
