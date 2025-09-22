import { BaseBoxShapeUtil, HTMLContainer, T, stopEventPropagation, createShapeId, transact } from 'tldraw'
import type { TLBaseShape } from 'tldraw'
import { useEffect, useRef, useState } from 'react'
import { ArenaDeck } from '../arena/Deck'
import { ArenaUserChannelsIndex } from '../arena/ArenaUserChannelsIndex'
import { useArenaChannel, useArenaSearch, useConnectedChannels } from '../arena/useArenaChannel'
import type { Card, SearchResult } from '../arena/types'
import { ArenaSearchPanel } from '../arena/ArenaSearchResults'
import { ConnectionsPanel } from '../arena/ConnectionsPanel'

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
      cornerRadius: 8,
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
    const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)
    const resultsContainerRef = useRef<HTMLDivElement>(null)
    // Selection / transform state used by multiple sections
    const isSelected = editor.getSelectedShapeIds().includes(shape.id)
    const inputsAny = (editor as any).inputs
    const isDragging = !!inputsAny?.isDragging
    const isResizing = !!inputsAny?.isResizing
    const isTransforming = isDragging || isResizing
    const { loading, error, cards, author, title } = useArenaChannel(channel)
    const { loading: chLoading, error: chError, connections } = useConnectedChannels(channel, isSelected && !isTransforming && !!channel)
    const z = editor.getZoomLevel() || 1
    const sideGapPx = 8
    const gapW = sideGapPx / z
    const baseFontPx = 12
    const zoomAwareFontPx = baseFontPx / z
    const labelHeight = zoomAwareFontPx * 1.2 + 6
    const labelOffset = 4 / z
    const authorName = author?.full_name || author?.username || ''
    const labelPrimary = userId ? (selectedUserName || userName || '') : (title || channel || '')
    // const authorAvatar = author?.avatar || ''

    // Autofocus label on creation when no channel/user is set and shape is selected
    const didAutoEditRef = useRef(false)
    useEffect(() => {
      if (didAutoEditRef.current) return
      const noTarget = (!channel || channel.trim() === '') && !userId
      if (noTarget && isSelected) {
        didAutoEditRef.current = true
        setIsEditingLabel(true)
        setTimeout(() => inputRef.current?.focus(), 0)
      }
    }, [isSelected, channel, userId])

    // Reset highlight as query / results change
    useEffect(() => {
      setHighlightedIndex(results.length > 0 ? 0 : -1)
    }, [labelQuery, results.length])

    // Keep highlighted row in view
    useEffect(() => {
      const container = resultsContainerRef.current
      if (!container) return
      const el = container.querySelector(`[data-index="${highlightedIndex}"]`)
      if (el && 'scrollIntoView' in el) {
        ;(el as HTMLElement).scrollIntoView({ block: 'nearest' })
      }
    }, [highlightedIndex])

    function applySearchSelection(result: SearchResult | null) {
      if (!result) {
        const term = labelQuery.trim()
        if (!term) return
        setSlug(term)
        editor.updateShape({ id: shape.id, type: '3d-box', props: { ...shape.props, channel: term, userId: undefined, userName: undefined } })
        setIsEditingLabel(false)
        return
      }
      if (result.kind === 'channel') {
        const slug = (result as any).slug
        setSlug(slug)
        setLabelQuery(slug)
        setSelectedUserName('')
        editor.updateShape({ id: shape.id, type: '3d-box', props: { ...shape.props, channel: slug, userId: undefined, userName: undefined } })
        setIsEditingLabel(false)
      } else {
        const full = (result as any).full_name || (result as any).username
        setSelectedUserName(full)
        editor.updateShape({ id: shape.id, type: '3d-box', props: { ...shape.props, channel: '', userId: (result as any).id, userName: (result as any).username } })
        setIsEditingLabel(false)
      }
    }

    // Drag-out from HTML deck → spawn TLDraw shapes
    // Isolated in a tiny helper for clarity
    const dragActiveRef = useRef(false)
    const createdShapeIdRef = useRef<string | null>(null)
    const originScreenRef = useRef<{ x: number; y: number } | null>(null)
    const pointerIdRef = useRef<number | null>(null)
    const lastDeckCardSizeRef = useRef<{ w: number; h: number } | null>(null)
    const pointerOffsetPageRef = useRef<{ x: number; y: number } | null>(null)

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
      // Convert measured CSS pixel size → TLDraw page units
      const zoom = editor.getZoomLevel?.() || 1
      const w = Math.max(1, size.w / zoom)
      const h = Math.max(1, size.h / zoom)
      if (card.type === 'channel') return null
      const id = createShapeId()
      // Map Card → ArenaBlockShape props
      let props: any
      switch (card.type) {
        case 'image':
          props = { blockId: String(card.id), kind: 'image', title: card.title, imageUrl: (card as any).url, w, h }
          break
        case 'text':
          props = { blockId: String(card.id), kind: 'text', title: (card as any).content, w, h }
          break
        case 'link':
          props = { blockId: String(card.id), kind: 'link', title: card.title, imageUrl: (card as any).imageUrl, url: (card as any).url, w, h }
          break
        case 'media':
          props = { blockId: String(card.id), kind: 'media', title: card.title, url: (card as any).originalUrl, embedHtml: (card as any).embedHtml, w, h }
          break
        default:
          return null
      }
      const off = pointerOffsetPageRef.current
      const x0 = pageX - (off?.x ?? w / 2)
      const y0 = pageY - (off?.y ?? h / 2)
      transact(() => {
        editor.createShapes([{ id, type: 'arena-block', x: x0, y: y0, props } as any])
        editor.setSelectedShapes([id])
      })
      return id
    }

    function spawnChannelFromCard(card: Card, pageX: number, pageY: number) {
      if (card.type !== 'channel') return null
      const size = lastDeckCardSizeRef.current || { w: 240, h: 240 }
      const zoom = editor.getZoomLevel?.() || 1
      const w = Math.max(1, size.w / zoom)
      const h = Math.max(1, size.h / zoom)
      const id = createShapeId()
      // Create a new ThreeDBox with the channel slug (we only have title/id here; need slug).
      // Prefer slug; fallback to numeric id, never the title.
      const slugOrTerm = (card as any).slug || String(card.id)
      const off = pointerOffsetPageRef.current
      const x0 = pageX - (off?.x ?? w / 2)
      const y0 = pageY - (off?.y ?? h / 2)
      transact(() => {
        editor.createShapes([
          {
            id,
            type: '3d-box',
            x: x0,
            y: y0,
            props: { w, h, channel: slugOrTerm },
          } as any,
        ])
        editor.setSelectedShapes([id])
      })
      return id
    }

    const onDeckCardPointerDown = (_card: Card, size: { w: number; h: number }, e: React.PointerEvent) => {
      stopEventPropagation(e)
      // Record the actual rendered card size passed from Deck
      lastDeckCardSizeRef.current = size
      pointerIdRef.current = e.pointerId
      originScreenRef.current = { x: e.clientX, y: e.clientY }
      // Capture pointer offset within card in page units
      try {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const oxCss = e.clientX - rect.left
        const oyCss = e.clientY - rect.top
        const zoom = editor.getZoomLevel?.() || 1
        pointerOffsetPageRef.current = { x: oxCss / zoom, y: oyCss / zoom }
      } catch {
        pointerOffsetPageRef.current = null
      }
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
        const zoom = editor.getZoomLevel?.() || 1
        const w = Math.max(1, size.w / zoom)
        const h = Math.max(1, size.h / zoom)
        // Update position regardless of type
        const shape = editor.getShape(id as any)
        if (!shape) return
        const off = pointerOffsetPageRef.current
        const x0 = page.x - (off?.x ?? w / 2)
        const y0 = page.y - (off?.y ?? h / 2)
        editor.updateShapes([{ id: id as any, type: (shape as any).type as any, x: x0, y: y0 } as any])
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
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        if (results.length === 0) return
                        setHighlightedIndex((i) => (i < 0 ? 0 : (i + 1) % results.length))
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        if (results.length === 0) return
                        setHighlightedIndex((i) => (i <= 0 ? results.length - 1 : i - 1))
                      } else if (e.key === 'Enter') {
                        e.preventDefault()
                        const chosen = highlightedIndex >= 0 && highlightedIndex < results.length ? results[highlightedIndex] : null
                        applySearchSelection(chosen)
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
                      borderRadius: 0,
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
                    {labelPrimary || 'Search Are.na'}
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
              <ArenaSearchPanel
                query={labelQuery}
                searching={searching}
                error={searchError}
                results={results}
                highlightedIndex={highlightedIndex}
                onHoverIndex={setHighlightedIndex}
                onSelect={(r: SearchResult) => applySearchSelection(r)}
                containerRef={resultsContainerRef}
              />
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
        {isSelected && !isTransforming && !!channel ? (
          <ConnectionsPanel
            z={z}
            x={w + gapW}
            y={0}
            widthPx={260}
            maxHeightPx={320}
            title={title || channel}
            authorName={authorName}
            createdAt={undefined}
            updatedAt={undefined}
            loading={loading || chLoading}
            error={error || chError}
            connections={(connections || []).map((c: any) => ({
              id: c.id,
              title: c.title || c.slug,
              author: c.author?.full_name || c.author?.username,
            }))}
            hasMore={false}
          />
        ) : null}
      </HTMLContainer>
    )
  }

  indicator(shape: ThreeDBoxShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={shape.props.cornerRadius ?? 0} />
  }
}


