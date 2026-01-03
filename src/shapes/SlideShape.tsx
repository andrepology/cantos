import { HTMLContainer, Rectangle2d, ShapeUtil, T, resizeBox } from 'tldraw'
import { motion } from 'motion/react'
import { SLIDE_SHADOW } from '../arena/constants'
import type {
  TLBaseShape,
  TLResizeInfo,
} from 'tldraw'
import { useShapeFocusState } from './focusState'

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
    const focusState = useShapeFocusState()
    const shouldDeemphasize = focusState.activeShapeId !== null

    return (
      <HTMLContainer
        style={{
          width: w,
          height: h,
          overflow: 'visible',
        }}
      >
        {/* The actual slide shape */}
        <motion.div
          animate={{
            opacity: shouldDeemphasize ? 0.22 : 1,
            filter: shouldDeemphasize ? 'blur(2px)' : 'blur(0px)',
          }}
          transition={{
            opacity: { duration: 0.18, ease: [0.2, 0, 0, 1] },
            filter: { duration: 0.22, ease: [0.2, 0, 0, 1] },
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: w,
            height: h,
            willChange: 'opacity, filter',
            pointerEvents: 'none', // Allow clicks to pass through to the label layer if needed
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
              backgroundColor: 'transparent',
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
