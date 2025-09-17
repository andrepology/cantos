import { HTMLContainer, PlainTextLabel, Rectangle2d, ShapeUtil, T, resizeBox, useEditor } from 'tldraw'
import type {
  TLBaseShape,
  TLResizeInfo,
  TLDefaultFontStyle,
  TLDefaultHorizontalAlignStyle,
  TLDefaultVerticalAlignStyle,
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
      cornerRadius: 24,
      shadow: true,
    }
  }

  override getGeometry(shape: SlideShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
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
    const { w, h, cornerRadius, shadow, label } = shape.props
    const editor = useEditor()
    const isSelected = editor.getSelectedShapeIds().includes(shape.id)
    return (
      <HTMLContainer
        className={[
          'flex items-center  justify-center font-sans text-[20px] font-medium select-none',
          shadow ? 'shadow-xl' : '',
        ].join(' ')}
        style={{
          width: w,
          height: h,
          borderRadius: `${cornerRadius ?? 24}px`,
          background: 'white',
          boxShadow: shadow ? '0 25px 50px -12px rgba(0, 0, 0, 0.05)' : 'none',
        }}
      >
        <PlainTextLabel
          shapeId={shape.id}
          type="slide"
          font={'sans' as TLDefaultFontStyle}
          fontSize={32}
          lineHeight={1.2}
          align={'left' as TLDefaultHorizontalAlignStyle}
          verticalAlign={'start' as TLDefaultVerticalAlignStyle}
          text={label}
          labelColor={'var(--color-text)'}
          isSelected={isSelected}
          padding={16}
        />
      </HTMLContainer>
    )
  }

  override indicator(shape: SlideShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={shape.props.cornerRadius ?? 24} />
  }
}


