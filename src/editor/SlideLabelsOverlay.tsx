import React, { memo } from 'react'
import { useEditor, useValue } from 'tldraw'
import type { SlideShape } from '../shapes/SlideShape'
import { useSlides } from './SlidesManager'

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

  // Pre-calculated values from parent - fixed font size, no zoom scaling
  const baseFontPx = 18
  const fontSize = baseFontPx
  const labelHeight = fontSize * 1.2 + 10
  const labelOffset = 4

  // Hover state for visual feedback - memoized to prevent re-renders
  const [isHovered, setIsHovered] = React.useState(false)

  // Memoize expensive calculations
  const positioning = React.useMemo(() => {
    const slideLeft = slide.x
    const slideTop = slide.y
    const slideWidth = slide.props.w
    const slideHeight = slide.props.h
    const labelLeft = Math.max(0, viewportBounds.x - slideLeft)
    const labelTop = Math.max(labelOffset, viewportBounds.y - slideTop)

    const pagePos = {
      x: slideLeft + labelLeft,
      y: slideTop + labelTop
    }
    const screenPos = editor.pageToScreen(pagePos)

    const maxWidth = Math.max(0, slideWidth - labelLeft)
    const maxHeight = Math.max(0, slideHeight - labelTop)
    const constrainedWidth = maxWidth
    const constrainedHeight = Math.min(labelHeight, maxHeight)

    return { screenPos, constrainedWidth, constrainedHeight }
  }, [slide.x, slide.y, slide.props.w, slide.props.h, viewportBounds.x, viewportBounds.y, editor])

  // Use memoized positioning calculations
  const { screenPos } = positioning

  const handleClick = (e: React.MouseEvent) => {
    // Only navigate if not currently editing (contentEditable)
    if (!isSelected) {
      e.preventDefault()
      e.stopPropagation()

      // Find the slide by label since shape IDs are different from slide IDs
      const targetSlide = slides.getCurrentSlides().find(s => s.name === slide.props.label)
      if (targetSlide) {
        slides.setCurrentSlide(targetSlide.id)
      }
    }
  }

  const handleMouseEnter = () => {
    if (!isSelected) {
      setIsHovered(true)
    }
  }

  const handleMouseLeave = () => {
    setIsHovered(false)
  }

  const isClickable = !isSelected

  return (
    <div
      style={{
        position: 'fixed',
        left: screenPos.x,
        top: screenPos.y,
        pointerEvents: 'auto', // Always allow pointer events for hover/click
        zIndex: 9999,
        cursor: isClickable ? 'pointer' : 'text',
      }}
      onClick={isClickable ? handleClick : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        style={{
          fontFamily: "'Alte Haas Grotesk', sans-serif",
          fontSize: `${fontSize}px`,
          lineHeight: 1.0,
          opacity: isSelected ? 0.2 : (isHovered ? 0.7 : 0.4), // Selected: dim, Clickable: hover brightens
          fontWeight: 'bold',
          letterSpacing: '-0.0125em',
          color: 'var(--color-text)',
          paddingLeft: 16,
          paddingTop: 10,
          paddingRight: 16, // Add right padding for better visual balance
          paddingBottom: 10, // Add bottom padding for better visual balance
          textAlign: 'left',
          verticalAlign: 'top',
          display: 'inline-block', // Size to content instead of full width
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          userSelect: isSelected ? 'auto' : 'none',
          pointerEvents: isSelected ? 'auto' : 'none',
          outline: 'none',
          border: 'none',
          background: 'transparent',
          transition: 'opacity 0.15s ease',
          cursor: isClickable ? 'pointer' : 'text',
          whiteSpace: 'nowrap', // Prevent text wrapping
        }}
        contentEditable={isSelected}
        suppressContentEditableWarning={true}
        onBlur={(e) => {
          const newLabel = e.currentTarget.textContent || 'Slide'
          if (newLabel !== slide.props.label) {
            editor.updateShape({
              id: slide.id,
              type: 'slide',
              props: { ...slide.props, label: newLabel }
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
        {slide.props.label}
      </div>
    </div>
  )
})
