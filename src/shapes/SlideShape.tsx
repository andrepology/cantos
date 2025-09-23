import { HTMLContainer, Rectangle2d, ShapeUtil, T, resizeBox, useEditor } from 'tldraw'
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
    const { w, h, cornerRadius, shadow, label } = shape.props
    const editor = useEditor()
    const isSelected = editor.getSelectedShapeIds().includes(shape.id)
    const z = editor.getZoomLevel()
    const baseFontPx = 24
    const zoomAwareFontPx = baseFontPx / (z || 1)
    const labelHeight = zoomAwareFontPx * 1.2 + 10 // fontSize * lineHeight + padding
    const labelOffset = 4 / z // 8px offset scaled by zoom
    
    return (
      <HTMLContainer
        style={{
          width: w,
          height: h,
          overflow: 'visible',
          pointerEvents: 'none',
        }}
      >
        {/* Label positioned above the shape */}
        <div
          style={{
            position: 'absolute',
            top: -(labelHeight + labelOffset),
            left: 0,
            width: w,
            height: labelHeight,
            pointerEvents: isSelected ? 'auto' : 'none',
          }}
        >
          <div
            style={{
              fontFamily: "'Alte Haas Grotesk', sans-serif",
              fontSize: `${zoomAwareFontPx}px`,
              lineHeight: 1.1,
              left: 8,
              opacity: 0.5,
              position: 'relative',
              fontWeight: 'bold',
              letterSpacing: '-0.0125em',
              color: 'var(--color-text)',
              padding: 8,
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
            onBlur={(e) => {
              const newLabel = e.currentTarget.textContent || 'Slide'
              if (newLabel !== label) {
                editor.updateShape({
                  id: shape.id,
                  type: 'slide',
                  props: { ...shape.props, label: newLabel }
                })
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
          >
            {label}
          </div>
        </div>
        
        {/* The actual slide shape */}
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
            background: 'white',
            boxShadow: shadow ? '0 25px 50px -12px rgba(0, 0, 0, 0.02)' : 'none',
          }}
        />
      </HTMLContainer>
    )
  }

  override indicator(shape: SlideShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={shape.props.cornerRadius ?? 24} />
  }
}


