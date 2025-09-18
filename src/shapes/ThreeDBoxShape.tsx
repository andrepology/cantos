import { BaseBoxShapeUtil, HTMLContainer, T, stopEventPropagation } from 'tldraw'
import type { TLBaseShape } from 'tldraw'
import { useEffect, useRef, useState } from 'react'
import { ArenaDeck } from '../arena/Deck'
import { useArenaChannel, useArenaChannelSearch } from '../arena/useArenaChannel'

export type ThreeDBoxShape = TLBaseShape<
  '3d-box',
  {
    w: number
    h: number
    tilt?: number
    shadow?: boolean
    cornerRadius?: number
    channel?: string
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
  }

  getDefaultProps(): ThreeDBoxShape['props'] {
    return {
      w: 200,
      h: 140,
      tilt: 8,
      shadow: true,
      cornerRadius: 12,
      channel: '',
    }
  }

  component(shape: ThreeDBoxShape) {
    const { w, h, tilt, shadow, cornerRadius, channel } = shape.props

    const [popped, setPopped] = useState(false)
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

    // Perspective settings derived from viewport & shape bounds like popup example
    const vpb = this.editor.getViewportPageBounds()
    const spb = this.editor.getShapePageBounds(shape)!
    const px = vpb.midX - spb.midX + spb.w / 2
    const py = vpb.midY - spb.midY + spb.h / 2

    const [, setSlug] = useState(channel ?? '')
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
    // const authorAvatar = author?.avatar || ''

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
          setPopped((p) => !p)
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
                          setSlug(newSlug)
                          this.editor.updateShape({ id: shape.id, type: '3d-box', props: { ...shape.props, channel: newSlug } })
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
                    {title || channel || 'are.na channel'}
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
            borderRadius: `${cornerRadius ?? 12}px`,
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
            borderRadius: `${cornerRadius ?? 12}px`,
            transformOrigin: 'top center',
          }}
          onPointerDown={(e) => stopEventPropagation(e)}
          onPointerMove={(e) => stopEventPropagation(e)}
          onPointerUp={(e) => stopEventPropagation(e)}
          onWheel={(e) => stopEventPropagation(e)}
        >
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
                  padding: 0
                }}
                onPointerDown={(e) => stopEventPropagation(e)}
                onPointerMove={(e) => stopEventPropagation(e)}
                onPointerUp={(e) => stopEventPropagation(e)}
                onWheel={(e) => stopEventPropagation(e)}
              >
                {labelQuery.trim() && searching ? (
                  <div style={{ color: '#666', fontSize: 12, padding: 8 }}>searching…</div>
                ) : null}
                {searchError ? (
                  <div style={{ color: '#999', fontSize: 12, padding: 8 }}>error: {searchError}</div>
                ) : null}
                {!searching && !searchError && results.length === 0 && labelQuery.trim() ? (
                  <div style={{ color: '#999', fontSize: 12, padding: 8 }}>no channels found</div>
                ) : null}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {results.map((r) => (
                    <button
                      key={r.id}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setSlug(r.slug)
                        setLabelQuery(r.slug)
                        this.editor.updateShape({ id: shape.id, type: '3d-box', props: { ...shape.props, channel: r.slug } })
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
                        color: '#333'
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
                <ArenaDeck cards={cards} width={w - 24} height={h - 24} />
              )}
            </div>
          ) : (
            <div style={{ color: 'rgba(0,0,0,.4)', fontSize: 12, textAlign: 'center' }}>
              Double-click label to search channels
            </div>
          )}
        </div>
      </HTMLContainer>
    )
  }

  indicator(shape: ThreeDBoxShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={shape.props.cornerRadius ?? 12} />
  }
}


