import { HTMLContainer, Rectangle2d, ShapeUtil, T, resizeBox, useEditor, useValue } from 'tldraw'
import { useMemo, useState, useRef, useCallback } from 'react'
import { motion } from 'motion/react'
import { SLIDE_SHADOW, TEXT_PRIMARY } from '../arena/constants'
import type {
  TLBaseShape,
  TLResizeInfo,
} from 'tldraw'
import { useShapeFocusState } from './focusState'
import { useSlides } from '../editor/SlidesManager'

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
    const slides = useSlides()
    const focusState = useShapeFocusState()
    const shouldTilt = focusState.activeShapeId !== null
    const vpb = useValue('viewportPageBounds', () => editor.getViewportPageBounds(), [editor])
    
    // Slide manager ID for syncing
    const slideManagerId = useMemo(() => {
      const id = String(shape.id)
      return id.startsWith('shape:') ? id.slice('shape:'.length) : id
    }, [shape.id])

    // Perspective calculations for tilt
    const perspectivePx = useMemo(() => `${Math.max(vpb.w, vpb.h)}px`, [vpb.h, vpb.w])
    const spb = editor.getShapePageBounds(shape)
    const perspectiveOrigin = useMemo(() => {
      if (!spb) return `${w / 2}px ${h / 2}px`
      const px = vpb.midX - spb.midX + spb.w / 2
      const py = vpb.midY - spb.midY + spb.h / 2
      return `${px}px ${py}px`
    }, [h, spb, vpb.midX, vpb.midY, w])

    // Label states and logic
    const [isHovered, setIsHovered] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
    const labelRef = useRef<HTMLDivElement>(null)

    // Sticky label positioning logic
    const labelOffset = 4
    const baseFontPx = 42
    const fontSize = baseFontPx
    const labelHeight = fontSize * 1.2 + 10

    const positioning = useMemo(() => {
      const slideLeft = shape.x
      const slideTop = shape.y
      
      // Calculate "sticky" offsets in page space
      const labelLeft = Math.max(0, vpb.x - slideLeft)
      const labelTop = Math.max(labelOffset, vpb.y - slideTop)
      
      // Check if label is within slide bounds
      const isWithinBounds = 
        labelLeft < w && 
        labelTop < h &&
        labelLeft + 200 > 0 && // approximate label width
        labelTop + labelHeight > 0

      return { labelLeft, labelTop, isWithinBounds }
    }, [shape.x, shape.y, vpb.x, vpb.y, w, h, labelHeight])

    const { labelLeft, labelTop, isWithinBounds } = positioning

    // Handlers
    const handleClick = useCallback((e: React.MouseEvent) => {
      if (!isEditing) {
        e.preventDefault()
        e.stopPropagation()
        slides.setCurrentSlide(slideManagerId)
      }
    }, [isEditing, slides, slideManagerId])

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsEditing(true)
      setTimeout(() => {
        if (labelRef.current) {
          labelRef.current.focus()
          const range = document.createRange()
          const sel = window.getSelection()
          if (sel) {
            range.selectNodeContents(labelRef.current)
            sel.removeAllRanges()
            sel.addRange(range)
          }
        }
      }, 0)
    }, [])

    return (
      <HTMLContainer
        style={{
          width: w,
          height: h,
          overflow: 'visible',
          perspective: perspectivePx,
          perspectiveOrigin,
        }}
      >
        {/* The actual slide shape - tilted */}
        <motion.div
          animate={{
            rotateX: shouldTilt ? 40 : 0,
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

        {/* Sticky Label - Not Tilted */}
        <div
          style={{
            position: 'absolute',
            left: labelLeft,
            top: labelTop,
            pointerEvents: isWithinBounds ? 'auto' : 'none',
            zIndex: 9999,
            cursor: isEditing ? 'text' : 'pointer',
            opacity: isWithinBounds ? 1 : 0,
            transition: 'opacity 0.2s ease-out',
          }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onMouseEnter={() => !isEditing && setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div
            ref={labelRef}
            style={{
              fontFamily: "'Alte Haas Grotesk', sans-serif",
              fontSize: `${fontSize}px`,
              lineHeight: 1.0,
              opacity: isEditing ? 1.0 : (isHovered ? 0.9 : 0.8),
              fontWeight: 'bold',
              letterSpacing: '-0.0125em',
              color: isEditing ? TEXT_PRIMARY : 'rgba(15, 23, 42, 0.02)',
              textShadow: isEditing 
                ? 'none' 
                : '1px 1px 1px rgba(255, 255, 255, 0.6), -0.5px -0.5px 1px rgba(15, 23, 42, 0.12)',
              paddingLeft: 16,
              paddingTop: 10,
              paddingRight: 16,
              paddingBottom: 10,
              textAlign: 'left',
              verticalAlign: 'top',
              display: 'inline-block',
              userSelect: isEditing ? 'auto' : 'none',
              pointerEvents: 'auto',
              border: 'none',
              background: isEditing ? 'rgba(255,255,255,0.01)' : 'transparent',
              transition: 'opacity 0.15s ease, outline 0.15s ease, background 0.15s ease',
              whiteSpace: 'nowrap',
              borderRadius: 4,
            }}
            contentEditable={isEditing}
            suppressContentEditableWarning={true}
            onBlur={(e) => {
              const newLabel = e.currentTarget.textContent || 'Slide'
              if (newLabel !== shape.props.label) {
                slides.updateSlideName(slideManagerId, newLabel)
                editor.updateShape({
                  id: shape.id,
                  type: 'slide',
                  props: { ...shape.props, label: newLabel }
                })
              }
              setIsEditing(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                e.currentTarget.textContent = shape.props.label
                e.currentTarget.blur()
              }
            }}
          >
            {shape.props.label}
          </div>
        </div>
      </HTMLContainer>
    )
  }

  override indicator(shape: SlideShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={shape.props.cornerRadius ?? 24} />
  }
}
