import { useEffect, useMemo, useRef, useState, memo, useCallback } from 'react'
import type React from 'react'
import { stopEventPropagation } from 'tldraw'
import type { Card } from './types'
import { AnimatedDiv, Scrubber, interpolateTransform, useLayoutSprings } from './Scrubber'

export type ArenaDeckProps = {
  cards: Card[]
  width: number
  height: number
  // Optional hooks for TLDraw-integrated drag-out from a card
  onCardPointerDown?: (card: Card, size: { w: number; h: number }, e: React.PointerEvent) => void
  onCardPointerMove?: (card: Card, size: { w: number; h: number }, e: React.PointerEvent) => void
  onCardPointerUp?: (card: Card, size: { w: number; h: number }, e: React.PointerEvent) => void
}

export function ArenaDeck({ cards, width, height, onCardPointerDown, onCardPointerMove, onCardPointerUp }: ArenaDeckProps) {
  const reversedCards = useMemo(() => cards.slice().reverse(), [cards])
  const containerRef = useRef<HTMLDivElement>(null)
  const [currentIndex, setCurrentIndex] = useState(0)

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

  // Consistent card size across layouts: fit into the smaller dimension with margin
  const cardW = Math.min(320, Math.max(60, Math.min(vw, vh) * 0.9))
  const cardH = cardW // keep square for consistency across layouts

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

  // Springs only for stack layout
  const stackDepth = 6
  const stackBaseIndex = currentIndex
  const stackCards = layoutMode === 'stack' ? reversedCards.slice(stackBaseIndex, Math.min(reversedCards.length, stackBaseIndex + stackDepth + 1)) : []
  const stackKeys = useMemo(() => stackCards.map((c) => c.id), [stackCards])
  const springConfig = useMemo(() => ({ tension: 500, friction: 42 }), [])
  const getTarget = useCallback(
    (i: number) => {
      // i is offset from currentIndex
      const d = i
      const visible = d >= 0 && d <= stackDepth
      return {
        x: 0,
        y: -d * 2,
        rot: 0,
        scale: 1 - Math.max(0, d) * 0.02,
        opacity: visible ? 1 : 0,
        zIndex: visible ? 1000 - d : 0,
      }
    },
    [stackDepth]
  )
  const springs = useLayoutSprings(stackKeys, (i) => getTarget(i), springConfig)

  const cardStyleStatic: React.CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: cardW,
    height: cardH,
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
            return <img src={card.url} alt={card.title} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
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
    return { w: Math.round(r.width), h: Math.round(r.height) }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width, height, overflow: 'hidden', pointerEvents: 'auto', background: 'transparent', cursor: 'default', touchAction: 'none' }}
      onDragStart={(e) => {
        e.preventDefault()
      }}
    >
      {layoutMode === 'stack' ? (
        stackKeys.map((key, i) => {
          const spring = springs[i]
          if (!spring) return null
          const z = 1000 - i
          const card = stackCards[i]
          return (
            <AnimatedDiv
              key={key}
              style={{
                ...cardStyleStatic,
                transform: interpolateTransform((spring as any).x, (spring as any).y, (spring as any).rot, (spring as any).scale),
                opacity: (spring as any).opacity,
                zIndex: z,
              }}
              onClick={(e) => {
                stopEventPropagation(e)
                setCurrentIndex(stackBaseIndex + i)
              }}
              onPointerDown={(e) => {
                stopEventPropagation(e)
                if (onCardPointerDown) onCardPointerDown(card, { w: cardW, h: cardH }, e)
              }}
              onPointerMove={(e) => {
                stopEventPropagation(e)
                if (onCardPointerMove) onCardPointerMove(card, { w: cardW, h: cardH }, e)
              }}
              onPointerUp={(e) => {
                stopEventPropagation(e)
                if (onCardPointerUp) onCardPointerUp(card, { w: cardW, h: cardH }, e)
              }}
            >
              <div style={{ width: '100%', height: '100%', pointerEvents: 'auto', display: 'flex', flexDirection: 'column' }}>
                <CardView card={card} compact={cardW < 180} />
              </div>
            </AnimatedDiv>
          )
        })
      ) : layoutMode === 'row' ? (
        <div
          style={{ position: 'absolute', inset: 0, overflowX: 'auto', overflowY: 'hidden', display: 'flex', alignItems: 'center', gap, padding: 12, overscrollBehavior: 'contain' }}
          onPointerDown={(e) => stopEventPropagation(e)}
          onPointerMove={(e) => stopEventPropagation(e)}
          onPointerUp={(e) => stopEventPropagation(e)}
          onWheelCapture={(e) => {
            // Allow native scrolling but prevent the event from bubbling to the canvas.
            // If ctrlKey is pressed, we let the event bubble up to be handled for zooming.
            if (e.ctrlKey) return
            e.stopPropagation()
          }}
        >
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
        </div>
      ) : (
        <div
          style={{ position: 'absolute', inset: 0, overflowX: 'hidden', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap, padding: 12, overscrollBehavior: 'contain' }}
          onPointerDown={(e) => stopEventPropagation(e)}
          onPointerMove={(e) => stopEventPropagation(e)}
          onPointerUp={(e) => stopEventPropagation(e)}
          onWheelCapture={(e) => {
            // Allow native scrolling but prevent the event from bubbling to the canvas.
            // If ctrlKey is pressed, we let the event bubble up to be handled for zooming.
            if (e.ctrlKey) return
            e.stopPropagation()
          }}
        >
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
        </div>
      )}

      {layoutMode === 'stack' ? (
        <Scrubber count={count} index={currentIndex} onChange={setCurrentIndex} width={width} />
      ) : null}
    </div>
  )
}


