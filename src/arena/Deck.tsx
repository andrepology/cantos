import { useEffect, useMemo, useRef, useState } from 'react'
import { animated, useSprings, to } from '@react-spring/web'
import { stopEventPropagation } from 'tldraw'
import type { Card } from './types'

export type ArenaDeckProps = {
  cards: Card[]
  width: number
  height: number
}

type Vec = { x: number; y: number }

export function ArenaDeck({ cards, width, height }: ArenaDeckProps) {
  const [goneIds, setGoneIds] = useState<Set<number>>(new Set())
  const [drag, setDrag] = useState<{ id: number; start: Vec; cur: Vec } | null>(null)
  const [isInside, setIsInside] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const visible = useMemo(() => cards.filter((c) => !goneIds.has(c.id)).slice(0, 12), [cards, goneIds])
  const threshold = Math.max(40, width * 0.25)

  const baseRot = (idx: number) => idx * 4 - 8
  const cardW = Math.min(300, width * 0.9)
  const cardH = Math.min(300, height * 0.9)

  const [springs, api] = useSprings(visible.length, (i) => ({
    x: 0,
    y: 0,
    rot: baseRot(i),
    scale: 1,
    config: { tension: 500, friction: 40 },
  }))

  // Re-initialize springs when the visible stack changes length
  useEffect(() => {
    api.start((i) => ({ x: 0, y: 0, rot: baseRot(i), scale: 1, immediate: true }))
  }, [visible.length, api])

  const startDrag = (id: number, e: React.PointerEvent) => {
    stopEventPropagation(e)
    e.preventDefault()
    setDrag({ id, start: { x: e.clientX, y: e.clientY }, cur: { x: e.clientX, y: e.clientY } })
  }

  const moveDrag = (e: React.PointerEvent) => {
    if (!drag) return
    stopEventPropagation(e)
    e.preventDefault()
    const cur = { x: e.clientX, y: e.clientY }
    setDrag((d) => (d ? { ...d, cur } : d))
    const dx = cur.x - drag.start.x
    const dy = cur.y - drag.start.y
    const idx = visible.findIndex((c) => c.id === drag.id)
    if (idx >= 0) {
      api.start((i) =>
        i === idx
          ? { x: dx, y: dy, rot: (dx / width) * 12, scale: 1.03, immediate: true }
          : { x: 0, y: 0, rot: baseRot(i), scale: 1, immediate: true }
      )
    }
  }

  const endDrag = (e?: React.PointerEvent) => {
    if (e) {
      stopEventPropagation(e)
      e.preventDefault()
    }
    if (!drag) return
    const dx = drag.cur.x - drag.start.x
    const dy = drag.cur.y - drag.start.y
    const dist = Math.hypot(dx, dy)
    const idx = visible.findIndex((c) => c.id === drag.id)
    if (dist > threshold) {
      setGoneIds((s) => new Set(s).add(drag.id))
    } else if (idx >= 0) {
      api.start((i) =>
        i === idx
          ? { x: 0, y: 0, rot: baseRot(i), scale: 1 }
          : { x: 0, y: 0, rot: baseRot(i), scale: 1 }
      )
    }
    setDrag(null)
  }

  const cardStyleStatic: React.CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: cardW,
    height: cardH,
    transformOrigin: 'center',
    background: '#fff',
    border: '1px solid rgba(0,0,0,.08)',
    boxShadow: '0 2px 8px rgba(0,0,0,.06)',
    borderRadius: 8,
    userSelect: 'none',
    touchAction: 'none',
    pointerEvents: 'auto',
  }

  // End drag even if the pointer is released outside the container
  useEffect(() => {
    if (!drag) return
    const onWinUp = () => {
      // call React handler compatibly
      endDrag()
    }
    window.addEventListener('pointerup', onWinUp)
    window.addEventListener('pointercancel', onWinUp)
    return () => {
      window.removeEventListener('pointerup', onWinUp)
      window.removeEventListener('pointercancel', onWinUp)
    }
  }, [drag])

  const render = (c: Card) => {
    switch (c.type) {
      case 'image':
        return <img src={c.url} alt={c.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      case 'text':
        return (
          <div style={{ padding: 16, color: 'rgba(0,0,0,.7)', fontSize: 14, lineHeight: 1.4, overflow: 'auto' }}>{c.content}</div>
        )
      case 'link':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
            {c.imageUrl ? (
              <img src={c.imageUrl} alt={c.title} style={{ width: '100%', height: '65%', objectFit: 'cover' }} />
            ) : null}
            <div style={{ padding: 12, color: 'rgba(0,0,0,.7)' }}>
              <div style={{ fontSize: 14 }}>{c.title}</div>
              {c.provider ? <div style={{ fontSize: 12, opacity: 0.6 }}>{c.provider}</div> : null}
            </div>
          </div>
        )
      case 'media':
        return c.embedHtml ? (
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }} dangerouslySetInnerHTML={{ __html: c.embedHtml }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'rgba(0,0,0,.4)' }}>media</div>
        )
    }
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width, height, overflow: 'hidden', pointerEvents: 'auto', background: 'transparent', cursor: drag ? 'grabbing' : isInside ? 'grab' : 'default' }}
      onPointerEnter={(e) => {
        setIsInside(true)
        stopEventPropagation(e)
      }}
      onPointerLeave={(e) => {
        setIsInside(false)
        stopEventPropagation(e)
        // optional: drop when leaving
        endDrag()
      }}
      onPointerDown={(e) => {
        // container-level stop to prevent tldraw shape interactions
        stopEventPropagation(e)
      }}
      onPointerMove={(e) => moveDrag(e)}
      onPointerUp={(e) => endDrag(e)}
    >
      {visible.map((c, i) => {
        const spring = springs[i]
        if (!spring) return null
        return (
          <animated.div
            key={c.id}
            style={{
              ...cardStyleStatic,
              transform: to([spring.x, spring.y, spring.rot, spring.scale], (x, y, r, s) => `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${r}deg) scale(${s})`),
            }}
            onPointerDown={(e) => startDrag(c.id, e)}
            onPointerMove={(e) => moveDrag(e)}
            onPointerUp={(e) => endDrag(e)}
          >
            {/* Content should not capture its own events while dragging */}
            <div style={{ width: '100%', height: '100%', pointerEvents: drag ? 'none' : 'auto' }}>
              {render(c)}
            </div>
          </animated.div>
        )
      })}
    </div>
  )
}


