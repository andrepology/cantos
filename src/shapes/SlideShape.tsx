import { HTMLContainer, Rectangle2d, ShapeUtil, T, resizeBox, useEditor, useValue } from 'tldraw'
import { useMemo } from 'react'
import { motion } from 'motion/react'
import { SLIDE_SHADOW } from '../arena/constants'
import type {
  TLBaseShape,
  TLResizeInfo,
} from 'tldraw'
import { useRightClickTiltState } from './rightClickTilt'

export type SlideShape = TLBaseShape<
  'slide',
  {
    w: number
    h: number
    label: string
    cornerRadius?: number
    shadow?: boolean
  }
>

export class SlideShapeUtil extends ShapeUtil<SlideShape> {
  static override type = 'slide' as const

  static override props = {
    w: T.number,
    h: T.number,
    label: T.string,
    cornerRadius: T.number.optional(),
    shadow: T.boolean.optional(),
  }

  override getDefaultProps(): SlideShape['props'] {
    return {
      w: 400,
      h: 300,
      label: 'Slide',
      cornerRadius: 0,
      shadow: true,
    }
  }

  override getGeometry(shape: SlideShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
  }

  // Make slides non-hittable so marquee selection can begin over them.
  // Slides are managed programmatically in SlideShowTrackExample.
  hitTestPoint(_shape: SlideShape, _point: any) {
    return false
  }

  hitTestLineSegment(_shape: SlideShape, _A: any, _B: any) {
    return false
  }

  override onResize(shape: SlideShape, info: TLResizeInfo<SlideShape>) {
    return resizeBox(shape, info)
  }

  override canEdit(): boolean {
    return true
  }

  override getText(shape: SlideShape): string {
    return shape.props.label
  }

  override component(shape: SlideShape) {
    const { w, h, cornerRadius, shadow } = shape.props
    const editor = useEditor()
    const rightClickTilt = useRightClickTiltState()
    const shouldTilt = rightClickTilt.activeShapeId !== null
    const deskTiltXDeg = shouldTilt ? 45 * rightClickTilt.strength : 0
    const vpb = useValue('viewportPageBounds', () => editor.getViewportPageBounds(), [editor])
    const perspectivePx = useMemo(() => `${Math.max(vpb.w, vpb.h)}px`, [vpb.h, vpb.w])
    const spb = editor.getShapePageBounds(shape)
    const perspectiveOrigin = useMemo(() => {
      if (!spb) return `${w / 2}px ${h / 2}px`
      const px = vpb.midX - spb.midX + spb.w / 2
      const py = vpb.midY - spb.midY + spb.h / 2
      return `${px}px ${py}px`
    }, [h, spb, vpb.midX, vpb.midY, w])

    return (
      <HTMLContainer
        style={{
          width: w,
          height: h,
          overflow: 'visible',
          perspective: perspectivePx,
          perspectiveOrigin,
          // pointerEvents: 'none',
        }}
      >
        {/* The actual slide shape - labels now rendered in overlay */}
        <motion.div
          animate={{
            rotateX: deskTiltXDeg,
            opacity: shouldTilt ? 0.22 : 1,
            filter: shouldTilt ? 'blur(2px)' : 'blur(0px)',
            scale: shouldTilt ? 0.8 : 1,
          }}
          transition={{
            rotateX: { type: 'spring', stiffness: 420, damping: 42, mass: 0.9 },
            opacity: { duration: 0.18, ease: [0.2, 0, 0, 1] },
            filter: { duration: 0.22, ease: [0.2, 0, 0, 1] },
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: w,
            height: h,
            transformOrigin: 'center center',
            transformStyle: 'preserve-3d',
            willChange: 'transform, opacity, filter',
          }}
        >
          <div
            className={[
              'select-none',
              shadow ? 'shadow-xl' : '',
            ].join(' ')}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: w,
              height: h,
              borderRadius: `${cornerRadius ?? 0}px`,
              boxShadow: shadow ? SLIDE_SHADOW : 'none',
            }}
          />
        </motion.div>
      </HTMLContainer>
    )
  }

  override indicator(shape: SlideShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={shape.props.cornerRadius ?? 24} />
  }
}
