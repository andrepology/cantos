import { useEffect, useMemo, useRef, useState, memo, useCallback, useLayoutEffect } from 'react'
import type React from 'react'
import { stopEventPropagation } from 'tldraw'
import type { Card } from './types'
import { AnimatedDiv, Scrubber, interpolateTransform, useLayoutSprings } from './Scrubber'
import { computeResponsiveFont } from './typography'
import { ConnectionsPanelHost } from './ConnectionsPanelHost'
import { useConnectedChannels } from './useArenaChannel'
import { useGlobalPanelState } from '../jazz/usePanelState'
import { calculateReferenceDimensions, getGridSize, snapToGrid, selectLayoutMode, type LayoutMode, type ReferenceDimensions } from './layout'

// Ephemeral, in-memory scroll state. Avoids localStorage to play well with TLDraw.
type ScrollState = { rowX: number; colY: number; anchorId?: string; anchorFrac?: number; stackIndex?: number }
const deckScrollMemory = new Map<string, ScrollState>()

function computeDeckKey(cards: Card[]): string {
  if (!cards || cards.length === 0) return 'empty'
  // Keep the key short but stable: use length + first/last 10 ids
  const head = cards.slice(0, 10).map((c) => String((c as any).id ?? ''))
  const tail = cards.slice(-10).map((c) => String((c as any).id ?? ''))
  return `${cards.length}:${head.join('|')}::${tail.join('|')}`
}

export type ArenaDeckProps = {
  cards: Card[]
  width: number
  height: number
  // Optional channel title to show in mini mode
  channelTitle?: string
  // Optional reference dimensions to coordinate with other shapes
  referenceDimensions?: ReferenceDimensions
  // Optional hooks for TLDraw-integrated drag-out from a card
  onCardPointerDown?: (card: Card, size: { w: number; h: number }, e: React.PointerEvent) => void
  onCardPointerMove?: (card: Card, size: { w: number; h: number }, e: React.PointerEvent) => void
  onCardPointerUp?: (card: Card, size: { w: number; h: number }, e: React.PointerEvent) => void
  // Optional persistence plumbing for hosts (e.g., TLDraw shapes)
  initialPersist?: { anchorId?: string; anchorFrac?: number; rowX?: number; colY?: number; stackIndex?: number }
  onPersist?: (state: { anchorId?: string; anchorFrac?: number; rowX: number; colY: number; stackIndex?: number }) => void
  // Optional selection plumbing for hosts
  selectedCardId?: number
  onSelectCard?: (card: Card, rectCss: { left: number; top: number; right: number; bottom: number }) => void
  onSelectedCardRectChange?: (rectCss: { left: number; top: number; right: number; bottom: number }) => void
}

const ArenaDeckInner = function ArenaDeckInner({ cards, width, height, channelTitle, referenceDimensions, onCardPointerDown, onCardPointerMove, onCardPointerUp, initialPersist, onPersist, selectedCardId, onSelectCard, onSelectedCardRectChange }: ArenaDeckProps) {
  const reversedCards = useMemo(() => cards.slice().reverse(), [cards])
  const containerRef = useRef<HTMLDivElement>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const rowRef = useRef<HTMLDivElement>(null)
  const colRef = useRef<HTMLDivElement>(null)
  const wheelAccumRef = useRef(0)
  const wheelHideTimeoutRef = useRef<number | null>(null)
  const deckKey = useMemo(() => computeDeckKey(reversedCards), [reversedCards])
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [isScrubberVisible, setIsScrubberVisible] = useState(false)
  const selectedRectRafRef = useRef<number | null>(null)
  const [panelPosition, setPanelPosition] = useState<{ x: number; y: number } | null>(null)
  const [rightClickedCard, setRightClickedCard] = useState<Card | null>(null)
  const { setOpen } = useGlobalPanelState()

  const measureCardRectRelativeToContainer = useCallback((el: HTMLElement): { left: number; top: number; right: number; bottom: number } => {
    const c = containerRef.current
    const r = el.getBoundingClientRect()
    if (!c) return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    const cr = c.getBoundingClientRect()
    return { left: r.left - cr.left, top: r.top - cr.top, right: r.right - cr.left, bottom: r.bottom - cr.top }
  }, [])

  const scheduleSelectedRectUpdate = useCallback(() => {
    if (!onSelectedCardRectChange || selectedCardId == null) return
    if (selectedRectRafRef.current != null) return
    selectedRectRafRef.current = requestAnimationFrame(() => {
      selectedRectRafRef.current = null
      try {
        const c = containerRef.current
        if (!c) return
        const sel = c.querySelector(`[data-card-id="${String(selectedCardId)}"]`) as HTMLElement | null
        if (!sel) return
        const rect = measureCardRectRelativeToContainer(sel)
        onSelectedCardRectChange(rect)
      } catch {}
    })
  }, [onSelectedCardRectChange, selectedCardId, measureCardRectRelativeToContainer])

  // (moved below declarations to avoid TDZ)

  // Debounce incoming size to reduce re-layout jitter during resize
  const [vw, setVw] = useState(width)
  const [vh, setVh] = useState(height)
  useEffect(() => {
    const id = setTimeout(() => {
      setVw(width)
      setVh(height)
    }, 80)
    return () => clearTimeout(id)
  }, [width, height])

  const count = reversedCards.length

  // Grid snapping utilities - match TLDraw's grid system
  const gridSize = getGridSize()
  const gap = snapToGrid(12, gridSize)

  type Mode = LayoutMode
  const [layoutMode, setLayoutMode] = useState<Mode>('stack')
  useEffect(() => {
    const next = selectLayoutMode(vw, vh)
    if (next !== layoutMode) {
      // Before switching modes, capture the current anchor and raw scroll so we can restore accurately.
      try {
        if (layoutMode === 'row' && rowRef.current) {
          const container = rowRef.current
          const x = container.scrollLeft
          const prev = deckScrollMemory.get(deckKey) || { rowX: 0, colY: 0 }
          deckScrollMemory.set(deckKey, { ...prev, rowX: x })
          // Inline anchor capture for row axis
          const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-card-id]'))
          if (cards.length > 0) {
            const crect = container.getBoundingClientRect()
            const cStart = crect.left
            const cEnd = crect.right
            let chosen: HTMLElement | null = null
            let bestVisibleRatio = -1
            for (const el of cards) {
              const r = el.getBoundingClientRect()
              const start = r.left
              const end = r.right
              const size = r.width
              const whollyVisible = start >= cStart && end <= cEnd && size > 0
              if (whollyVisible) {
                chosen = el
                break
              }
              const visible = Math.max(0, Math.min(end, cEnd) - Math.max(start, cStart))
              const ratio = size > 0 ? visible / size : 0
              if (ratio > bestVisibleRatio) {
                bestVisibleRatio = ratio
                chosen = el
              }
            }
            if (chosen) {
              const rr = chosen.getBoundingClientRect()
              const fraction = Math.max(0, Math.min(1, (rr.left - cStart) / Math.max(1, crect.width)))
              const anchorId = chosen.getAttribute('data-card-id') || undefined
              const prev2 = deckScrollMemory.get(deckKey) || { rowX: 0, colY: 0 }
              const nextState = { ...prev2, anchorId, anchorFrac: fraction }
              deckScrollMemory.set(deckKey, nextState)
              if (onPersist) onPersist({ anchorId: nextState.anchorId, anchorFrac: nextState.anchorFrac, rowX: nextState.rowX, colY: nextState.colY, stackIndex: nextState.stackIndex })
            }
          }
        } else if ((layoutMode === 'column' || layoutMode === 'grid') && colRef.current) {
          const container = colRef.current
          const y = container.scrollTop
          const prev = deckScrollMemory.get(deckKey) || { rowX: 0, colY: 0 }
          deckScrollMemory.set(deckKey, { ...prev, colY: y })
          // Inline anchor capture for column axis
          const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-card-id]'))
          if (cards.length > 0) {
            const crect = container.getBoundingClientRect()
            const cStart = crect.top
            const cEnd = crect.bottom
            let chosen: HTMLElement | null = null
            let bestVisibleRatio = -1
            for (const el of cards) {
              const r = el.getBoundingClientRect()
              const start = r.top
              const end = r.bottom
              const size = r.height
              const whollyVisible = start >= cStart && end <= cEnd && size > 0
              if (whollyVisible) {
                chosen = el
                break
              }
              const visible = Math.max(0, Math.min(end, cEnd) - Math.max(start, cStart))
              const ratio = size > 0 ? visible / size : 0
              if (ratio > bestVisibleRatio) {
                bestVisibleRatio = ratio
                chosen = el
              }
            }
            if (chosen) {
              const rr = chosen.getBoundingClientRect()
              const fraction = Math.max(0, Math.min(1, (rr.top - cStart) / Math.max(1, crect.height)))
              const anchorId = chosen.getAttribute('data-card-id') || undefined
              const prev2 = deckScrollMemory.get(deckKey) || { rowX: 0, colY: 0 }
              const nextState = { ...prev2, anchorId, anchorFrac: fraction }
              deckScrollMemory.set(deckKey, nextState)
              if (onPersist) onPersist({ anchorId: nextState.anchorId, anchorFrac: nextState.anchorFrac, rowX: nextState.rowX, colY: nextState.colY, stackIndex: nextState.stackIndex })
            }
          }
        } else if (layoutMode === 'stack' || layoutMode === 'mini') {
          const prev = deckScrollMemory.get(deckKey) || { rowX: 0, colY: 0 }
          const centerCard = reversedCards[currentIndex]
          const nextState = {
            ...prev,
            stackIndex: currentIndex,
            anchorId: centerCard ? String((centerCard as any).id ?? '') : prev.anchorId,
            anchorFrac: 0.5,
          }
          deckScrollMemory.set(deckKey, nextState)
          if (onPersist) onPersist({ anchorId: nextState.anchorId, anchorFrac: nextState.anchorFrac, rowX: nextState.rowX, colY: nextState.colY, stackIndex: nextState.stackIndex })
        }
      } catch {}
      setLayoutMode(next)
    }
  }, [vw, vh, layoutMode, rowRef, colRef, deckKey, currentIndex, reversedCards, onPersist])

  // Square stage size (deck area) with scrubber reserved height in stack mode
  const scrubberHeight = 48
  const stackStageOffset = 24
  const stageSide = useMemo(() => {
    const availableH = layoutMode === 'stack' ? Math.max(0, vh - scrubberHeight) : vh
    return Math.max(0, Math.min(vw, availableH))
  }, [vw, vh, layoutMode])

  // Mini mode: render at a comfortable design size and scale to fit
  const miniDesignSide = 280
  const miniScale = useMemo(() => {
    if (layoutMode !== 'mini') return 1
    const scale = Math.min(vw / Math.max(1, miniDesignSide), vh / Math.max(1, miniDesignSide))
    return Math.max(0.45, Math.min(1, scale))
  }, [layoutMode, vw, vh])

  // Base per-card bounding size inside the stage (square) - snapped to grid
  // Use reference dimensions if provided (for cross-shape coordination), otherwise calculate from container
  const baseCardDimensions = referenceDimensions || calculateReferenceDimensions(width, height, layoutMode)

  // Apply layout-aware dimension coordination
  let cardW = baseCardDimensions.cardW
  let cardH = baseCardDimensions.cardH

  if (referenceDimensions && layoutMode !== baseCardDimensions.layoutMode) {
    // We're using reference dimensions from a different layout mode
    // Apply layout-specific coordination rules
    if (layoutMode === 'row' && baseCardDimensions.layoutMode === 'stack') {
      // Row mode: maintain square aspect ratio by using deck's dimensions for both W and H
      cardW = baseCardDimensions.cardH // Use deck's height for both dimensions (square)
      cardH = baseCardDimensions.cardH // Use deck's height for both dimensions (square)
    } else if (layoutMode === 'column' && baseCardDimensions.layoutMode === 'stack') {
      // Column mode: match deck's card width, maintain square aspect ratio for non-images
      cardW = baseCardDimensions.cardW // Match deck's width
      cardH = cardW // Maintain square aspect ratio for channels and text cards
    }
    // For stack/mini modes, use the reference dimensions directly
  }
  // Grid mode uses compact tiles irrespective of reference dimensions
  if (layoutMode === 'grid') {
    const compact = snapToGrid(160, gridSize)
    cardW = compact
    cardH = compact
  }

  const spacerW = Math.max(0, snapToGrid(Math.round(cardW / 2), gridSize))
  const spacerH = Math.max(0, snapToGrid(Math.round(cardH / 2), gridSize))
  const paddingRowTB = snapToGrid(48, gridSize)
  const paddingRowLR = snapToGrid(24, gridSize)
  const paddingColTB = snapToGrid(24, gridSize)
  const paddingColLR = snapToGrid(24, gridSize)
  // Tabs layout sizing (compact)
  const tabHeight = snapToGrid(12, gridSize)
  const paddingTabsTB = snapToGrid(4, gridSize)
  const paddingTabsLR = snapToGrid(10, gridSize)
  const tabGap = snapToGrid(8, gridSize)

  // Content extents for row/column modes (kept for potential transitions later)
  // const contentWidth = count * cardW + Math.max(0, count - 1) * gap
  // const contentHeight = count * cardH + Math.max(0, count - 1) * gap
  // Precomputed extents (kept if needed in future transitions)
  // const spanX = Math.max(0, contentWidth - vw)
  // const spanY = Math.max(0, contentHeight - vh)

  // Track previous mode for potential future transitions
  const prevModeRef = useRef<typeof layoutMode>(layoutMode)
  useEffect(() => {
    if (prevModeRef.current !== layoutMode) {
      prevModeRef.current = layoutMode
    }
  }, [layoutMode])

  // Seed memory from host-provided persisted state when first seen for this deck key
  useEffect(() => {
    if (!deckScrollMemory.has(deckKey) && initialPersist) {
      const prev = { rowX: 0, colY: 0 }
      deckScrollMemory.set(deckKey, { ...prev, ...initialPersist })
    }
  }, [deckKey, initialPersist])

  // Springs only for stack layout
  const stackDepth = 6
  const stackBaseIndex = currentIndex
  const stackCards = layoutMode === 'stack' || layoutMode === 'mini' ? reversedCards.slice(stackBaseIndex, Math.min(reversedCards.length, stackBaseIndex + stackDepth + 1)) : []
  const stackKeys = useMemo(() => stackCards.map((c) => c.id), [stackCards])
  // Slightly snappier springs for brief transitions when index changes
  const springConfig = useMemo(() => ({ tension: 560, friction: 30 }), [])
  const getTarget = useCallback(
    (i: number) => {
      // i is offset from currentIndex (0 is top card)
      const d = i
      const depth = Math.max(0, d)
      const visible = d >= 0 && d <= stackDepth
      // Exponential opacity falloff for depth; gentle fade
      const opacityFalloff = Math.exp(-0.35 * depth)
      // Slight scale reduction per depth to give a light sense of depth
      const scaleFalloff = Math.pow(0.975, depth)
      return {
        x: snapToGrid(0, gridSize),
        y: snapToGrid(-d * (10 - d * 0.5), gridSize),
        rot: 0,
        scale: scaleFalloff,
        opacity: visible ? opacityFalloff : 0,
        zIndex: visible ? 1000 - d : 0,
      }
    },
    [stackDepth, gridSize, snapToGrid]
  )
  const springs = useLayoutSprings(stackKeys, (i) => getTarget(i), springConfig)

  // Aspect cache to mirror row/column's intrinsic sizing robustness
  const aspectByIdRef = useRef<Map<number, number>>(new Map())
  const [aspectVersion, setAspectVersion] = useState(0)

  const getAspectFromMetadata = useCallback((card: Card): number | null => {
    if (card.type === 'image') {
      const dims = (card as any).originalDimensions
      if (dims?.width && dims?.height && dims.width > 0 && dims.height > 0) return dims.width / dims.height
    }
    if (card.type === 'media') {
      const html = (card as any).embedHtml as string
      if (html) {
        try {
          const mw = html.match(/\bwidth\s*=\s*"?(\d+)/i)
          const mh = html.match(/\bheight\s*=\s*"?(\d+)/i)
          const ow = mw ? parseFloat(mw[1]) : NaN
          const oh = mh ? parseFloat(mh[1]) : NaN
          if (Number.isFinite(ow) && Number.isFinite(oh) && ow > 0 && oh > 0) return ow / oh
        } catch {}
      }
    }
    return null
  }, [])

  const ensureAspect = useCallback((card: Card) => {
    const map = aspectByIdRef.current
    if (map.has(card.id)) return
    const meta = getAspectFromMetadata(card)
    if (meta && Number.isFinite(meta)) {
      map.set(card.id, meta)
      return
    }
    // Load an image to infer; try best available url
    let src: string | undefined
    if (card.type === 'image') src = (card as any).url
    else if (card.type === 'media') src = (card as any).thumbnailUrl
    else if (card.type === 'link') src = (card as any).imageUrl
    if (!src) return
    try {
      const img = new Image()
      img.decoding = 'async' as any
      img.loading = 'eager' as any
      img.onload = () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          const r = img.naturalWidth / img.naturalHeight
          map.set(card.id, r)
          setAspectVersion((v) => v + 1)
        }
      }
      img.src = src
    } catch {}
  }, [getAspectFromMetadata])

  // Compute intrinsic-sized card container within square bounds for stack layout - with grid snapping
  const getCardSizeWithinSquare = useCallback(
    (card: Card): { w: number; h: number } => {
      // Trigger async aspect discovery if needed
      ensureAspect(card)

      // Default square - already snapped to grid
      let w = cardW
      let h = cardH

      // Prefer cached or metadata-derived aspect
      let r: number | null = aspectByIdRef.current.get(card.id) ?? getAspectFromMetadata(card)
      if (!r && card.type === 'media') {
        // Fallback to 16:9 for media
        r = 16 / 9
      }

      if (r && Number.isFinite(r) && r > 0) {
        if (r >= 1) {
          w = cardW
          h = Math.min(cardH, snapToGrid(Math.round(cardW / Math.max(0.0001, r)), gridSize))
        } else {
          h = cardH
          w = Math.min(cardW, snapToGrid(Math.round(cardH * r), gridSize))
        }
      }
      return { w: snapToGrid(w, gridSize), h: snapToGrid(h, gridSize) }
    },
    [cardW, cardH, ensureAspect, getAspectFromMetadata, aspectVersion, gridSize]
  )

  const cardStyleStaticBase: React.CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transformOrigin: 'center',
    background: '#fff',
    border: '1px solid rgba(0,0,0,.08)',
    boxShadow: '0 6px 18px rgba(0,0,0,.08)',
    borderRadius: 8,
    userSelect: 'none',
    touchAction: 'none',
    pointerEvents: 'auto',
    willChange: 'transform',
    backfaceVisibility: 'hidden',
    overflow: 'hidden',
    // @ts-expect-error - vendor style
    WebkitUserDrag: 'none',
  }

  // Keep selected card rect in sync with layout/size/aspect changes
  useEffect(() => {
    scheduleSelectedRectUpdate()
  }, [scheduleSelectedRectUpdate, layoutMode, vw, vh, aspectVersion, selectedCardId, reversedCards])

  const MemoEmbed = useMemo(
    () =>
      memo(function MemoEmbedInner({ html }: { html: string }) {
        const ref = useRef<HTMLDivElement>(null)
        useEffect(() => {
          const el = ref.current
          if (!el) return
          const iframes = el.querySelectorAll('iframe')
          iframes.forEach((f) => {
            const fr = f as HTMLIFrameElement
            fr.style.width = '100%'
            fr.style.height = '100%'
            try {
              ;(fr as any).loading = 'lazy'
            } catch {}

            // Allow common features used by providers like YouTube/Vimeo to avoid
            // noisy "Potential permissions policy violation" warnings in devtools.
            // Note: Top-level HTTP headers can still override this. This just grants
            // permission from our embedding document to the iframe.
            const allowDirectives = [
              'accelerometer',
              'autoplay',
              'clipboard-write',
              'encrypted-media',
              'gyroscope',
              'picture-in-picture',
              'web-share',
            ]
            try {
              fr.setAttribute('allow', allowDirectives.join('; '))
              fr.setAttribute('allowfullscreen', '')
              // Reduce referrer leakage; optional but good hygiene for embeds
              if (!fr.getAttribute('referrerpolicy')) fr.setAttribute('referrerpolicy', 'origin-when-cross-origin')
            } catch {}
          })
        }, [html])
        return <div ref={ref} style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }} dangerouslySetInnerHTML={{ __html: html }} />
      }),
    []
  )

  // Use shared responsive font utility

  const CardView = useMemo(
    () =>
      memo(function CardView({ card, compact, sizeHint }: { card: Card; compact: boolean; sizeHint?: { w: number; h: number } }) {
        const font = useMemo(() => {
          if (!sizeHint) return { fontSizePx: 14, lineHeight: 1.5 }
          return computeResponsiveFont({ width: sizeHint.w, height: sizeHint.h, compact })
        }, [sizeHint, compact])
        switch (card.type) {
          case 'image':
            return <img src={card.url} alt={card.title} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
          case 'text':
            return (
              <div data-card-text="true" style={{ padding: 16, color: 'rgba(0,0,0,.7)', fontSize: font.fontSizePx, lineHeight: font.lineHeight, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}>{(card as any).content}</div>
            )
          case 'link':
            return (
              <div
                style={{ width: '100%', height: '100%', position: 'relative' }}
                onMouseEnter={(e) => {
                  const hoverEl = e.currentTarget.querySelector('[data-interactive="link-hover"]') as HTMLElement
                  if (hoverEl && (card as any).url) {
                    hoverEl.style.opacity = '1'
                    hoverEl.style.background = 'rgba(255, 255, 255, 0.95)'
                    hoverEl.style.borderColor = 'rgba(229, 229, 229, 1)'
                  }
                }}
                onMouseLeave={(e) => {
                  const hoverEl = e.currentTarget.querySelector('[data-interactive="link-hover"]') as HTMLElement
                  if (hoverEl && (card as any).url) {
                    hoverEl.style.opacity = '0'
                    hoverEl.style.background = 'rgba(255, 255, 255, 0.9)'
                    hoverEl.style.borderColor = '#e5e5e5'
                  }
                }}
              >
                {(card as any).imageUrl ? (
                  <img
                    src={(card as any).imageUrl}
                    alt={card.title}
                    loading="lazy"
                    decoding="async"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block'
                    }}
                  />
                ) : null}
                {card.url ? (
                  <a
                    data-interactive="link-hover"
                    href={card.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      position: 'absolute',
                      bottom: 8,
                      left: 8,
                      right: 8,
                      height: 32,
                      background: 'rgba(255, 255, 255, 0.9)',
                      border: '1px solid #e5e5e5',
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 8px',
                      cursor: 'pointer',
                      fontSize: 11,
                      color: 'rgba(0,0,0,.6)',
                      gap: 6,
                      opacity: 0,
                      transition: 'all 0.2s ease',
                      pointerEvents: 'auto',
                      textDecoration: 'none'
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      window.open(card.url, '_blank', 'noopener,noreferrer')
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                    }}
                    onPointerUp={(e) => {
                      e.stopPropagation()
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="2" y1="12" x2="22" y2="12"></line>
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                    </svg>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {card.title}
                    </span>
                  </a>
                ) : null}
              </div>
            )
          case 'media':
            return (card as any).embedHtml ? (
              <MemoEmbed html={(card as any).embedHtml} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'rgba(0,0,0,.4)' }}>media</div>
            )
          default: {
            // Fallback renderer. Also handles 'channel' cards not included in older unions.
            if ((card as any)?.type === 'channel') {
              const baseTypo = sizeHint ? computeResponsiveFont({ width: sizeHint.w, height: sizeHint.h, compact }) : { fontSizePx: 14, lineHeight: 1.45 }
              const titleSize = Math.round(baseTypo.fontSizePx * 1.25)
              const metaSize = Math.max(11, Math.round(baseTypo.fontSizePx * 0.9))
              const authorName = (card as any)?.user?.full_name || (card as any)?.user?.username || ''
              const blocks = (card as any)?.length as number | undefined
              const updatedAt = (card as any)?.updatedAt as string | undefined
              const channelStatus = (card as any)?.status || (card as any)?.visibility
              const isOpen = (card as any)?.open

              const updatedAgo = (() => {
                if (!updatedAt) return null
                const d = Date.parse(updatedAt)
                if (Number.isNaN(d)) return null
                const diffMs = Date.now() - d
                const mins = Math.floor(diffMs / 60000)
                if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`
                const hours = Math.floor(mins / 60)
                if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
                const days = Math.floor(hours / 24)
                return `about ${days} day${days === 1 ? '' : 's'} ago`
              })()

              // Determine border color based on channel status
              const getBorderColor = () => {
                if (channelStatus === 'private' || (!isOpen && channelStatus !== 'public')) {
                  return '#ef4444' // Red for private channels
                } else if (channelStatus === 'public' || isOpen) {
                  return '#22c55e' // Green for public/open channels
                }
                return '#e5e5e5' // Default grey for other/unknown status
              }

              return (
                <div style={{ width: '100%', height: '100%', borderRadius: 8, display: 'grid', placeItems: 'center', padding: 12 }}>
                  <div style={{ textAlign: 'center', maxWidth: '100%', width: '100%' }}>
                    <div style={{ fontSize: titleSize, lineHeight: baseTypo.lineHeight, fontWeight: 700, color: 'rgba(0,0,0,.86)', marginBottom: compact ? 0 : 4, overflow: 'hidden', wordBreak: 'break-word' }}>{(card as any).title}</div>
                    {!compact && authorName ? <div style={{ fontSize: metaSize, lineHeight: 1.35, color: 'rgba(0,0,0,.6)', marginBottom: 6 }}>by {authorName}</div> : null}
                    {!compact ? (
                      <div style={{ fontSize: metaSize, lineHeight: 1.35, color: 'rgba(0,0,0,.55)' }}>
                        {typeof blocks === 'number' ? `${blocks} block${blocks === 1 ? '' : 's'}` : '—'}
                        {updatedAgo ? <span> • {updatedAgo}</span> : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            }
            return null
          }
        }
      }),
    [MemoEmbed, computeResponsiveFont]
  )

  // Helpers for CSS-only intrinsic sizing in row/column modes
  const isImageLike = useCallback((card: Card) => {
    if (card.type === 'image') return true
    if (card.type === 'link' && (card as any).imageUrl) return true
    if (card.type === 'media' && (card as any).thumbnailUrl && !(card as any).embedHtml) return true
    return false
  }, [])

  const IntrinsicPreview = useMemo(
    () =>
      memo(function IntrinsicPreview({ card, mode }: { card: Card; mode: 'row' | 'column' }) {
        const imgSrc = card.type === 'image' ? (card as any).url : card.type === 'link' ? (card as any).imageUrl : (card as any).thumbnailUrl
        if (!imgSrc) return null
        return (
          <img
            src={imgSrc}
            alt={card.title}
            loading="lazy"
            decoding="async"
            style={
              mode === 'row'
                ? { height: '100%', width: 'auto', objectFit: 'contain', display: 'block' }
                : { width: '100%', height: 'auto', objectFit: 'contain', display: 'block' }
            }
          />
        )
      }),
    []
  )

  // Simple helper to measure the container at pointer time
  const measureTarget = useCallback((e: React.PointerEvent): { w: number; h: number } => {
    const el = e.currentTarget as HTMLElement
    const r = el.getBoundingClientRect()
    return { w: r.width, h: r.height }
  }, [])

  // Tiny shared guard to distinguish drag-out from click selection
  const dragOutGuardRef = useRef(false)
  const suppressClickIfDragged = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    if (dragOutGuardRef.current) {
      try { (e as any).preventDefault?.() } catch {}
      try { (e as any).stopPropagation?.() } catch {}
      dragOutGuardRef.current = false
      return true
    }
    return false
  }, [])

  // Handle right-click on cards
  const handleCardContextMenu = useCallback((e: React.MouseEvent, card: Card) => {
    e.preventDefault()
    e.stopPropagation()

    if (card.type === 'channel') {
      const targetRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      setPanelPosition({ x: targetRect.right + 8, y: targetRect.top })
      setRightClickedCard(card)
      setOpen(true)
    }
  }, [setOpen])

  // Get connections for the right-clicked channel card
  const channelSlug = rightClickedCard?.type === 'channel' ? rightClickedCard.slug : undefined
  const { loading: connectionsLoading, error: connectionsError, connections } = useConnectedChannels(channelSlug, !!channelSlug)
  const connectionsForPanel = useMemo(() => {
    return connections.map((c) => ({
      id: Number(c.id),
      title: (c as any).title || (c as any).slug,
      slug: (c as any).slug,
      author: (c as any).user?.full_name || (c as any).user?.username,
    }))
  }, [connections])

  // Persist and restore current stack index across view changes
  const setIndex = useCallback(
    (nextIndex: number) => {
      setCurrentIndex(nextIndex)
      const nextCard = reversedCards[nextIndex]
      const prev = deckScrollMemory.get(deckKey) || { rowX: 0, colY: 0 }
      // Also seed anchor so that switching to row/column centers roughly on the same card
      const next = {
        ...prev,
        stackIndex: nextIndex,
        anchorId: nextCard ? String((nextCard as any).id ?? '') : prev.anchorId,
        anchorFrac: 0.5,
      }
      deckScrollMemory.set(deckKey, next)
      if (onPersist) onPersist({ anchorId: next.anchorId, anchorFrac: next.anchorFrac, rowX: next.rowX, colY: next.colY, stackIndex: next.stackIndex })
    },
    [deckKey, reversedCards, onPersist]
  )

  useEffect(() => {
    wheelAccumRef.current = 0
    if (layoutMode !== 'stack' && wheelHideTimeoutRef.current != null) {
      window.clearTimeout(wheelHideTimeoutRef.current)
      wheelHideTimeoutRef.current = null
    }
    if (layoutMode !== 'stack' && isScrubberVisible) {
      setIsScrubberVisible(false)
    }
  }, [layoutMode, deckKey, isScrubberVisible])

  useEffect(() => {
    return () => {
      if (wheelHideTimeoutRef.current != null) {
        window.clearTimeout(wheelHideTimeoutRef.current)
        wheelHideTimeoutRef.current = null
      }
    }
  }, [])

  // Helpers for anchor-based scroll preservation between modes and size changes
  type Axis = 'row' | 'column'
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
  const escapeAttrValue = (val: string) => val.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

  const saveAnchorFromContainer = useCallback(
    (container: HTMLDivElement, axis: Axis) => {
      const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-card-id]'))
      if (cards.length === 0) return
      const crect = container.getBoundingClientRect()
      const cStart = axis === 'row' ? crect.left : crect.top
      const cEnd = axis === 'row' ? crect.right : crect.bottom

      let chosen: HTMLElement | null = null
      let bestVisibleRatio = -1
      for (const el of cards) {
        const r = el.getBoundingClientRect()
        const start = axis === 'row' ? r.left : r.top
        const end = axis === 'row' ? r.right : r.bottom
        const size = axis === 'row' ? r.width : r.height
        const whollyVisible = start >= cStart && end <= cEnd && size > 0
        if (whollyVisible) {
          chosen = el
          break
        }
        // Fallback: pick the most visible one if none are wholly visible
        const visible = Math.max(0, Math.min(end, cEnd) - Math.max(start, cStart))
        const ratio = size > 0 ? visible / size : 0
        if (ratio > bestVisibleRatio) {
          bestVisibleRatio = ratio
          chosen = el
        }
      }
      if (!chosen) return
      const rr = chosen.getBoundingClientRect()
      const fraction = clamp(((axis === 'row' ? rr.left : rr.top) - cStart) / (axis === 'row' ? crect.width : crect.height), 0, 1)
      const anchorId = chosen.getAttribute('data-card-id') || undefined

      const prev = deckScrollMemory.get(deckKey) || { rowX: 0, colY: 0 }
      const next = { ...prev, anchorId, anchorFrac: fraction }
      deckScrollMemory.set(deckKey, next)
      if (onPersist) onPersist({ anchorId: next.anchorId, anchorFrac: next.anchorFrac, rowX: next.rowX, colY: next.colY, stackIndex: next.stackIndex })
    },
    [deckKey, onPersist]
  )

  // Throttle anchor computation to once per animation frame during scroll
  const anchorRafRef = useRef<number | null>(null)
  const lastUserActivityAtRef = useRef<number>(0)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const resizeDebounceRef = useRef<number | null>(null)
  const scheduleSaveAnchor = useCallback(
    (container: HTMLDivElement, axis: Axis) => {
      if (anchorRafRef.current != null) return
      anchorRafRef.current = requestAnimationFrame(() => {
        anchorRafRef.current = null
        saveAnchorFromContainer(container, axis)
      })
    },
    [saveAnchorFromContainer]
  )

  const restoreUsingAnchor = useCallback(
    (container: HTMLDivElement, axis: Axis, fallbackScroll: number) => {
      const state = deckScrollMemory.get(deckKey)
      if (!container) return
      const anchorId = state?.anchorId
      const anchorFrac = state?.anchorFrac
      if (anchorId && typeof anchorFrac === 'number') {
        const selector = `[data-card-id="${escapeAttrValue(String(anchorId))}"]`
        const anchorEl = container.querySelector(selector) as HTMLElement | null
        if (anchorEl) {
          // Use the saved fraction of the viewport to position the anchor consistently
          const target = axis === 'row'
            ? anchorEl.offsetLeft - anchorFrac * container.clientWidth
            : anchorEl.offsetTop - anchorFrac * container.clientHeight
          if (axis === 'row') container.scrollLeft = clamp(target, 0, Math.max(0, container.scrollWidth - container.clientWidth))
          else container.scrollTop = clamp(target, 0, Math.max(0, container.scrollHeight - container.clientHeight))
          return
        }
      }
      // Fallback to previous raw scroll if no anchor available
      if (axis === 'row') container.scrollLeft = fallbackScroll
      else container.scrollTop = fallbackScroll
    },
    [deckKey]
  )

  // Restore scroll on mount and whenever layout changes (pre-paint)
  useLayoutEffect(() => {
    const state = deckScrollMemory.get(deckKey)
    if (layoutMode === 'row') {
      const x = state?.rowX ?? 0
      const el = rowRef.current
      if (el)
        requestAnimationFrame(() => {
          if (!rowRef.current) return
          restoreUsingAnchor(rowRef.current, 'row', x)
        })
    } else if (layoutMode === 'column' || layoutMode === 'grid') {
      const y = state?.colY ?? 0
      const el = colRef.current
      if (el)
        requestAnimationFrame(() => {
          if (!colRef.current) return
          restoreUsingAnchor(colRef.current, 'column', y)
        })
    } else if (layoutMode === 'stack' || layoutMode === 'mini') {
      // Restore currentIndex using stored stackIndex or anchorId
      const storedIndex = state?.stackIndex
      let targetIndex = typeof storedIndex === 'number' ? storedIndex : undefined
      if (typeof targetIndex !== 'number' || targetIndex < 0 || targetIndex >= reversedCards.length) {
        const anchorId = state?.anchorId
        if (anchorId) {
          const idx = reversedCards.findIndex((c) => String((c as any).id ?? '') === String(anchorId))
          if (idx >= 0) targetIndex = idx
        }
      }
      if (typeof targetIndex !== 'number' || targetIndex < 0 || targetIndex >= reversedCards.length) {
        targetIndex = 0
      }
      if (targetIndex !== currentIndex) {
        setCurrentIndex(targetIndex)
      }
    }
  }, [layoutMode, deckKey, reversedCards, currentIndex, restoreUsingAnchor])

  // Observe container size changes and re-apply anchor-based restore when the user is idle
  useEffect(() => {
    const now = () => Date.now()
    const isUserActive = (thresholdMs = 200) => now() - lastUserActivityAtRef.current < thresholdMs
    const state = deckScrollMemory.get(deckKey)
    const axis: Axis | null = layoutMode === 'row' || layoutMode === 'tabs' ? 'row' : (layoutMode === 'column' || layoutMode === 'grid') ? 'column' : null
    const container = axis === 'row' ? rowRef.current : axis === 'column' ? colRef.current : null

    if (!axis || !container) {
      if (resizeObserverRef.current) {
        try { resizeObserverRef.current.disconnect() } catch {}
        resizeObserverRef.current = null
      }
      if (resizeDebounceRef.current != null) {
        window.clearTimeout(resizeDebounceRef.current)
        resizeDebounceRef.current = null
      }
      return
    }

    const ro = new ResizeObserver(() => {
      if (resizeDebounceRef.current != null) {
        window.clearTimeout(resizeDebounceRef.current)
      }
      resizeDebounceRef.current = window.setTimeout(() => {
        resizeDebounceRef.current = null
        if (isUserActive()) return
        const fallback = axis === 'row' ? (state?.rowX ?? 0) : (state?.colY ?? 0)
        restoreUsingAnchor(container, axis, fallback)
      }, 100)
    })
    ro.observe(container)
    resizeObserverRef.current = ro

    return () => {
      try { ro.disconnect() } catch {}
      if (resizeDebounceRef.current != null) {
        window.clearTimeout(resizeDebounceRef.current)
        resizeDebounceRef.current = null
      }
      if (resizeObserverRef.current === ro) resizeObserverRef.current = null
    }
  }, [layoutMode, deckKey, restoreUsingAnchor])

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      lastUserActivityAtRef.current = Date.now()
      if ((layoutMode !== 'stack' && layoutMode !== 'mini') || count <= 1) return
      if (e.ctrlKey) return

      const textScroller = (e.target as HTMLElement | null)?.closest('[data-card-text="true"]') as HTMLElement | null
      if (textScroller) {
        const maxScroll = textScroller.scrollHeight - textScroller.clientHeight
        if (maxScroll > 0) {
          const epsilon = 1
          const scrollingDown = e.deltaY > 0
          const canScrollDown = textScroller.scrollTop < maxScroll - epsilon
          const canScrollUp = textScroller.scrollTop > epsilon
          if ((scrollingDown && canScrollDown) || (!scrollingDown && canScrollUp)) {
            wheelAccumRef.current = 0
            return
          }
        }
      }

      e.preventDefault()
      e.stopPropagation()

      const stageFallback = Math.max(vw, vh, 240)
      const stage = layoutMode === 'mini' ? miniDesignSide * miniScale : stageSide || stageFallback
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? stage : 1
      const delta = -e.deltaY * unit
      if (!Number.isFinite(delta) || delta === 0) return

      const threshold = 45
      let accum = wheelAccumRef.current + delta
      const steps = accum > 0 ? Math.floor(accum / threshold) : Math.ceil(accum / threshold)

      if (steps !== 0) {
        const nextIndex = clamp(currentIndex + steps, 0, count - 1)
        if (nextIndex !== currentIndex) {
          setIndex(nextIndex)
          accum -= steps * threshold
        } else {
          accum = 0
        }
      }

      wheelAccumRef.current = accum

      if (layoutMode === 'stack') {
        setIsScrubberVisible(true)
        if (wheelHideTimeoutRef.current != null) {
          window.clearTimeout(wheelHideTimeoutRef.current)
        }
        wheelHideTimeoutRef.current = window.setTimeout(() => {
          setIsScrubberVisible(false)
          wheelHideTimeoutRef.current = null
        }, 900)
      }
    },
    [layoutMode, count, stackCards, miniDesignSide, miniScale, stageSide, vw, vh, currentIndex, setIndex]
  )

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width, height, overflow: layoutMode === 'mini' ? 'visible' : 'hidden', pointerEvents: 'auto', background: 'transparent', cursor: 'default', touchAction: 'none', display: 'flex', flexDirection: 'column' }}
      onDragStart={(e) => {
        e.preventDefault()
      }}
      onMouseEnter={() => layoutMode === 'stack' && setIsScrubberVisible(true)}
      onMouseLeave={() => layoutMode === 'stack' && setIsScrubberVisible(false)}
      onWheelCapture={handleWheel}
    >
      {layoutMode === 'stack' ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: stageSide, height: stageSide, marginTop: stackStageOffset }}>
            {stackKeys.map((key, i) => {
              const spring = springs[i]
              if (!spring) return null
              const z = 1000 - i
              const card = stackCards[i]
              const { w: sizedW, h: sizedH } = getCardSizeWithinSquare(card)
              const isMediaLike = card.type === 'image' || card.type === 'media'
              const cardStyleStatic: React.CSSProperties = {
                ...cardStyleStaticBase,
                width: sizedW,
                height: sizedH,
                background: isMediaLike ? 'transparent' : cardStyleStaticBase.background,
                border: isMediaLike ? 'none' : cardStyleStaticBase.border,
                boxShadow: isMediaLike ? 'none' : cardStyleStaticBase.boxShadow,
                borderRadius: isMediaLike ? 0 : (cardStyleStaticBase.borderRadius as number),
              }
              return (
                <AnimatedDiv
                  data-interactive="card"
                  data-card-id={String(card.id)}
                  key={key}
                  style={{
                    ...cardStyleStatic,
                    outline:
                      selectedCardId === (card as any).id
                        ? '2px solid rgba(0,0,0,.6)'
                        : hoveredId === (card as any).id
                        ? '2px solid rgba(0,0,0,.25)'
                        : 'none',
                    outlineOffset: 0,
                    transform: interpolateTransform((spring as any).x, (spring as any).y, (spring as any).rot, (spring as any).scale),
                    opacity: (spring as any).opacity,
                    zIndex: z,
                  }}
                  onMouseEnter={() => setHoveredId((card as any).id)}
                  onMouseLeave={() => setHoveredId((prev) => (prev === (card as any).id ? null : prev))}
                  onContextMenu={(e) => handleCardContextMenu(e, card)}
                  onClick={(e) => {
                    if (suppressClickIfDragged(e)) return
                    stopEventPropagation(e)
                    setIndex(stackBaseIndex + i)
                    if (onSelectCard) {
                      const el = e.currentTarget as HTMLElement
                      const rect = measureCardRectRelativeToContainer(el)
                      onSelectCard(card, rect)
                    }
                  }}
                onPointerDown={(e) => {
                  stopEventPropagation(e)
                  dragOutGuardRef.current = false
                  const size = measureTarget(e)
                  if (onCardPointerDown) onCardPointerDown(card, size, e)
                }}
                onPointerMove={(e) => {
                  stopEventPropagation(e)
                  dragOutGuardRef.current = true
                  const size = measureTarget(e)
                  if (onCardPointerMove) onCardPointerMove(card, size, e)
                }}
                onPointerUp={(e) => {
                  stopEventPropagation(e)
                  const size = measureTarget(e)
                  if (onCardPointerUp) onCardPointerUp(card, size, e)
                }}
                >
                  <div style={{ width: '100%', height: '100%', pointerEvents: 'auto', display: 'flex', flexDirection: 'column' }}>
                    <CardView card={card} compact={sizedW < 180} sizeHint={{ w: sizedW, h: sizedH }} />
                  </div>
                </AnimatedDiv>
              )
            })}
          </div>
        </div>
      ) : layoutMode === 'mini' ? (
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          {channelTitle ? (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: miniDesignSide * miniScale,
                textAlign: 'center',
                pointerEvents: 'none',
                color: 'rgba(0,0,0,.75)',
                fontWeight: 700,
                letterSpacing: '-0.0125em',
                // Scale with mini deck so it remains visible at any size
                fontSize: Math.max(10, Math.round(14 * miniScale)),
                lineHeight: 1.2,
                // Word-only wrapping, avoid letter-level breaking
                whiteSpace: 'normal',
                wordBreak: 'normal',
                overflowWrap: 'normal',
                padding: '0 32px',
                // Keep it on top
                zIndex: 9999
              }}
            >
              {channelTitle}
            </div>
          ) : null}
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: miniDesignSide, height: miniDesignSide, transform: `translate(-50%, -50%) scale(${miniScale})`, transformOrigin: 'center', perspective: 500, perspectiveOrigin: '50% 60%', overflow: 'visible' }}>
            <div style={{ position: 'absolute', inset: 0, transform: 'rotateX(16deg) rotateZ(-10deg)', transformStyle: 'preserve-3d', overflow: 'visible' }}>
              {stackKeys.map((key, i) => {
                const spring = springs[i]
                if (!spring) return null
                const z = 1000 - i
                const card = stackCards[i]
                const { w: sizedW, h: sizedH } = getCardSizeWithinSquare(card)
                const isMediaLike = card.type === 'image' || card.type === 'media'
                const cardStyleStatic: React.CSSProperties = {
                  ...cardStyleStaticBase,
                  width: sizedW,
                  height: sizedH,
                  background: isMediaLike ? 'transparent' : cardStyleStaticBase.background,
                  border: isMediaLike ? 'none' : cardStyleStaticBase.border,
                  boxShadow: isMediaLike ? 'none' : cardStyleStaticBase.boxShadow,
                  borderRadius: isMediaLike ? 0 : (cardStyleStaticBase.borderRadius as number),
                  overflow: layoutMode === 'mini' ? (isMediaLike ? 'hidden' : 'visible') : (cardStyleStaticBase as any).overflow,
                }
                return (
                  <AnimatedDiv
                    data-interactive="card"
                    data-card-id={String(card.id)}
                    key={key}
                    style={{
                      ...cardStyleStatic,
                      outline:
                        selectedCardId === (card as any).id
                          ? '2px solid rgba(0,0,0,.6)'
                          : hoveredId === (card as any).id
                          ? '2px solid rgba(0,0,0,.25)'
                          : 'none',
                      outlineOffset: 0,
                      transform: interpolateTransform((spring as any).x, (spring as any).y, (spring as any).rot, (spring as any).scale),
                      opacity: (spring as any).opacity,
                      zIndex: z,
                    }}
                    onMouseEnter={() => setHoveredId((card as any).id)}
                    onMouseLeave={() => setHoveredId((prev) => (prev === (card as any).id ? null : prev))}
                    onContextMenu={(e) => handleCardContextMenu(e, card)}
                    onClick={(e) => {
                      if (suppressClickIfDragged(e)) return
                      stopEventPropagation(e)
                      setIndex(stackBaseIndex + i)
                      if (onSelectCard) {
                        const el = e.currentTarget as HTMLElement
                        const rect = measureCardRectRelativeToContainer(el)
                        onSelectCard(card, rect)
                      }
                    }}
                  onPointerDown={(e) => {
                    stopEventPropagation(e)
                    dragOutGuardRef.current = false
                    const size = measureTarget(e)
                    if (onCardPointerDown) onCardPointerDown(card, size, e)
                  }}
                  onPointerMove={(e) => {
                    stopEventPropagation(e)
                    dragOutGuardRef.current = true
                    const size = measureTarget(e)
                    if (onCardPointerMove) onCardPointerMove(card, size, e)
                  }}
                  onPointerUp={(e) => {
                    stopEventPropagation(e)
                    const size = measureTarget(e)
                    if (onCardPointerUp) onCardPointerUp(card, size, e)
                  }}
                  >
                    <div style={{ width: '100%', height: '100%', pointerEvents: 'auto', display: 'flex', flexDirection: 'column' }}>
                      <CardView card={card} compact={sizedW < 180} sizeHint={{ w: sizedW, h: sizedH }} />
                    </div>
                  </AnimatedDiv>
                )
              })}
            </div>
          </div>
        </div>
      ) : layoutMode === 'row' ? (
        <div
          ref={rowRef}
          style={{ position: 'absolute', inset: 0, overflowX: 'auto', overflowY: 'hidden', display: 'flex', alignItems: 'center', gap, padding: `${paddingRowTB}px ${paddingRowLR}px`, overscrollBehavior: 'contain' }}
          onWheelCapture={(e) => {
            lastUserActivityAtRef.current = Date.now()
            // Allow native scrolling but prevent the event from bubbling to the canvas.
            // If ctrlKey is pressed, we let the event bubble up to be handled for zooming.
            if (e.ctrlKey) return
            e.stopPropagation()
          }}
          onScroll={(e) => {
            lastUserActivityAtRef.current = Date.now()
            const x = (e.currentTarget as HTMLDivElement).scrollLeft
            const prev = deckScrollMemory.get(deckKey)
            deckScrollMemory.set(deckKey, { rowX: x, colY: prev?.colY ?? 0, anchorId: prev?.anchorId, anchorFrac: prev?.anchorFrac })
            scheduleSaveAnchor(e.currentTarget as HTMLDivElement, 'row')
            scheduleSelectedRectUpdate()
          }}
        >
          {/* Removed spacer: rely on container padding for whitespace */}
          {reversedCards.map((card) => {
            const imageLike = isImageLike(card)
            const baseStyle: React.CSSProperties = imageLike
              ? {
                  height: cardH,
                  width: 'auto', // Allow width to scale to preserve aspect ratio
                  flex: '0 0 auto',
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
                  flex: '0 0 auto',
                  background: '#fff',
                  border: '1px solid rgba(0,0,0,.08)',
                  boxShadow: '0 6px 18px rgba(0,0,0,.08)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }
            return (
              <div
                key={card.id}
                data-interactive="card"
                data-card-id={String(card.id)}
                style={{
                  ...baseStyle,
                  outline:
                    selectedCardId === (card as any).id
                      ? '2px solid rgba(0,0,0,.6)'
                      : hoveredId === (card as any).id
                      ? '2px solid rgba(0,0,0,.25)'
                      : 'none',
                  outlineOffset: 0,
                }}
                onMouseEnter={() => setHoveredId((card as any).id)}
                onMouseLeave={() => setHoveredId((prev) => (prev === (card as any).id ? null : prev))}
                onContextMenu={(e) => handleCardContextMenu(e, card)}
                onPointerDown={(e) => {
                  stopEventPropagation(e)
                  dragOutGuardRef.current = false
                  const size = measureTarget(e)
                  if (onCardPointerDown) onCardPointerDown(card, size, e)
                }}
                onPointerMove={(e) => {
                  stopEventPropagation(e)
                  dragOutGuardRef.current = true
                  const size = measureTarget(e)
                  if (onCardPointerMove) onCardPointerMove(card, size, e)
                }}
                onPointerUp={(e) => {
                  stopEventPropagation(e)
                  const size = measureTarget(e)
                  if (onCardPointerUp) onCardPointerUp(card, size, e)
                }}
                onClick={(e) => {
                  if (suppressClickIfDragged(e)) return
                  stopEventPropagation(e)
                  if (!onSelectCard) return
                  const el = e.currentTarget as HTMLElement
                  const rect = measureCardRectRelativeToContainer(el)
                  onSelectCard(card, rect)
                }}
              >
                {imageLike ? <IntrinsicPreview card={card} mode="row" /> : <CardView card={card} compact={cardW < 180} sizeHint={{ w: cardW, h: cardH }} />}
              </div>
            )
          })}
          {/* Removed spacer: rely on container padding for whitespace */}
        </div>
      ) : layoutMode === 'tabs' ? (
        <div
          ref={rowRef}
          style={{ position: 'absolute', inset: 0, overflowX: 'auto', overflowY: 'hidden', display: 'flex', alignItems: 'center', gap: tabGap, padding: `${paddingTabsTB}px ${paddingTabsLR}px`, overscrollBehavior: 'contain', background: 'transparent' }}
          onWheelCapture={(e) => {
            lastUserActivityAtRef.current = Date.now()
            if ((e as any).ctrlKey) return
            ;(e as any).stopPropagation()
          }}
        >
          <div
            style={{
              flex: '0 0 auto',
              height: tabHeight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              position: 'relative',
              top: -1,
              

            }}
          >
            {/* channel icon is always a neutral grey square in tabs */}
            <div style={{ width: 12, height: 12, background: '#ffffff', border: '1.5px solid #d4d4d4', borderRadius: 2 }} />
            <div style={{ minWidth: 0, display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#333', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: 180, position: 'relative', top: -0.6 }}>
                {channelTitle || '—'}
              </span>
            </div>
          </div>
        </div>
      ) : layoutMode === 'grid' ? (
        <div
          ref={colRef}
          style={{ position: 'absolute', inset: 0, overflowX: 'hidden', overflowY: 'auto', display: 'grid', justifyContent: 'center', alignItems: 'start', gap, padding: `${paddingColTB}px 0`, overscrollBehavior: 'contain', gridTemplateColumns: `repeat(auto-fit, ${cardW}px)` }}
          onWheelCapture={(e) => {
            lastUserActivityAtRef.current = Date.now()
            if (e.ctrlKey) return
            e.stopPropagation()
          }}
          onScroll={(e) => {
            lastUserActivityAtRef.current = Date.now()
            const y = (e.currentTarget as HTMLDivElement).scrollTop
            const prev = deckScrollMemory.get(deckKey)
            deckScrollMemory.set(deckKey, { rowX: prev?.rowX ?? 0, colY: y, anchorId: prev?.anchorId, anchorFrac: prev?.anchorFrac })
            scheduleSaveAnchor(e.currentTarget as HTMLDivElement, 'column')
            scheduleSelectedRectUpdate()
          }}
        >
          {reversedCards.map((card) => {
            const imageLike = isImageLike(card)
            const baseStyle: React.CSSProperties = imageLike
              ? {
                  width: cardW,
                  height: 'auto',
                  maxWidth: cardW,
                  minHeight: cardH,
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
                  flexDirection: 'column',
                }
            return (
              <div
                key={card.id}
                data-interactive="card"
                data-card-id={String(card.id)}
                style={{
                  ...baseStyle,
                  outline:
                    selectedCardId === (card as any).id
                      ? '2px solid rgba(0,0,0,.6)'
                      : hoveredId === (card as any).id
                      ? '2px solid rgba(0,0,0,.25)'
                      : 'none',
                  outlineOffset: 0,
                }}
                onMouseEnter={() => setHoveredId((card as any).id)}
                onMouseLeave={() => setHoveredId((prev) => (prev === (card as any).id ? null : prev))}
                onContextMenu={(e) => handleCardContextMenu(e, card)}
                onPointerDown={(e) => {
                  stopEventPropagation(e)
                  dragOutGuardRef.current = false
                  const size = measureTarget(e)
                  if (onCardPointerDown) onCardPointerDown(card, size, e)
                }}
                onPointerMove={(e) => {
                  stopEventPropagation(e)
                  dragOutGuardRef.current = true
                  const size = measureTarget(e)
                  if (onCardPointerMove) onCardPointerMove(card, size, e)
                }}
                onPointerUp={(e) => {
                  stopEventPropagation(e)
                  const size = measureTarget(e)
                  if (onCardPointerUp) onCardPointerUp(card, size, e)
                }}
                onClick={(e) => {
                  if (suppressClickIfDragged(e)) return
                  stopEventPropagation(e)
                  if (!onSelectCard) return
                  const el = e.currentTarget as HTMLElement
                  const rect = measureCardRectRelativeToContainer(el)
                  onSelectCard(card, rect)
                }}
              >
                {imageLike ? <IntrinsicPreview card={card} mode="column" /> : <CardView card={card} compact={cardW < 180} sizeHint={{ w: cardW, h: cardH }} />}
              </div>
            )
          })}
        </div>
      ) : (
        <div
          ref={colRef}
          style={{ position: 'absolute', inset: 0, overflowX: 'hidden', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap, padding: `${paddingColTB}px ${paddingColLR}px`, overscrollBehavior: 'contain' }}
          onWheelCapture={(e) => {
            lastUserActivityAtRef.current = Date.now()
            // Allow native scrolling but prevent the event from bubbling to the canvas.
            // If ctrlKey is pressed, we let the event bubble up to be handled for zooming.
            if (e.ctrlKey) return
            e.stopPropagation()
          }}
          onScroll={(e) => {
            lastUserActivityAtRef.current = Date.now()
            const y = (e.currentTarget as HTMLDivElement).scrollTop
            const prev = deckScrollMemory.get(deckKey)
            deckScrollMemory.set(deckKey, { rowX: prev?.rowX ?? 0, colY: y, anchorId: prev?.anchorId, anchorFrac: prev?.anchorFrac })
            scheduleSaveAnchor(e.currentTarget as HTMLDivElement, 'column')
            scheduleSelectedRectUpdate()
          }}
        >
          {/* Removed spacer: rely on container padding for whitespace */}
          {reversedCards.map((card) => {
            const columnW = Math.min(cardW, Math.max(0, vw - paddingColLR * 2))
            const imageLike = isImageLike(card)
            const baseStyle: React.CSSProperties = imageLike
              ? {
                  width: columnW,
                  height: 'auto',
                  flex: '0 0 auto',
                  background: '#fff',
                  border: '1px solid rgba(0,0,0,.08)',
                  boxShadow: '0 6px 18px rgba(0,0,0,.08)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                }
              : {
                  width: columnW,
                  height: cardH,
                  flex: '0 0 auto',
                  background: '#fff',
                  border: '1px solid rgba(0,0,0,.08)',
                  boxShadow: '0 6px 18px rgba(0,0,0,.08)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }
            return (
              <div
                key={card.id}
                data-interactive="card"
                data-card-id={String(card.id)}
                style={{
                  ...baseStyle,
                  outline:
                    selectedCardId === (card as any).id
                      ? '2px solid rgba(0,0,0,.6)'
                      : hoveredId === (card as any).id
                      ? '2px solid rgba(0,0,0,.25)'
                      : 'none',
                  outlineOffset: 0,
                }}
                onMouseEnter={() => setHoveredId((card as any).id)}
                onMouseLeave={() => setHoveredId((prev) => (prev === (card as any).id ? null : prev))}
                onContextMenu={(e) => handleCardContextMenu(e, card)}
                onPointerDown={(e) => {
                  stopEventPropagation(e)
                  dragOutGuardRef.current = false
                  const size = measureTarget(e)
                  if (onCardPointerDown) onCardPointerDown(card, size, e)
                }}
                onPointerMove={(e) => {
                  stopEventPropagation(e)
                  dragOutGuardRef.current = true
                  const size = measureTarget(e)
                  if (onCardPointerMove) onCardPointerMove(card, size, e)
                }}
                onPointerUp={(e) => {
                  stopEventPropagation(e)
                  const size = measureTarget(e)
                  if (onCardPointerUp) onCardPointerUp(card, size, e)
                }}
                onClick={(e) => {
                  if (suppressClickIfDragged(e)) return
                  stopEventPropagation(e)
                  if (!onSelectCard) return
                  const el = e.currentTarget as HTMLElement
                  const rect = measureCardRectRelativeToContainer(el)
                  onSelectCard(card, rect)
                }}
              >
                {imageLike ? <IntrinsicPreview card={card} mode="column" /> : <CardView card={card} compact={columnW < 180} sizeHint={{ w: columnW, h: cardH }} />}
              </div>
            )
          })}
          {/* Removed spacer: rely on container padding for whitespace */}
        </div>
      )}

      {layoutMode === 'stack' ? (
        <div 
          style={{ 
            flex: '0 0 auto', 
            height: scrubberHeight, 
            display: 'flex', 
            alignItems: 'center',
            transform: `translateY(${isScrubberVisible ? '0' : '8px'})`,
            opacity: isScrubberVisible ? 1 : 0,
            transition: isScrubberVisible 
              ? `transform 280ms cubic-bezier(0.25, 1, 0.5, 1) 30ms, opacity 280ms cubic-bezier(0.4, 0, 0.2, 1)`
              : `transform 250ms cubic-bezier(0.4, 0, 0.6, 1), opacity 250ms cubic-bezier(0.4, 0, 0.6, 1)`,
            pointerEvents: isScrubberVisible ? 'auto' : 'none'
          }}
        >
          <Scrubber count={count} index={currentIndex} onChange={setIndex} width={width} />
        </div>
      ) : null}

      {rightClickedCard && panelPosition ? (
        <ConnectionsPanelHost
          screenX={panelPosition.x}
          screenY={panelPosition.y}
          widthPx={260}
          maxHeightPx={320}
          title={(rightClickedCard as any)?.title}
          authorName={(rightClickedCard as any)?.user?.full_name || (rightClickedCard as any)?.user?.username}
          createdAt={(rightClickedCard as any)?.createdAt}
          updatedAt={(rightClickedCard as any)?.updatedAt}
          loading={connectionsLoading}
          error={connectionsError}
          connections={connectionsForPanel}
        />
      ) : null}
    </div>
  )
}

ArenaDeckInner.displayName = 'ArenaDeck'

export const ArenaDeck = memo(ArenaDeckInner)


