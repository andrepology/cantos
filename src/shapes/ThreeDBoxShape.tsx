import { BaseBoxShapeUtil, HTMLContainer, T, stopEventPropagation, createShapeId } from 'tldraw'
import type { TLBaseShape } from 'tldraw'
import { useEffect, useRef, useState } from 'react'
import { ArenaDeck } from '../arena/Deck'
import { ArenaUserChannelsIndex } from '../arena/ArenaUserChannelsIndex'
import { useArenaChannel, useArenaSearch } from '../arena/useArenaChannel'
import type { Card, SearchResult } from '../arena/types'

export type ThreeDBoxShape = TLBaseShape<
  '3d-box',
  {
    w: number
    h: number
    tilt?: number
    shadow?: boolean
    cornerRadius?: number
    channel?: string
    userId?: number
    userName?: string
  }
>

export class ThreeDBoxShapeUtil extends BaseBoxShapeUtil<ThreeDBoxShape> {
  static override type = '3d-box' as const

  static override props = {
    w: T.number,
    h: T.number,
    tilt: T.number.optional(),
    shadow: T.boolean.optional(),
    cornerRadius: T.number.optional(),
    channel: T.string.optional(),
    userId: T.number.optional(),
    userName: T.string.optional(),
  }

  getDefaultProps(): ThreeDBoxShape['props'] {
    return {
      w: 200,
      h: 140,
      tilt: 8,
      shadow: true,
      cornerRadius: 0,
      channel: '',
      userId: undefined,
      userName: undefined,
    }
  }

  component(shape: ThreeDBoxShape) {
    const { w, h, tilt, shadow, cornerRadius, channel, userId, userName } = shape.props

    const [popped] = useState(true)
    const faceRef = useRef<HTMLDivElement>(null)
    const shadowRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
      const face = faceRef.current
      const shade = shadowRef.current
      if (!face || !shade) return

      // Follow the popup example's transform/transition approach closely
      if (popped) {
        face.style.transform = `rotateX(0deg) translateY(0px) translateZ(0px)`
        shade.style.opacity = shadow ? `0.35` : `0`
      } else {
        face.style.transform = `rotateX(${Math.max(10, Math.min(60, tilt ?? 20))}deg)`
        shade.style.opacity = shadow ? `0.5` : `0`
      }
    }, [popped, tilt, shadow])

    const editor = this.editor
    // Perspective settings derived from viewport & shape bounds like popup example
    const vpb = editor.getViewportPageBounds()
    const spb = editor.getShapePageBounds(shape)!
    const px = vpb.midX - spb.midX + spb.w / 2
    const py = vpb.midY - spb.midY + spb.h / 2

    const [, setSlug] = useState(channel ?? '')
    const [isEditingLabel, setIsEditingLabel] = useState(false)
    const [labelQuery, setLabelQuery] = useState(channel || '')
    const [selectedUserName, setSelectedUserName] = useState<string>('')
    const inputRef = useRef<HTMLInputElement>(null)
    const { loading: searching, error: searchError, results } = useArenaSearch(isEditingLabel ? labelQuery : '')
    const { loading, error, cards, author, title } = useArenaChannel(channel)
    const isSelected = editor.getSelectedShapeIds().includes(shape.id)
    const z = editor.getZoomLevel() || 1
    const baseFontPx = 12
    const zoomAwareFontPx = baseFontPx / z
    const labelHeight = zoomAwareFontPx * 1.2 + 6
    const labelOffset = 4 / z
    const authorName = author?.full_name || author?.username || ''
    // const authorAvatar = author?.avatar || ''

    // Drag-out from HTML deck → spawn TLDraw shapes
    const dragActiveRef = useRef(false)
    const createdShapeIdRef = useRef<string | null>(null)
    const originScreenRef = useRef<{ x: number; y: number } | null>(null)
    const pointerIdRef = useRef<number | null>(null)
    let lastDeckCardSizeRef = useRef<{ w: number; h: number } | null>(null)

    function screenToPagePoint(clientX: number, clientY: number) {
      const anyEditor = editor as any
      if (typeof anyEditor.screenToPage === 'function') return anyEditor.screenToPage({ x: clientX, y: clientY })
      if (typeof anyEditor.viewportScreenToPage === 'function') return anyEditor.viewportScreenToPage({ x: clientX, y: clientY })
      const inputs = (editor as any).inputs
      if (inputs?.currentPagePoint) return inputs.currentPagePoint
      const v = editor.getViewportPageBounds()
      return { x: v.midX, y: v.midY }
    }

    function spawnBlockFromCard(card: Card, pageX: number, pageY: number) {
      const size = lastDeckCardSizeRef.current || { w: 240, h: 240 }
      if (card.type === 'channel') return null
      const id = createShapeId()
      // Map Card → ArenaBlockShape props
      let props: any
      switch (card.type) {
        case 'image':
          props = { blockId: String(card.id), kind: 'image', title: card.title, imageUrl: (card as any).url, w: size.w, h: size.h }
          break
        case 'text':
          props = { blockId: String(card.id), kind: 'text', title: (card as any).content, w: size.w, h: size.h }
          break
        case 'link':
          props = { blockId: String(card.id), kind: 'link', title: card.title, imageUrl: (card as any).imageUrl, url: (card as any).url, w: size.w, h: size.h }
          break
        case 'media':
          props = { blockId: String(card.id), kind: 'media', title: card.title, url: (card as any).originalUrl, embedHtml: (card as any).embedHtml, w: size.w, h: size.h }
          break
        default:
          return null
      }
      editor.createShapes([{ id, type: 'arena-block', x: pageX - size.w / 2, y: pageY - size.h / 2, props } as any])
      editor.setSelectedShapes([id])
      return id
    }

    function spawnChannelFromCard(card: Card, pageX: number, pageY: number) {
      if (card.type !== 'channel') return null
      const size = lastDeckCardSizeRef.current || { w: 240, h: 240 }
      const id = createShapeId()
      // Create a new ThreeDBox with the channel slug (we only have title/id here; need slug).
      // We don't get slug from CardChannel; fall back to title as a term for now.
      const slugOrTerm = (card as any).slug || (card as any).title || ''
      editor.createShapes([
        {
          id,
          type: '3d-box',
          x: pageX - size.w / 2,
          y: pageY - size.h / 2,
          props: { w: size.w, h: size.h, channel: slugOrTerm },
        } as any,
      ])
      editor.setSelectedShapes([id])
      return id
    }

    const onDeckCardPointerDown = (_card: Card, size: { w: number; h: number }, e: React.PointerEvent) => {
      stopEventPropagation(e)
      lastDeckCardSizeRef.current = size
      pointerIdRef.current = e.pointerId
      originScreenRef.current = { x: e.clientX, y: e.clientY }
      dragActiveRef.current = true
      try { (e.currentTarget as any).setPointerCapture?.(e.pointerId) } catch {}
    }

    const onDeckCardPointerMove = (card: Card, _size: { w: number; h: number }, e: React.PointerEvent) => {
      stopEventPropagation(e)
      if (!dragActiveRef.current) return
      if (pointerIdRef.current !== e.pointerId) return

      const origin = originScreenRef.current
      if (!origin) return
      const dx = e.clientX - origin.x
      const dy = e.clientY - origin.y
      const threshold = 6

      const page = screenToPagePoint(e.clientX, e.clientY)
      if (!createdShapeIdRef.current) {
        if (Math.hypot(dx, dy) < threshold) return
        // Spawn appropriate TL shape
        if (card.type === 'channel') {
          createdShapeIdRef.current = spawnChannelFromCard(card, page.x, page.y)
        } else {
          createdShapeIdRef.current = spawnBlockFromCard(card, page.x, page.y)
        }
      } else {
        const id = createdShapeIdRef.current
        if (!id) return
        const size = lastDeckCardSizeRef.current || { w: 240, h: 240 }
        // Update position regardless of type
        const shape = editor.getShape(id as any)
        if (!shape) return
        editor.updateShapes([{ id: id as any, type: (shape as any).type as any, x: page.x - size.w / 2, y: page.y - size.h / 2 } as any])
      }
    }

    const onDeckCardPointerUp = (_card: Card, _size: { w: number; h: number }, e: React.PointerEvent) => {
      stopEventPropagation(e)
      if (pointerIdRef.current === e.pointerId) {
        try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId) } catch {}
      }
      dragActiveRef.current = false
      originScreenRef.current = null
      pointerIdRef.current = null
      createdShapeIdRef.current = null
    }

    return (
      <HTMLContainer
        style={{
          pointerEvents: 'all',
          width: w,
          height: h,
          perspective: `${Math.max(vpb.w, vpb.h)}px`,
          perspectiveOrigin: `${px}px ${py}px`,
          overflow: 'visible',
        }}
        onDoubleClick={(e) => {
          stopEventPropagation(e)
        }}
      >
        {
          // Always render the label container; when no channel, it becomes the main way to search
        (
          <div
            style={{
              position: 'absolute',
              top: -(labelHeight + labelOffset),
              left: 0,
              width: w,
              height: labelHeight,
              pointerEvents: 'all',
            }}
          >
            <div
              style={{
                fontFamily: "'Alte Haas Grotesk', system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif",
                fontSize: `${zoomAwareFontPx}px`,
                lineHeight: 1.1,
                left: 8,
                opacity: 0.6,
                position: 'relative', // anchor for dropdown
                fontWeight: 600,
                letterSpacing: '-0.0125em',
                color: 'var(--color-text)',
                padding: 6,
                textAlign: 'left',
                verticalAlign: 'top',
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: 8 / z,
                userSelect: isSelected ? 'auto' : 'none',
                pointerEvents: 'auto',
                outline: 'none',
                border: 'none',
                background: 'transparent',
              }}
              onClick={(e) => {
                stopEventPropagation(e)
                if (!isSelected) {
                  editor.setSelectedShapes([shape])
                }
              }}
              onDoubleClick={(e) => {
                stopEventPropagation(e)
                if (!isSelected) return
                setIsEditingLabel(true)
                setTimeout(() => inputRef.current?.focus(), 0)
              }}
            >
              {isEditingLabel ? (
                <>
                  <input
                    ref={inputRef}
                    value={labelQuery}
                    onChange={(e) => setLabelQuery(e.target.value)}
                    placeholder={(channel || userId) ? 'Change…' : 'Search Are.na'}
                    onPointerDown={(e) => stopEventPropagation(e)}
                    onPointerMove={(e) => stopEventPropagation(e)}
                    onPointerUp={(e) => stopEventPropagation(e)}
                    onWheel={(e) => {
                      // allow native scrolling inside inputs; just avoid bubbling to the canvas
                      e.stopPropagation()
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const term = labelQuery.trim()
                        if (term) {
                          setSlug(term)
                          editor.updateShape({ id: shape.id, type: '3d-box', props: { ...shape.props, channel: term, userId: undefined } })
                          setIsEditingLabel(false)
                        }
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        setIsEditingLabel(false)
                      }
                    }}
                    style={{
                      fontFamily: 'inherit',
                      fontSize: `${zoomAwareFontPx}px`,
                      fontWeight: 600,
                      letterSpacing: '-0.0125em',
                      color: 'var(--color-text)',
                      border: '1px solid rgba(0,0,0,.2)',
                      borderRadius: 4,
                      padding: `${2 / z}px ${4 / z}px`,
                      background: '#fff',
                      width: 'auto',
                      minWidth: 60,
                    }}
                  />
                </>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4 / z,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    minWidth: 0,
                    flex: 1,
                  }}
                  onPointerDown={(e) => stopEventPropagation(e)}
                  onPointerMove={(e) => stopEventPropagation(e)}
                  onPointerUp={(e) => stopEventPropagation(e)}
                >
                  <span style={{ 
                    textOverflow: 'ellipsis', 
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}>
                    {title || channel || selectedUserName || 'Search Are.na'}
                  </span>
                  {isSelected && authorName ? (
                    <>
                      <span style={{ 
                        fontSize: `${zoomAwareFontPx}px`, 
                        opacity: 0.6, 
                        flexShrink: 0 
                      }}>by</span>
                      <span style={{ 
                        fontSize: `${zoomAwareFontPx}px`, 
                        opacity: 0.6,
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        minWidth: 0,
                      }}>{authorName}</span>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        )}
        <div
          ref={shadowRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            transition: 'all .5s',
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            backgroundColor: 'rgba(0,0,0,.5)',
            borderRadius: `${cornerRadius ?? 0}px`,
          }}
        />
        <div
          ref={faceRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'auto',
            transition: 'all .5s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 12,
            overflow: 'hidden',
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif',
            color: '#333',
            fontSize: 16,
            background: `#fff`,
            border: '1px solid #e5e5e5',
            borderRadius: `${cornerRadius ?? 0}px`,
            transformOrigin: 'top center',
          }}
          onPointerDown={(e) => stopEventPropagation(e)}
          onPointerMove={(e) => stopEventPropagation(e)}
          onPointerUp={(e) => stopEventPropagation(e)}
          onWheel={(e) => {
            // When the user pinches on the deck, we want to prevent the browser from zooming.
            // We also want to allow the user to scroll the deck's content without panning the canvas.
            if (e.ctrlKey) {
              e.preventDefault()
            } else {
              e.stopPropagation()
            }
          }}
        >
          {isEditingLabel ? (
            <div
              style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}
              onPointerDown={(e) => stopEventPropagation(e)}
              onPointerMove={(e) => stopEventPropagation(e)}
              onPointerUp={(e) => stopEventPropagation(e)}
              onWheel={(e) => {
                e.stopPropagation()
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  flex: 1,
                  minHeight: 40,
                  maxHeight: '100%',
                  overflow: 'auto',
                  border: '1px solid #e5e5e5',
                  borderRadius: 8,
                  background: '#fff',
                  padding: 0
                }}
                onPointerDown={(e) => stopEventPropagation(e)}
                onPointerMove={(e) => stopEventPropagation(e)}
                onPointerUp={(e) => stopEventPropagation(e)}
                onWheel={(e) => {
                  e.stopPropagation()
                }}
              >
                {labelQuery.trim() && searching ? (
                  <div style={{ color: '#666', fontSize: 12, padding: 8 }}>searching…</div>
                ) : null}
                {searchError ? (
                  <div style={{ color: '#999', fontSize: 12, padding: 8 }}>error: {searchError}</div>
                ) : null}
                {!searching && !searchError && results.length === 0 && labelQuery.trim() ? (
                  <div style={{ color: '#999', fontSize: 12, padding: 8 }}>no results</div>
                ) : null}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {results.map((r: SearchResult) => (
                    <button
                      key={`${r.kind}-${r.id}`}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (r.kind === 'channel') {
                          setSlug((r as any).slug)
                          setLabelQuery((r as any).slug)
                          setSelectedUserName('')
                          editor.updateShape({
                            id: shape.id,
                            type: '3d-box',
                            props: { ...shape.props, channel: (r as any).slug, userId: undefined, userName: undefined },
                          })
                          setIsEditingLabel(false)
                        } else {
                          setSelectedUserName((r as any).full_name || (r as any).username)
                          editor.updateShape({
                            id: shape.id,
                            type: '3d-box',
                            props: { ...shape.props, channel: '', userId: (r as any).id, userName: (r as any).username },
                          })
                          setIsEditingLabel(false)
                        }
                      }}
                      style={{
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        padding: '8px 12px',
                        border: 'none',
                        borderBottom: '1px solid #f0f0f0',
                        background: 'transparent',
                        cursor: 'pointer',
                        color: '#333'
                      }}
                      onPointerDown={(e) => stopEventPropagation(e)}
                      onPointerMove={(e) => stopEventPropagation(e)}
                      onPointerUp={(e) => stopEventPropagation(e)}
                    >
                      {r.kind === 'user' ? (
                        <>
                          <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'transparent', overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
                            {r.avatar ? (
                              <img src={r.avatar} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                              </svg>
                            )}
                          </div>
                          <div style={{ overflow: 'hidden', display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#333', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                              {r.full_name || r.username}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ width: 12, height: 12, border: '1px solid #ccc', borderRadius: 2, flex: '0 0 auto' }} />
                          <div style={{ overflow: 'hidden', display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#333', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                              {(r.title || (r as any).slug) ?? ''}
                            </span>
                            <span style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                              {(r as any).author ? ` / ${(((r as any).author.full_name || (r as any).author.username) ?? '')}` : ''}
                            </span>
                          </div>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : channel ? (
            <div
              style={{ width: '100%', height: '100%' }}
              onPointerDown={(e) => stopEventPropagation(e)}
              onPointerMove={(e) => stopEventPropagation(e)}
              onPointerUp={(e) => stopEventPropagation(e)}
            >
              {loading ? (
                <div style={{ color: 'rgba(0,0,0,.4)', fontSize: 12 }}>loading…</div>
              ) : error ? (
                <div style={{ color: 'rgba(0,0,0,.5)', fontSize: 12 }}>error: {error}</div>
              ) : (
                <ArenaDeck
                  cards={cards}
                  width={w - 24}
                  height={h - 24}
                  onCardPointerDown={onDeckCardPointerDown}
                  onCardPointerMove={onDeckCardPointerMove}
                  onCardPointerUp={onDeckCardPointerUp}
                />
              )}
            </div>
          ) : userId ? (
            <ArenaUserChannelsIndex
              userId={userId}
              userName={userName}
              width={w - 24}
              height={h - 24}
              onSelectChannel={(slug) =>
                editor.updateShape({
                  id: shape.id,
                  type: '3d-box',
                  props: { ...shape.props, channel: slug, userId: undefined, userName: undefined },
                })
              }
            />
          ) : (
            <div style={{ color: 'rgba(0,0,0,.4)', fontSize: 12, textAlign: 'center' }}>
              Double-click label to search Are.na
            </div>
          )}
        </div>
      </HTMLContainer>
    )
  }

  indicator(shape: ThreeDBoxShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={shape.props.cornerRadius ?? 0} />
  }
}


