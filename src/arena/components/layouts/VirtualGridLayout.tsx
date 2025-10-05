import { memo, useCallback, useMemo, useRef, useEffect, useLayoutEffect, useState } from 'react'
import type React from 'react'
import { stopEventPropagation } from 'tldraw'
import { useMasonry, usePositioner, useResizeObserver } from 'masonic'
import { CardView } from '../CardRenderer'
import { IntrinsicPreview } from './IntrinsicPreview'
import { getGridCardStyle } from '../../styles/cardStyles'
import type { Card } from '../../types'
import { CARD_BORDER_RADIUS } from '../../constants'


// Early (module-scope) WeakMap.set guard so we catch invalid keys during initial render too
(() => {
  try {
    const wmAny = WeakMap as any
    if (wmAny && !wmAny.__curlSitePatched) {
      const originalSet = WeakMap.prototype.set
      WeakMap.prototype.set = function (key: unknown, value: unknown) {
        if (Object(key) !== key) {
          // eslint-disable-next-line no-console
          console.error('[VirtualGridLayout][WeakMap.set:module] Invalid key', {
            typeofKey: typeof key,
            keyPreview: key,
            valuePreview: value,
            stack: new Error().stack,
          })
          // DEV-only: swallow invalid key to test hypothesis and avoid runtime crash
          return this as any
        }
        return (originalSet as any).call(this, key as any, value as any)
      }
      wmAny.__curlSitePatched = true
    }
  } catch {
    // noop
  }
})()

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
  if (card.type === 'media' && (card as any).thumbnailUrl) return true
  return false
}

const getImageUrl = (card: Card): string | undefined => {
  if (card.type === 'image') return (card as any).url
  if (card.type === 'link') return (card as any).imageUrl
  if (card.type === 'media') return (card as any).thumbnailUrl
  return undefined
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
  // guard WeakMap.set to surface where invalid keys come from (should be only objects)
  useEffect(() => {
    const wm = (WeakMap as any)
    if (wm && !wm.__curlSitePatched) {
      const originalSet = WeakMap.prototype.set
      try {
        WeakMap.prototype.set = function (key: unknown, value: unknown) {
          // Object(key) !== key is a fast is-object check that excludes null and primitives
          if (Object(key) !== key) {
            // eslint-disable-next-line no-console
            console.error('[VirtualGridLayout][WeakMap.set] Invalid key', {
              typeofKey: typeof key,
              keyPreview: key,
              valuePreview: value,
              stack: new Error().stack,
            })
          }
          return (originalSet as any).call(this, key as any, value as any)
        }
        wm.__curlSitePatched = true
      } catch {
        // noop – if patching fails, continue without it
      }
    }
  }, [])

  
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
  const renderCard = useCallback(({ index, data, width }: { index: number; data: Card | undefined; width: number }) => {
    const card = data
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
          borderRadius: CARD_BORDER_RADIUS,
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
          borderRadius: CARD_BORDER_RADIUS,
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
          borderRadius: CARD_BORDER_RADIUS,
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
          position: 'relative',
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
    CARD_BORDER_RADIUS,
  ])

  // Unique key for each card
  const itemKey = useCallback((data: any, index: number) => {
    // Use a stable string that won't collide across mode switches
    const id = data?.id
    const key = id != null ? `card:${String(id)}` : `idx:${String(index)}`
    if (id == null) {
      // eslint-disable-next-line no-console
      console.warn('[VirtualGridLayout] itemKey fallback to index', { index, dataPreview: data })
    }
    return key
  }, [])

  const ready = active && measured.width > 0 && measured.height > 0
  const itemsFiltered = useMemo(() => (ready ? (cards as any[]).filter((c) => c && typeof c === 'object') : []), [ready, cards])

  // validate the shape/types of items passed to masonic
  useEffect(() => {
    let nonObjects = 0
    let nullish = 0
    let hadNonFiniteId = 0
    for (const c of (cards as any[]) || []) {
      if (!c) nullish++
      else if (typeof c !== 'object') nonObjects++
      else if (!Number.isFinite((c as any).id)) hadNonFiniteId++
    }
    // eslint-disable-next-line no-console
    console.debug('[VirtualGridLayout] items audit', {
      cardsCount: cards?.length ?? 0,
      itemsFilteredCount: itemsFiltered.length,
      nonObjects,
      nullish,
      hadNonFiniteId,
      sample0: (itemsFiltered as any[])[0],
    })
  }, [cards, itemsFiltered])

  const masonryElement = useMasonry<Card>({
    items: itemsFiltered as Card[],
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