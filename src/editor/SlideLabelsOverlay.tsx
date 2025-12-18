import React, { memo } from 'react'
import { useEditor, useValue } from 'tldraw'
import type { SlideShape } from '../shapes/SlideShape'
import { useSlides } from './SlidesManager'
import { TEXT_COLOR_CSS, TEXT_OPACITY_SUBTLE } from '../arena/styles/deckStyles'

export const SlideLabelsOverlay = memo(() => {
  const editor = useEditor()

  // Combine viewport and zoom data to reduce subscriptions
  const cameraState = useValue('camera', () => ({
    viewport: editor.getViewportPageBounds(),
    zoom: editor.getZoomLevel()
  }), [editor])

  // Get slides and selection state
  const slides = useValue('slides', () =>
    editor.getCurrentPageShapes().filter((shape): shape is SlideShape =>
      shape.type === 'slide'
    ), [editor]
  )

  const selectedIds = useValue('selected', () => editor.getSelectedShapeIds(), [editor])

  // Extract values for easier access
  const { viewport: viewportBounds } = cameraState

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
      {slides.map(slide => (
        <SlideLabel
          key={slide.id}
          slide={slide}
          viewportBounds={viewportBounds}
          isSelected={selectedIds.includes(slide.id)}
        />
      ))}
    </div>
  )
})

const SlideLabel = memo(({
  slide,
  viewportBounds,
  isSelected
}: {
  slide: SlideShape
  viewportBounds: { x: number; y: number; w: number; h: number }
  isSelected: boolean
}) => {
  const editor = useEditor()
  const slides = useSlides()
  const slideManagerId = React.useMemo(() => {
    const id = String(slide.id)
    return id.startsWith('shape:') ? id.slice('shape:'.length) : id
  }, [slide.id])

  // Pre-calculated values from parent - fixed font size, no zoom scaling
  const baseFontPx = 18
  const fontSize = baseFontPx
  const labelHeight = fontSize * 1.2 + 10
  const labelOffset = 4

  // Hover state for visual feedback - memoized to prevent re-renders
  const [isHovered, setIsHovered] = React.useState(false)
  const [isEditing, setIsEditing] = React.useState(false)
  const labelRef = React.useRef<HTMLDivElement>(null)

  // Memoize expensive calculations
  const positioning = React.useMemo(() => {
    const slideLeft = slide.x
    const slideTop = slide.y
    const slideWidth = slide.props.w
    const slideHeight = slide.props.h
    
    // Check if label would be within slide bounds
    // Label anchors to slide's top-left, constrained by viewport intersection
    const labelLeft = Math.max(0, viewportBounds.x - slideLeft)
    const labelTop = Math.max(labelOffset, viewportBounds.y - slideTop)
    
    // Only render if the label position is within the slide bounds
    const isWithinBounds = 
      labelLeft < slideWidth && 
      labelTop < slideHeight &&
      labelLeft + 200 > 0 && // assume rough label width
      labelTop + labelHeight > 0

    const pagePos = {
      x: slideLeft + labelLeft,
      y: slideTop + labelTop
    }
    const screenPos = editor.pageToScreen(pagePos)

    const maxWidth = Math.max(0, slideWidth - labelLeft)
    const maxHeight = Math.max(0, slideHeight - labelTop)
    const constrainedWidth = maxWidth
    const constrainedHeight = Math.min(labelHeight, maxHeight)

    return { screenPos, constrainedWidth, constrainedHeight, isWithinBounds }
  }, [slide.x, slide.y, slide.props.w, slide.props.h, viewportBounds.x, viewportBounds.y, editor])

  // Use memoized positioning calculations
  const { screenPos, isWithinBounds } = positioning

  const handleClick = (e: React.MouseEvent) => {
    // Navigate to slide on single click
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
    // Focus the contentEditable div after render
    setTimeout(() => {
      labelRef.current?.focus()
      // Select all text for immediate replacement
      const range = document.createRange()
      const sel = window.getSelection()
      if (labelRef.current && sel) {
        range.selectNodeContents(labelRef.current)
        sel.removeAllRanges()
        sel.addRange(range)
      }
    }, 0)
  }

  const handleMouseEnter = () => {
    if (!isEditing) {
      setIsHovered(true)
    }
  }

  const handleMouseLeave = () => {
    setIsHovered(false)
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
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        ref={labelRef}
        style={{
          fontFamily: "'Alte Haas Grotesk', sans-serif",
          fontSize: `${fontSize}px`,
          lineHeight: 1.0,
          opacity: isEditing ? 1.0 : (isHovered ? 0.7 : TEXT_OPACITY_SUBTLE),
          fontWeight: 'bold',
          letterSpacing: '-0.0125em',
          color: TEXT_COLOR_CSS,
          paddingLeft: 16,
          paddingTop: 10,
          paddingRight: 16,
          paddingBottom: 10,
          textAlign: 'left',
          verticalAlign: 'top',
          display: 'inline-block',
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          userSelect: isEditing ? 'auto' : 'none',
          pointerEvents: 'auto',
          border: 'none',
          background: isEditing ? 'rgba(255,255,255,0.01)' : 'transparent',
          transition: 'opacity 0.15s ease, outline 0.15s ease, background 0.15s ease',
          cursor: isEditing ? 'text' : 'pointer',
          whiteSpace: 'nowrap',
          borderRadius: 4,
        }}
        contentEditable={isEditing}
        suppressContentEditableWarning={true}
        onBlur={(e) => {
          const newLabel = e.currentTarget.textContent || 'Slide'
          if (newLabel !== slide.props.label) {
            // Update SlidesManager (source of truth)
            slides.updateSlideName(slideManagerId, newLabel)
            // Update tldraw shape for visual consistency
            editor.updateShape({
              id: slide.id,
              type: 'slide',
              props: { ...slide.props, label: newLabel }
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
            // Revert to original text
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
