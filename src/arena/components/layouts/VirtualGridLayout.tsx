import { memo, useCallback, useMemo, useRef, useEffect, useLayoutEffect, useState } from 'react'
import type React from 'react'
import { stopEventPropagation } from 'tldraw'
import { useMasonry, usePositioner, useResizeObserver } from 'masonic'
import { CardView } from '../CardRenderer'
import { IntrinsicPreview } from './IntrinsicPreview'
import { getGridCardStyle } from '../../styles/cardStyles'
import type { Card } from '../../types'
import { CARD_BORDER_RADIUS, CARD_BACKGROUND } from '../../constants'


// Early (module-scope) WeakMap.set guard so we catch invalid keys during initial render too
(() => {
  try {
    const wmAny = WeakMap as any
    if (wmAny && !wmAny.__curlSitePatched) {
      const originalSet = WeakMap.prototype.set
      WeakMap.prototype.set = function (key: unknown, value: unknown) {
        if (Object(key) !== key) {
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
            // Invalid key - continue without logging
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
  const computeDeckKey = useCallback((list: { id: number }[], isChronological: boolean): string => {
    if (!list || list.length === 0) return 'empty'
    const head = list.slice(0, 10).map((c) => String(c.id))
    const tail = list.slice(-10).map((c) => String(c.id))
    const sortMode = isChronological ? 'chrono' : 'api'
    return `${sortMode}:${list.length}:${head.join('|')}::${tail.join('|')}`
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
      const key = computeDeckKey(cards, columnCount === 1)
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
    : Math.min(BASE_COLUMN_W, Math.max(24, availableWidth))  // Cap single column at BASE_COLUMN_W

  const columnCount = maxColumnsThatFit > 1
    ? maxColumnsThatFit
    : 1  // Single column for narrow containers

  // Restore scroll position for this deck key on mount/when cards change
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const key = computeDeckKey(cards, columnCount === 1)
    const saved = deckScrollMemory.get(key)
    if (saved && Number.isFinite(saved.scrollTop)) {
      el.scrollTop = saved.scrollTop
      setScrollTop(saved.scrollTop)
    } else {
      el.scrollTop = 0
      setScrollTop(0)
    }
  }, [cards, columnCount, computeDeckKey, deckScrollMemory])

  const gridWidth = Math.max(0, columnCount * columnWidth + Math.max(0, columnCount - 1) * gap)


  // Create/maintain a positioner relative to the computed grid width
  // Use larger row gap in single column mode for better readability
  const rowGap = columnCount === 1 ? gap * 4 : gap
  const positioner = usePositioner({ width: gridWidth, columnWidth, columnGutter: gap, rowGutter: rowGap })
  const resizeObserver = useResizeObserver(positioner)

  // Render function for masonic
  const renderCard = useCallback(({ index, data, width }: { index: number; data: Card | undefined; width: number }) => {
    const card = data
    if (!card) return <div style={{ width }} />
    const imageLike = isImageLike(card)
    const isChannel = (card as any)?.type === 'channel'
    const isText = (card as any)?.type === 'text'
    const isPDF = (card as any)?.type === 'pdf'
    const outlineStyle =
      selectedCardId === card.id
        ? '2px solid rgba(0,0,0,.6)'
        : hoveredId === card.id
        ? '2px solid rgba(0,0,0,.25)'
        : 'none'

    // Chat stream metadata (only in single column mode and wide enough)
    const showChatMetadata = columnCount === 1 && card.user && containerWidth > 216
    const formattedDate = showChatMetadata && card.createdAt
      ? (() => {
          const date = new Date(card.createdAt)
          const now = new Date()
          const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())

          const month = date.toLocaleDateString('en-US', { month: 'short' })
          const day = date.getDate()
          const year = date.toLocaleDateString('en-US', { year: '2-digit' })

          // If within the last year, show "Sep 21", otherwise show "Sep '23"
          if (date >= oneYearAgo) {
            return `${month} ${day}`
          } else {
            return `${month} '${year}`
          }
        })()
      : null

    const baseStyle = {
      width,
      background: 'transparent',
      border: 'none',
      boxShadow: 'none',
      borderRadius: 0,
      overflow: 'visible',
      paddingTop: showChatMetadata ? 24 : 0, // Extra space for chat metadata
    } as React.CSSProperties

    return (
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
          <div style={{ width, height: width, display: 'grid', placeItems: 'center', border: '3px solid rgba(0,0,0,.05)', borderRadius: CARD_BORDER_RADIUS, mixBlendMode: 'multiply', background: CARD_BACKGROUND }}>
            <CardView card={card} compact={width < 100} sizeHint={{ w: width, h: width }} />
          </div>
        ) : isText ? (
          <CardView card={card} compact={width < 180} sizeHint={{ w: width, h: width }} />
        ) : isPDF ? (
          <CardView card={card} compact={width < 180} sizeHint={{ w: width, h: Math.min(width * (4/3), defaultItemHeight) }} />
        ) : (
          <CardView card={card} compact={width < 180} sizeHint={{ w: width, h: defaultItemHeight }} />
        )}

        {/* Chat stream metadata (only in single column mode) */}
        {showChatMetadata && (
          <div
              style={{
                position: 'absolute',
                top: 0,
                left: -32,
                right: -32,
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                overflow: 'visible'
              }}
          >
            {/* Profile circle and name on the left */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                position: 'absolute',
                left: 0,
                top: 0
              }}
            >
              <div
                style={{
                  position: 'relative',
                  top: 6,
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: card.user!.avatar
                    ? `url(${card.user!.avatar})`
                    : 'rgba(0,0,0,.1)',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  flexShrink: 0
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  color: 'rgba(0,0,0,.7)',
                  marginLeft: 10,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '120px',
                  fontWeight: 500, // slightly thicker font
                }}
              >
                {card.user!.full_name || card.user!.username}
              </span>
            </div>
            {/* Date anchored to the right extent of the shape */}
            {formattedDate && (
              <span
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 2,
                  fontSize: 10,
                  color: 'rgba(0,0,0,.5)'
                }}
              >
                {formattedDate}
              </span>
            )}
          </div>
        )}

        {/* Mix-blend-mode border effect for hover/selection */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            border: selectedCardId === card.id || hoveredId === card.id ? '4px solid rgba(0,0,0,.05)' : '2px solid rgba(0,0,0,.05)',
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
    columnCount,
  ])

  // Unique key for each card
  const itemKey = useCallback((data: any, index: number) => {
    // Use a stable string that won't collide across mode switches
    const id = data?.id
    const key = id != null ? `card:${String(id)}` : `idx:${String(index)}`
    if (id == null) {
      // itemKey fallback to index - no logging
    }
    return key
  }, [])

  const ready = active && measured.width > 0 && measured.height > 0
  const itemsFiltered = useMemo(() => {
    if (!ready) return []
    let filtered = (cards as any[]).filter((c) => c && typeof c === 'object')

    // In single column mode, sort chronologically (oldest first, so most recent at bottom)
    if (columnCount === 1) {
      filtered = filtered.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return dateA - dateB // ascending order (oldest first)
      })
    }

    return filtered
  }, [ready, cards, columnCount])

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