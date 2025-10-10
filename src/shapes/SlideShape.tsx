import { HTMLContainer, Rectangle2d, ShapeUtil, T, resizeBox, useEditor } from 'tldraw'
import { SLIDE_SHADOW } from '../arena/constants'
import type {
  TLBaseShape,
  TLResizeInfo,
} from 'tldraw'

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

    return (
      <HTMLContainer
        style={{
          width: w,
          height: h,
          overflow: 'visible',
          // pointerEvents: 'none',
        }}
      >
        {/* The actual slide shape - labels now rendered in overlay */}
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
      </HTMLContainer>
    )
  }

  override indicator(shape: SlideShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={shape.props.cornerRadius ?? 24} />
  }
}


