import { useEffect, useMemo, useRef, useState, memo, useCallback } from 'react'
import type React from 'react'
import { stopEventPropagation } from 'tldraw'
import type { Card } from './types'
import { AnimatedDiv, Scrubber, interpolateTransform, useLayoutSprings } from './Scrubber'

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
  // Optional hooks for TLDraw-integrated drag-out from a card
  onCardPointerDown?: (card: Card, size: { w: number; h: number }, e: React.PointerEvent) => void
  onCardPointerMove?: (card: Card, size: { w: number; h: number }, e: React.PointerEvent) => void
  onCardPointerUp?: (card: Card, size: { w: number; h: number }, e: React.PointerEvent) => void
  // Optional persistence plumbing for hosts (e.g., TLDraw shapes)
  initialPersist?: { anchorId?: string; anchorFrac?: number; rowX?: number; colY?: number; stackIndex?: number }
  onPersist?: (state: { anchorId?: string; anchorFrac?: number; rowX: number; colY: number; stackIndex?: number }) => void
}

export function ArenaDeck({ cards, width, height, onCardPointerDown, onCardPointerMove, onCardPointerUp, initialPersist, onPersist }: ArenaDeckProps) {
  const reversedCards = useMemo(() => cards.slice().reverse(), [cards])
  const containerRef = useRef<HTMLDivElement>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const rowRef = useRef<HTMLDivElement>(null)
  const colRef = useRef<HTMLDivElement>(null)
  const deckKey = useMemo(() => computeDeckKey(reversedCards), [reversedCards])

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
  const gap = 12

  type Mode = 'stack' | 'row' | 'column'
  const [layoutMode, setLayoutMode] = useState<Mode>('stack')
  useEffect(() => {
    const ar = vw / Math.max(1, vh)
    const ROW_ENTER = 1.6
    const ROW_EXIT = 1.45
    const COL_ENTER = 0.625
    const COL_EXIT = 0.69
    let next: Mode = layoutMode
    if (layoutMode === 'row') {
      if (ar < ROW_EXIT) next = ar <= COL_ENTER ? 'column' : 'stack'
    } else if (layoutMode === 'column') {
      if (ar > COL_EXIT) next = ar >= ROW_ENTER ? 'row' : 'stack'
    } else {
      if (ar >= ROW_ENTER) next = 'row'
      else if (ar <= COL_ENTER) next = 'column'
    }
    if (next !== layoutMode) setLayoutMode(next)
  }, [vw, vh, layoutMode])

  // Square stage size (deck area) with scrubber reserved height in stack mode
  const scrubberHeight = 48
  const stageSide = useMemo(() => {
    const availableH = layoutMode === 'stack' ? Math.max(0, vh - scrubberHeight) : vh
    return Math.max(0, Math.min(vw, availableH))
  }, [vw, vh, layoutMode])

  // Base per-card bounding size inside the stage (square)
  const cardW = Math.min(320, Math.max(60, stageSide * 0.9))
  const cardH = cardW
  const spacerW = Math.max(0, Math.round(cardW / 2))
  const spacerH = Math.max(0, Math.round(cardH / 2))
  const paddingRowTB = 24
  const paddingRowLR = 12
  const paddingColTB = 12
  const paddingColLR = 24

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
  const stackCards = layoutMode === 'stack' ? reversedCards.slice(stackBaseIndex, Math.min(reversedCards.length, stackBaseIndex + stackDepth + 1)) : []
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
      const scaleFalloff = Math.pow(0.985, depth)
      return {
        x: 0,
        y: -d * 2,
        rot: 0,
        scale: scaleFalloff,
        opacity: visible ? opacityFalloff : 0,
        zIndex: visible ? 1000 - d : 0,
      }
    },
    [stackDepth]
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

  // Compute intrinsic-sized card container within square bounds for stack layout
  const getCardSizeWithinSquare = useCallback(
    (card: Card): { w: number; h: number } => {
      // Trigger async aspect discovery if needed
      ensureAspect(card)

      // Default square
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
          h = Math.min(cardH, Math.round(cardW / Math.max(0.0001, r)))
        } else {
          h = cardH
          w = Math.min(cardW, Math.round(cardH * r))
        }
      }
      return { w, h }
    },
    [cardW, cardH, ensureAspect, getAspectFromMetadata, aspectVersion]
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

  const CardView = useMemo(
    () =>
      memo(function CardView({ card, compact }: { card: Card; compact: boolean }) {
        switch (card.type) {
          case 'image':
            return <img src={card.url} alt={card.title} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
          case 'text':
            return (
              <div style={{ padding: 16, color: 'rgba(0,0,0,.7)', fontSize: 14, lineHeight: 1.5, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}>{(card as any).content}</div>
            )
          case 'link':
            return (
              <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden' }}>
                {(card as any).imageUrl ? (
                  <img src={(card as any).imageUrl} alt={card.title} loading="lazy" decoding="async" style={{ width: '100%', height: '65%', objectFit: 'cover', flexShrink: 0 }} />
                ) : null}
                <div style={{ padding: 12, color: 'rgba(0,0,0,.7)', overflow: 'hidden' }}>
                  <div style={{ fontSize: 14 }}>{card.title}</div>
                  {(card as any).provider ? <div style={{ fontSize: 12, opacity: 0.6 }}>{(card as any).provider}</div> : null}
                </div>
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
              const authorName = (card as any)?.user?.full_name || (card as any)?.user?.username || ''
              const blocks = (card as any)?.length as number | undefined
              const updatedAt = (card as any)?.updatedAt as string | undefined
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
              return (
                <div style={{ width: '100%', height: '100%', border: '1px solid #e5e5e5', boxShadow: 'inset 0 0 0 2px #f3f3f3', borderRadius: 2, display: 'grid', placeItems: 'center', padding: 12 }}>
                  <div style={{ textAlign: 'center', maxWidth: '100%', width: '100%' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'rgba(0,0,0,.86)', marginBottom: compact ? 0 : 4, overflow: 'hidden', wordBreak: 'break-word' }}>{(card as any).title}</div>
                    {!compact && authorName ? <div style={{ fontSize: 12, color: 'rgba(0,0,0,.6)', marginBottom: 6 }}>by {authorName}</div> : null}
                    {!compact ? (
                      <div style={{ fontSize: 12, color: 'rgba(0,0,0,.55)' }}>
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
    [MemoEmbed, cardW]
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
          const target = (axis === 'row'
            ? anchorEl.offsetLeft - anchorFrac * container.clientWidth
            : anchorEl.offsetTop - anchorFrac * container.clientHeight)
          if (axis === 'row') {
            container.scrollLeft = clamp(target, 0, Math.max(0, container.scrollWidth - container.clientWidth))
          } else {
            container.scrollTop = clamp(target, 0, Math.max(0, container.scrollHeight - container.clientHeight))
          }
          return
        }
      }
      // Fallback to previous raw scroll if no anchor available
      if (axis === 'row') container.scrollLeft = fallbackScroll
      else container.scrollTop = fallbackScroll
    },
    [deckKey]
  )

  // Restore scroll on mount and whenever layout or size changes
  useEffect(() => {
    const state = deckScrollMemory.get(deckKey)
    if (layoutMode === 'row') {
      const x = state?.rowX ?? 0
      const el = rowRef.current
      if (el)
        requestAnimationFrame(() => {
          if (!rowRef.current) return
          restoreUsingAnchor(rowRef.current, 'row', x)
        })
    } else if (layoutMode === 'column') {
      const y = state?.colY ?? 0
      const el = colRef.current
      if (el)
        requestAnimationFrame(() => {
          if (!colRef.current) return
          restoreUsingAnchor(colRef.current, 'column', y)
        })
    } else if (layoutMode === 'stack') {
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
  }, [layoutMode, deckKey, cardW, cardH, reversedCards, currentIndex, restoreUsingAnchor])

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width, height, overflow: 'hidden', pointerEvents: 'auto', background: 'transparent', cursor: 'default', touchAction: 'none', display: 'flex', flexDirection: 'column' }}
      onDragStart={(e) => {
        e.preventDefault()
      }}
    >
      {layoutMode === 'stack' ? (
        <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center' }}>
          <div style={{ position: 'relative', width: stageSide, height: stageSide }}>
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
                    transform: interpolateTransform((spring as any).x, (spring as any).y, (spring as any).rot, (spring as any).scale),
                    opacity: (spring as any).opacity,
                    zIndex: z,
                  }}
                  onClick={(e) => {
                    stopEventPropagation(e)
                    setIndex(stackBaseIndex + i)
                  }}
                onPointerDown={(e) => {
                  stopEventPropagation(e)
                  const size = measureTarget(e)
                  if (onCardPointerDown) onCardPointerDown(card, size, e)
                }}
                onPointerMove={(e) => {
                  stopEventPropagation(e)
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
                    <CardView card={card} compact={sizedW < 180} />
                  </div>
                </AnimatedDiv>
              )
            })}
          </div>
        </div>
      ) : layoutMode === 'row' ? (
        <div
          ref={rowRef}
          style={{ position: 'absolute', inset: 0, overflowX: 'auto', overflowY: 'hidden', display: 'flex', alignItems: 'center', gap, padding: `${paddingRowTB}px ${paddingRowLR}px`, overscrollBehavior: 'contain' }}
          onWheelCapture={(e) => {
            // Allow native scrolling but prevent the event from bubbling to the canvas.
            // If ctrlKey is pressed, we let the event bubble up to be handled for zooming.
            if (e.ctrlKey) return
            e.stopPropagation()
          }}
          onScroll={(e) => {
            const x = (e.currentTarget as HTMLDivElement).scrollLeft
            const prev = deckScrollMemory.get(deckKey)
            deckScrollMemory.set(deckKey, { rowX: x, colY: prev?.colY ?? 0, anchorId: prev?.anchorId, anchorFrac: prev?.anchorFrac })
            scheduleSaveAnchor(e.currentTarget as HTMLDivElement, 'row')
          }}
        >
          {/* Leading spacer for half-block whitespace */}
          <div style={{ flex: '0 0 auto', width: spacerW, height: 1 }} />
          {reversedCards.map((card) => {
            const imageLike = isImageLike(card)
            const baseStyle: React.CSSProperties = imageLike
              ? {
                  height: cardH,
                  width: 'auto',
                  flex: '0 0 auto',
                  background: '#fff',
                  border: '1px solid rgba(0,0,0,.08)',
                  boxShadow: '0 6px 18px rgba(0,0,0,.08)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  display: 'inline-flex',
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
                style={baseStyle}
                onPointerDown={(e) => {
                  stopEventPropagation(e)
                  const size = measureTarget(e)
                  if (onCardPointerDown) onCardPointerDown(card, size, e)
                }}
                onPointerMove={(e) => {
                  stopEventPropagation(e)
                  const size = measureTarget(e)
                  if (onCardPointerMove) onCardPointerMove(card, size, e)
                }}
                onPointerUp={(e) => {
                  stopEventPropagation(e)
                  const size = measureTarget(e)
                  if (onCardPointerUp) onCardPointerUp(card, size, e)
                }}
              >
                {imageLike ? <IntrinsicPreview card={card} mode="row" /> : <CardView card={card} compact={cardW < 180} />}
              </div>
            )
          })}
          {/* Trailing spacer for half-block whitespace */}
          <div style={{ flex: '0 0 auto', width: spacerW, height: 1 }} />
        </div>
      ) : (
        <div
          ref={colRef}
          style={{ position: 'absolute', inset: 0, overflowX: 'hidden', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap, padding: `${paddingColTB}px ${paddingColLR}px`, overscrollBehavior: 'contain' }}
          onWheelCapture={(e) => {
            // Allow native scrolling but prevent the event from bubbling to the canvas.
            // If ctrlKey is pressed, we let the event bubble up to be handled for zooming.
            if (e.ctrlKey) return
            e.stopPropagation()
          }}
          onScroll={(e) => {
            const y = (e.currentTarget as HTMLDivElement).scrollTop
            const prev = deckScrollMemory.get(deckKey)
            deckScrollMemory.set(deckKey, { rowX: prev?.rowX ?? 0, colY: y, anchorId: prev?.anchorId, anchorFrac: prev?.anchorFrac })
            scheduleSaveAnchor(e.currentTarget as HTMLDivElement, 'column')
          }}
        >
          {/* Leading spacer for half-block whitespace */}
          <div style={{ flex: '0 0 auto', width: 1, height: spacerH }} />
          {reversedCards.map((card) => {
            const imageLike = isImageLike(card)
            const baseStyle: React.CSSProperties = imageLike
              ? {
                  width: cardW,
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
                style={baseStyle}
                onPointerDown={(e) => {
                  stopEventPropagation(e)
                  const size = measureTarget(e)
                  if (onCardPointerDown) onCardPointerDown(card, size, e)
                }}
                onPointerMove={(e) => {
                  stopEventPropagation(e)
                  const size = measureTarget(e)
                  if (onCardPointerMove) onCardPointerMove(card, size, e)
                }}
                onPointerUp={(e) => {
                  stopEventPropagation(e)
                  const size = measureTarget(e)
                  if (onCardPointerUp) onCardPointerUp(card, size, e)
                }}
              >
                {imageLike ? <IntrinsicPreview card={card} mode="column" /> : <CardView card={card} compact={cardW < 180} />}
              </div>
            )
          })}
          {/* Trailing spacer for half-block whitespace */}
          <div style={{ flex: '0 0 auto', width: 1, height: spacerH }} />
        </div>
      )}

      {layoutMode === 'stack' ? (
        <div style={{ flex: '0 0 auto', height: scrubberHeight, display: 'flex', alignItems: 'center' }}>
          <Scrubber count={count} index={currentIndex} onChange={setIndex} width={width} />
        </div>
      ) : null}
    </div>
  )
}


