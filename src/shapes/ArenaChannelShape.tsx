import { BaseBoxShapeUtil, HTMLContainer, T, stopEventPropagation, transact, createShapeId } from 'tldraw'
import type { TLBaseShape, TLFrameShape, TLShape, TLShapeId } from 'tldraw'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useArenaChannel, useArenaChannelSearch } from '../arena/useArenaChannel'
import type { Card } from '../arena/types'
import { autodetectMode, computeCardSize, computeLayoutTargets, type LayoutMode } from '../arena/deckLayout'

export type ArenaChannelShape = TLBaseShape<
  'arena-channel',
  {
    w: number
    h: number
    cornerRadius?: number
    channel?: string
    layoutMode?: LayoutMode
    currentIndex?: number
    scrollOffset?: number
    gap?: number
    cardMax?: number
  }
>

export class ArenaChannelShapeUtil extends BaseBoxShapeUtil<ArenaChannelShape> {
  static override type = 'arena-channel' as const

  static override props = {
    w: T.number,
    h: T.number,
    cornerRadius: T.number.optional(),
    channel: T.string.optional(),
    layoutMode: T.string.optional(),
    currentIndex: T.number.optional(),
    scrollOffset: T.number.optional(),
    gap: T.number.optional(),
    cardMax: T.number.optional(),
  }

  getDefaultProps(): ArenaChannelShape['props'] {
    return {
      w: 240,
      h: 200,
      cornerRadius: 12,
      channel: '',
      layoutMode: 'auto',
      currentIndex: 0,
      scrollOffset: 0,
      gap: 12,
    }
  }

  private getFrameIdFor(shapeId: TLShapeId) {
    const seed = `arena-channel-frame:${String(shapeId).replace(/^shape:/, '')}`
    return createShapeId(seed)
  }

  private ensureBackingFrame(shape: ArenaChannelShape) {
    const frameId = this.getFrameIdFor(shape.id)
    const existing = this.editor.getShape<TLFrameShape>(frameId)
    if (!existing) {
      this.editor.createShape({
        id: frameId,
        parentId: this.editor.getCurrentPageId(),
        type: 'frame',
        x: shape.x,
        y: shape.y,
        props: {
          w: shape.props.w,
          h: shape.props.h,
        } as any,
      })
    } else {
      this.editor.updateShape({
        id: frameId,
        type: 'frame',
        x: shape.x,
        y: shape.y,
        props: { w: shape.props.w, h: shape.props.h } as any,
      })
    }
    return frameId
  }

  private mapCardToBlockProps(card: Card) {
    switch (card.type) {
      case 'image':
        return { kind: 'image' as const, title: card.title, imageUrl: card.url }
      case 'text':
        return { kind: 'text' as const, title: card.content }
      case 'link':
        return { kind: 'link' as const, title: card.title, imageUrl: (card as any).imageUrl, url: card.url }
      case 'media':
        return { kind: 'media' as const, title: card.title, embedHtml: card.embedHtml }
    }
  }

  component(shape: ArenaChannelShape) {
    const { w, h, cornerRadius, channel } = shape.props

    const [isEditingLabel, setIsEditingLabel] = useState(false)
    const [labelQuery, setLabelQuery] = useState(channel ?? '')
    const inputRef = useRef<HTMLInputElement>(null)
    const { loading: searching, error: searchError, results } = useArenaChannelSearch(isEditingLabel ? labelQuery : '')
    const { loading, error, cards, author, title } = useArenaChannel(channel)
    const isSelected = this.editor.getSelectedShapeIds().includes(shape.id)
    const z = this.editor.getZoomLevel() || 1
    const baseFontPx = 12
    const zoomAwareFontPx = baseFontPx / z
    const labelHeight = zoomAwareFontPx * 1.2 + 6
    const labelOffset = 4 / z
    const authorName = author?.full_name || author?.username || ''

    // Backing frame ensure + keep aligned
    useEffect(() => {
      const frameId = this.ensureBackingFrame(shape)
      // Move frame behind our channel shape in stacking order
      const channelIndex = this.editor.getShapeIndex(shape.id)
      if (channelIndex) {
        this.editor.setShapeIndex(frameId, channelIndex - 1)
      }
    }, [shape.x, shape.y, shape.props.w, shape.props.h])

    // Prevent inbound reparenting into backing frame (drag-in disabled)
    useEffect(() => {
      const frameId = this.getFrameIdFor(shape.id)
      const un = this.editor.sideEffects.registerBeforeChangeHandler('shape', (prev, next) => {
        // Allow frame itself and our channel shape updates
        if (!next) return next
        if ((next as any).id === frameId || (next as any).id === shape.id) return next
        // Allow our own creation under the frame (prev is undefined on create)
        if (!prev && (next as TLShape).parentId === frameId) return next
        // Block reparenting into our frame from outside (drag-in) for any existing shape
        if (prev && (next as TLShape).parentId === frameId && (prev as TLShape).parentId !== frameId) {
          return prev
        }
        return next
      })
      return () => {
        un()
      }
    }, [shape.id])

    // Mirror cards -> arena-block children under frame, and apply layout
    useEffect(() => {
      const frameId = this.ensureBackingFrame(shape)
      const count = cards.length
      if (count === 0) return
      const modeExplicit = (shape.props.layoutMode ?? 'auto') as LayoutMode
      const mode = modeExplicit === 'auto' ? autodetectMode(w, h) : (modeExplicit as Exclude<LayoutMode, 'auto'>)
      const { cardW, cardH } = computeCardSize(w, h)
      const gap = shape.props.gap ?? 12
      const currentIndex = shape.props.currentIndex ?? 0
      const scrollOffset = shape.props.scrollOffset ?? 0
      const targets = computeLayoutTargets({ mode, viewportW: w, viewportH: h, count, gap, cardW, cardH, currentIndex, scrollOffset })

      transact(() => {
        const toReparent: TLShapeId[] = []
        // create/update children
        for (let i = 0; i < cards.length; i++) {
          const c = cards[i]
          const childId = createShapeId(`arena-block:${c.id}`)
          const t = targets[i]
          const existing = this.editor.getShape(childId)
          const mapped = this.mapCardToBlockProps(c) as any
          if (!existing) {
            this.editor.createShape({
              id: childId,
              parentId: frameId,
              type: 'arena-block',
              x: shape.x + t.x,
              y: shape.y + t.y,
              props: { blockId: String(c.id), w: t.width, h: t.height, hidden: !t.visible, ...mapped },
            })
          } else {
            // ensure parented to frame
            if ((existing as TLShape).parentId !== frameId) toReparent.push(childId)
            this.editor.updateShape({ id: childId, type: 'arena-block', x: shape.x + t.x, y: shape.y + t.y, props: { w: t.width, h: t.height, hidden: !t.visible, ...mapped } })
          }
        }
        if (toReparent.length) this.editor.reparentShapes(toReparent, frameId)

        // delete orphans (children under frame that are not in current cards)
        const children = this.editor.getSortedChildIdsForParent(frameId)
        const valid = new Set(cards.map((c) => createShapeId(`arena-block:${c.id}`)))
        for (const cid of children) {
          if (!valid.has(cid)) {
            const s = this.editor.getShape(cid)
            if (s && (s as any).type === 'arena-block') this.editor.deleteShape(cid)
          }
        }
      })
    }, [cards, shape.id, w, h, shape.props.layoutMode, shape.props.currentIndex, shape.props.scrollOffset, shape.props.gap])

    // Wheel scroll handling (row/column): update scrollOffset in props
    const onWheel = (e: React.WheelEvent) => {
      stopEventPropagation(e)
      const count = cards.length
      if (count === 0) return
      const modeExplicit = (shape.props.layoutMode ?? 'auto') as LayoutMode
      const mode = modeExplicit === 'auto' ? autodetectMode(w, h) : (modeExplicit as Exclude<LayoutMode, 'auto'>)
      if (mode === 'stack') return
      const { cardW, cardH } = computeCardSize(w, h)
      const gap = shape.props.gap ?? 12
      const contentSpan = mode === 'row' ? Math.max(0, count * cardW + Math.max(0, count - 1) * gap - w) : Math.max(0, count * cardH + Math.max(0, count - 1) * gap - h)
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      const next = Math.max(0, Math.min(contentSpan, (shape.props.scrollOffset ?? 0) + delta))
      this.editor.updateShape({ id: shape.id, type: 'arena-channel', props: { ...shape.props, scrollOffset: next } })
    }

    // Double click toggles edit label
    const onDbl = (e: React.MouseEvent) => {
      stopEventPropagation(e)
      setIsEditingLabel(true)
      setTimeout(() => inputRef.current?.focus(), 0)
    }

    return (
      <HTMLContainer
        style={{
          pointerEvents: 'all',
          width: w,
          height: h,
          overflow: 'visible',
          borderRadius: `${shape.props.cornerRadius ?? 12}px`,
          background: '#fff',
          border: '1px solid #e5e5e5',
        }}
        onPointerDown={stopEventPropagation}
        onPointerMove={stopEventPropagation}
        onPointerUp={stopEventPropagation}
        onWheel={onWheel}
        onDoubleClick={onDbl}
      >
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
              position: 'relative',
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
                this.editor.setSelectedShapes([shape])
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
                  placeholder={channel ? 'Change channel…' : 'Search Are.na channels'}
                  onPointerDown={(e) => stopEventPropagation(e)}
                  onPointerMove={(e) => stopEventPropagation(e)}
                  onPointerUp={(e) => stopEventPropagation(e)}
                  onWheel={(e) => stopEventPropagation(e)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const newSlug = labelQuery.trim()
                      if (newSlug) {
                        this.editor.updateShape({ id: shape.id, type: 'arena-channel', props: { ...shape.props, channel: newSlug } })
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
                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', minWidth: 0 }}>
                  {title || channel || 'are.na channel'}
                </span>
                {isSelected && authorName ? (
                  <>
                    <span style={{ fontSize: `${zoomAwareFontPx}px`, opacity: 0.6, flexShrink: 0 }}>by</span>
                    <span style={{ fontSize: `${zoomAwareFontPx}px`, opacity: 0.6, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', minWidth: 0 }}>
                      {authorName}
                    </span>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {isEditingLabel ? (
          <div
            style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}
            onPointerDown={(e) => stopEventPropagation(e)}
            onPointerMove={(e) => stopEventPropagation(e)}
            onPointerUp={(e) => stopEventPropagation(e)}
            onWheel={(e) => stopEventPropagation(e)}
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
                padding: 0,
              }}
              onPointerDown={(e) => stopEventPropagation(e)}
              onPointerMove={(e) => stopEventPropagation(e)}
              onPointerUp={(e) => stopEventPropagation(e)}
              onWheel={(e) => stopEventPropagation(e)}
            >
              {labelQuery.trim() && searching ? <div style={{ color: '#666', fontSize: 12, padding: 8 }}>searching…</div> : null}
              {searchError ? <div style={{ color: '#999', fontSize: 12, padding: 8 }}>error: {searchError}</div> : null}
              {!searching && !searchError && results.length === 0 && labelQuery.trim() ? <div style={{ color: '#999', fontSize: 12, padding: 8 }}>no channels found</div> : null}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {results.map((r) => (
                  <button
                    key={r.id}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      this.editor.updateShape({ id: shape.id, type: 'arena-channel', props: { ...shape.props, channel: r.slug } })
                      setIsEditingLabel(false)
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
                      color: '#333',
                    }}
                    onPointerDown={(e) => stopEventPropagation(e)}
                    onPointerMove={(e) => stopEventPropagation(e)}
                    onPointerUp={(e) => stopEventPropagation(e)}
                  >
                    <div style={{ width: 12, height: 12, border: '1px solid #ccc', borderRadius: 2, flex: '0 0 auto' }} />
                    <div style={{ overflow: 'hidden', display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#333', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {(r.title || r.slug) ?? ''}
                      </span>
                      <span style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {r.author ? ` / ${(r.author.full_name || r.author.username) ?? ''}` : ''}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </HTMLContainer>
    )
  }

  indicator(shape: ArenaChannelShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={shape.props.cornerRadius ?? 12} />
  }
}


