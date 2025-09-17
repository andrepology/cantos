import { BaseBoxShapeUtil, HTMLContainer, T, stopEventPropagation } from 'tldraw'
import type { TLBaseShape } from 'tldraw'
import { useEffect, useRef, useState } from 'react'

export type ThreeDBoxShape = TLBaseShape<
  '3d-box',
  {
    w: number
    h: number
    tilt?: number
    shadow?: boolean
    cornerRadius?: number
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
  }

  getDefaultProps(): ThreeDBoxShape['props'] {
    return {
      w: 200,
      h: 140,
      tilt: 18,
      shadow: true,
      cornerRadius: 12,
    }
  }

  component(shape: ThreeDBoxShape) {
    const { w, h, tilt, shadow, cornerRadius } = shape.props

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

    return (
      <HTMLContainer
        style={{
          pointerEvents: 'all',
          width: w,
          height: h,
          perspective: `${Math.max(vpb.w, vpb.h)}px`,
          perspectiveOrigin: `${px}px ${py}px`,
        }}
        onPointerDown={stopEventPropagation}
        onDoubleClick={(e) => {
          setPopped((p) => !p)
          stopEventPropagation(e)
        }}
      >
        <div
          ref={shadowRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
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
          3D Box
        </div>
      </HTMLContainer>
    )
  }

  indicator(shape: ThreeDBoxShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={shape.props.cornerRadius ?? 12} />
  }
}


