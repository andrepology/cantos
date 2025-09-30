import { memo, useCallback, useMemo, useRef, useEffect, useLayoutEffect, useState } from 'react'
import type React from 'react'
import { stopEventPropagation } from 'tldraw'
import { useMasonry, usePositioner, useResizeObserver } from 'masonic'
import { CardView } from '../CardRenderer'
import { IntrinsicPreview } from './IntrinsicPreview'
import { getGridCardStyle } from '../../styles/cardStyles'
import type { Card } from '../../types'


export interface VirtualGridLayoutProps {
  cards: Card[]
  cardW: number
  cardH: number
  gap: number
  paddingColTB: number
  paddingColLR?: number
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
  paddingColLR = 24,
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
  // Scroll state memory keyed by the visible deck contents
  type ScrollState = { scrollTop: number }
  const deckScrollMemory = useMemo(() => new Map<string, ScrollState>(), [])
  const computeDeckKey = useCallback((list: { id: number }[]): string => {
    if (!list || list.length === 0) return 'empty'
    const head = list.slice(0, 10).map((c) => String(c.id))
    const tail = list.slice(-10).map((c) => String(c.id))
    return `${list.length}:${head.join('|')}::${tail.join('|')}`
  }, [])

  // Container ref that owns scrolling
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Measure container size; fall back to provided props
  const [measured, setMeasured] = useState<{ width: number; height: number }>({ width: Math.max(0, containerWidth), height: Math.max(0, containerHeight) })
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setMeasured({ width: el.clientWidth, height: el.clientHeight })
    })
    ro.observe(el)
    // Prime initial size
    setMeasured({ width: el.clientWidth, height: el.clientHeight })
    return () => ro.disconnect()
  }, [containerWidth, containerHeight])

  // Track scrollTop and whether the element is scrolling
  const [scrollTop, setScrollTop] = useState(0)
  const [isScrolling, setIsScrolling] = useState(false)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let scrollingTimeout: number | null = null
    const onScroll = () => {
      lastUserActivityAtRef.current = Date.now()
      setScrollTop(el.scrollTop)
      setIsScrolling(true)
      scheduleSelectedRectUpdate()
      const key = computeDeckKey(cards)
      deckScrollMemory.set(key, { scrollTop: el.scrollTop })
      if (scrollingTimeout != null) window.clearTimeout(scrollingTimeout)
      scrollingTimeout = window.setTimeout(() => setIsScrolling(false), 120)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (scrollingTimeout != null) window.clearTimeout(scrollingTimeout)
    }
  }, [cards, computeDeckKey, deckScrollMemory, lastUserActivityAtRef, scheduleSelectedRectUpdate])

  // Restore scroll position for this deck key on mount/when cards change
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const key = computeDeckKey(cards)
    const saved = deckScrollMemory.get(key)
    if (saved && Number.isFinite(saved.scrollTop)) {
      el.scrollTop = saved.scrollTop
      setScrollTop(saved.scrollTop)
    } else {
      el.scrollTop = 0
      setScrollTop(0)
    }
  }, [cards, computeDeckKey, deckScrollMemory])

  // Base column width (will be adjusted for narrow containers)
  const BASE_COLUMN_W = 128
  const defaultItemHeight = Math.max(1, cardH)

  // Compute available width for content (excluding padding)
  const availableWidth = Math.max(0, measured.width - paddingColLR * 2)

  // Calculate responsive column width and count
  // For wide containers: use base width, for narrow: scale down to fit
  const maxColumnsThatFit = Math.max(1, Math.floor((availableWidth + gap) / (BASE_COLUMN_W + gap)))
  const columnWidth = maxColumnsThatFit > 1
    ? BASE_COLUMN_W  // Use full width when we can fit multiple columns
    : Math.max(24, availableWidth)  // Scale down for single column, minimum 60px

  const columnCount = maxColumnsThatFit > 1
    ? maxColumnsThatFit
    : 1  // Single column for narrow containers

  const gridWidth = Math.max(0, columnCount * columnWidth + Math.max(0, columnCount - 1) * gap)

  // Create/maintain a positioner relative to the computed grid width
  const positioner = usePositioner({ width: gridWidth, columnWidth, columnGutter: gap, rowGutter: gap })
  const resizeObserver = useResizeObserver(positioner)

  // Render function for masonic
  type WrappedItem = { node: Card }

  const renderCard = useCallback(({ index, data, width }: { index: number; data: WrappedItem | undefined; width: number }) => {
    const card = data?.node
    if (!card) return <div style={{ width }} />
    const imageLike = isImageLike(card)
    const isChannel = (card as any)?.type === 'channel'
    const isText = (card as any)?.type === 'text'
    const outlineStyle =
      selectedCardId === card.id
        ? '2px solid rgba(0,0,0,.6)'
        : hoveredId === card.id
        ? '2px solid rgba(0,0,0,.25)'
        : 'none'

    const baseStyle = imageLike
      ? {
          width,
          background: 'transparent',
          border: 'none',
          boxShadow: 'none',
          borderRadius: 0,
          overflow: 'visible',
        } as React.CSSProperties
      : isChannel
      ? {
          width,
          height: width, // Force square for channels
          background: '#fff',
          border: '1px solid rgba(0,0,0,.08)',
          boxShadow: '0 6px 18px rgba(0,0,0,.08)',
          borderRadius: 8,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        } as React.CSSProperties
      : isText
      ? {
          width,
          height: width, // Square for text blocks
          background: '#fff',
          border: '1px solid rgba(0,0,0,.08)',
          boxShadow: '0 6px 18px rgba(0,0,0,.08)',
          borderRadius: 8,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        } as React.CSSProperties
      : {
          width,
          height: defaultItemHeight,
          background: '#fff',
          border: '1px solid rgba(0,0,0,.08)',
          boxShadow: '0 6px 18px rgba(0,0,0,.08)',
          borderRadius: 8,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        } as React.CSSProperties

    return (
      <div
        data-interactive="card"
        data-card-id={String(card.id)}
        style={{
          ...baseStyle,
          outline: outlineStyle,
          outlineOffset: 0,
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
        {imageLike ? (
          <IntrinsicPreview card={card} mode="column" />
        ) : isChannel ? (
          <div style={{ width, height: width, display: 'grid', placeItems: 'center' }}>
            <CardView card={card} compact={true} sizeHint={{ w: width, h: width }} />
          </div>
        ) : isText ? (
          <div style={{ width, height: width, overflow: 'auto' }}>
            <CardView card={card} compact={width < 180} sizeHint={{ w: width, h: width }} />
          </div>
        ) : (
          <CardView card={card} compact={width < 180} sizeHint={{ w: width, h: defaultItemHeight }} />
        )}
      </div>
    )
  }, [
    selectedCardId,
    hoveredId,
    onCardContextMenu,
    onCardPointerDown,
    onCardPointerMove,
    onCardPointerUp,
    onCardClick,
    defaultItemHeight,
  ])

  // Unique key for each card
  const itemKey = useCallback((data: any, index: number) => {
    // Use a stable string that won't collide across mode switches
    const id = data?.node?.id ?? data?.id
    return id != null ? `card:${String(id)}` : `idx:${String(index)}`
  }, [])

  const ready = active && measured.width > 0 && measured.height > 0
  const itemsFiltered = useMemo(() => (ready ? (cards as any[]).filter((c) => c && typeof c === 'object') : []), [ready, cards])
  const itemsWrapped = useMemo(() => (itemsFiltered as Card[]).map((c) => ({ node: c })), [itemsFiltered])

  const masonryElement = useMasonry<WrappedItem>({
    items: itemsWrapped as WrappedItem[],
    render: renderCard,
    itemKey,
    positioner,
    resizeObserver,
    height: measured.height,
    scrollTop,
    isScrolling,
    overscanBy: 1,
    itemHeightEstimate: defaultItemHeight,
    style: { width: gridWidth, margin: '0 auto' },
    onRender: () => {
      scheduleSelectedRectUpdate()
    },
  })

  return (
    <div
      ref={containerRef}
      onWheelCapture={(e) => {
        lastUserActivityAtRef.current = Date.now()
        if (e.ctrlKey) return
        e.stopPropagation()
      }}
      style={{
        position: 'absolute',
        inset: 0,
        overflowX: 'hidden',
        overflowY: 'auto',
        padding: `${paddingColTB}px ${paddingColLR}px`,
        overscrollBehavior: 'contain',
      }}
    >
      {masonryElement}
    </div>
  )
})

export { VirtualGridLayout }