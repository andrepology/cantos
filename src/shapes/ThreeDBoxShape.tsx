import { BaseBoxShapeUtil, HTMLContainer, T, stopEventPropagation } from 'tldraw'
import type { TLBaseShape } from 'tldraw'
import { useEffect, useRef, useState } from 'react'
import { ArenaDeck } from '../arena/Deck'
import { useArenaChannel } from '../arena/useArenaChannel'

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

    const [slug, setSlug] = useState(channel ?? '')
    const { loading, error, cards } = useArenaChannel(channel)
    const isSelected = this.editor.getSelectedShapeIds().includes(shape.id)
    const z = this.editor.getZoomLevel() || 1
    const baseFontPx = 14
    const zoomAwareFontPx = baseFontPx / z
    const labelHeight = zoomAwareFontPx * 1.2 + 6
    const labelOffset = 4 / z

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
        {channel ? (
          <div
            style={{
              position: 'absolute',
              top: -(labelHeight + labelOffset),
              left: 0,
              width: w,
              height: labelHeight,
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
                alignItems: 'flex-start',
                justifyContent: 'flex-start',
                userSelect: isSelected ? 'auto' : 'none',
                pointerEvents: isSelected ? 'auto' : 'none',
                outline: 'none',
                border: 'none',
                background: 'transparent',
              }}
              contentEditable={isSelected}
              suppressContentEditableWarning={true}
              onPointerDown={(e) => {
                stopEventPropagation(e)
              }}
              onBlur={(e) => {
                const newSlug = (e.currentTarget.textContent || '').trim()
                if (newSlug && newSlug !== channel) {
                  setSlug(newSlug)
                  this.editor.updateShape({ id: shape.id, type: '3d-box', props: { ...shape.props, channel: newSlug } })
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  ;(e.currentTarget as HTMLDivElement).blur()
                }
              }}
            >
              {channel}
            </div>
          </div>
        ) : null}
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
        >
          {!channel ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                this.editor.updateShape({ id: shape.id, type: '3d-box', props: { channel: slug } })
              }}
              style={{ width: '100%', display: 'flex', gap: 8 }}
            >
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="are.na channel slug"
                style={{ flex: 1, fontSize: 12, padding: 6, border: '1px solid rgba(0,0,0,.1)' }}
              />
              <button type="submit" style={{ fontSize: 12, padding: '6px 8px', border: '1px solid rgba(0,0,0,.2)' }}>↦</button>
            </form>
          ) : (
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
          )}
        </div>
      </HTMLContainer>
    )
  }

  indicator(shape: ThreeDBoxShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={shape.props.cornerRadius ?? 12} />
  }
}


