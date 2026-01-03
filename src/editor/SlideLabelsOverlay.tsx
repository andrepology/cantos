import React, { memo, useMemo, useRef, useState } from 'react'
import { useEditor, useValue } from 'tldraw'
import type { SlideShape } from '../shapes/SlideShape'
import { useSlides } from './SlidesManager'
import { TEXT_PRIMARY } from '../arena/constants'

const clampValue = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

export const SlideLabelsOverlay = memo(() => {
  const editor = useEditor()

  const viewportBounds = useValue(
    'viewportPageBounds',
    () => editor.getViewportPageBounds(),
    [editor]
  )

  const slides = useValue(
    'slides',
    () =>
      editor.getCurrentPageShapes().filter((shape): shape is SlideShape => shape.type === 'slide'),
    [editor]
  )

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
      {slides.map((slide) => (
        <SlideLabel
          key={slide.id}
          slide={slide}
          viewportBounds={viewportBounds}
        />
      ))}
    </div>
  )
})

const SlideLabel = memo(({
  slide,
  viewportBounds,
}: {
  slide: SlideShape
  viewportBounds: { x: number; y: number; w: number; h: number }
}) => {
  const editor = useEditor()
  const slides = useSlides()
  const labelRef = useRef<HTMLDivElement>(null)
  const [isHovered, setIsHovered] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const slideManagerId = useMemo(() => {
    const id = String(slide.id)
    return id.startsWith('shape:') ? id.slice('shape:'.length) : id
  }, [slide.id])

  const baseFontPx = 36
  const fontSize = clampValue(baseFontPx, 24, 38)
  const paddingX = clampValue(16, 8, 24)
  const paddingY = clampValue(10, 6, 18)
  const labelOffset = clampValue(4, 2, 12)
  const labelHeight = fontSize * 1.2 + paddingY * 2

  const positioning = useMemo(() => {
    const slideLeft = slide.x
    const slideTop = slide.y
    const slideWidth = slide.props.w
    const slideHeight = slide.props.h

    const labelLeft = Math.max(0, viewportBounds.x - slideLeft)
    const labelTop = Math.max(labelOffset, viewportBounds.y - slideTop)

    const isWithinBounds =
      labelLeft < slideWidth &&
      labelTop < slideHeight &&
      labelLeft + 200 > 0 &&
      labelTop + labelHeight > 0

    const pagePos = {
      x: slideLeft + labelLeft,
      y: slideTop + labelTop,
    }
    const screenPos = editor.pageToScreen(pagePos)

    return { screenPos, isWithinBounds }
  }, [
    slide.x,
    slide.y,
    slide.props.w,
    slide.props.h,
    viewportBounds.x,
    viewportBounds.y,
    labelOffset,
    labelHeight,
    editor,
  ])

  const { screenPos, isWithinBounds } = positioning

  const handleClick = (e: React.MouseEvent) => {
    if (!isEditing) {
      e.preventDefault()
      e.stopPropagation()
      slides.setCurrentSlide(slideManagerId)
    }
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsEditing(true)
    setTimeout(() => {
      labelRef.current?.focus()
      const range = document.createRange()
      const sel = window.getSelection()
      if (labelRef.current && sel) {
        range.selectNodeContents(labelRef.current)
        sel.removeAllRanges()
        sel.addRange(range)
      }
    }, 0)
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: screenPos.x,
        top: screenPos.y,
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
          opacity: isEditing ? 1.0 : isHovered ? 0.9 : 0.8,
          fontWeight: 'bold',
          letterSpacing: '-0.0125em',
          color: isEditing ? TEXT_PRIMARY : 'rgba(15, 23, 42, 0.02)',
          textShadow: isEditing
            ? 'none'
            : '1px 1px 1px rgba(255, 255, 255, 0.6), -0.5px -0.5px 1px rgba(15, 23, 42, 0.12)',
          paddingLeft: paddingX,
          paddingTop: paddingY,
          paddingRight: paddingX,
          paddingBottom: paddingY,
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
          if (newLabel !== slide.props.label) {
            slides.updateSlideName(slideManagerId, newLabel)
            editor.updateShape({
              id: slide.id,
              type: 'slide',
              props: { ...slide.props, label: newLabel },
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
            e.currentTarget.textContent = slide.props.label
            e.currentTarget.blur()
          }
        }}
      >
        {slide.props.label} 
      </div>
    </div>
  )
})
