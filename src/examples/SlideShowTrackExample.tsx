import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Editor, Tldraw, createShapeId, transact, useEditor, useValue, approximately, useIsDarkMode } from 'tldraw'
import type { TLFrameShape } from 'tldraw'
import type { TLComponents } from 'tldraw'
import 'tldraw/tldraw.css'

// Use shared slides manager and constants
import { SLIDE_MARGIN, SLIDE_SIZE, SlidesProvider, useSlides } from './SlidesManager'

export default function SlideShowExample() {
  return (
    <div className="tldraw__editor">
      <SlidesProvider>
        <InsideSlidesContext />
      </SlidesProvider>
    </div>
  )
}

function InsideSlidesContext() {
  const [editor, setEditor] = useState<Editor | null>(null)
  const slides = useSlides()

  const currentSlide = useValue('currentSlide', () => slides.getCurrentSlide(), [slides])
  const currentSlides = useValue('slides', () => slides.getCurrentSlides(), [slides])

  useEffect(() => {
    if (!editor) return
    const nextBounds = {
      x: currentSlide.index * (SLIDE_SIZE.w + SLIDE_MARGIN),
      y: 0,
      w: SLIDE_SIZE.w,
      h: SLIDE_SIZE.h,
    }
    editor.setCameraOptions({
      constraints: {
        bounds: nextBounds,
        behavior: 'contain',
        initialZoom: 'fit-max',
        baseZoom: 'fit-max',
        origin: { x: 0.5, y: 0.5 },
        padding: { x: 50, y: 50 },
      },
    })

    editor.zoomToBounds(nextBounds, { force: true, animation: { duration: 500 } })
  }, [editor, currentSlide])

  // Keep the frame-shape syncing from the example (acts as visual ruler segments)
  useEffect(() => {
    if (!editor) return

    const ids = currentSlides.map((slide) => createShapeId(slide.id))

    transact(() => {
      for (let i = 0; i < currentSlides.length; i++) {
        const shapeId = ids[i]
        const slide = currentSlides[i]
        const shape = editor.getShape(shapeId)
        const x = slide.index * (SLIDE_SIZE.w + SLIDE_MARGIN)
        if (shape) {
          if (shape.x === x) continue

          const regex = /Slide \d+/
          let name = (shape as TLFrameShape).props.name
          if (regex.test((shape as TLFrameShape).props.name)) {
            name = `Slide ${slide.index + 1}`
          }

          editor.updateShape<TLFrameShape>({
            id: shapeId,
            type: 'frame',
            x,
            props: {
              name,
            },
          })
        } else {
          editor.createShape<TLFrameShape>({
            id: shapeId,
            parentId: editor.getCurrentPageId(),
            type: 'frame',
            x,
            y: 0,
            props: {
              name: `Slide ${slide.index + 1}`,
              w: SLIDE_SIZE.w,
              h: SLIDE_SIZE.h,
            },
          })
        }
      }
    })

    const unsubs: Array<() => void> = []

    // Keep example's name guard
    unsubs.push(
      editor.sideEffects.registerBeforeChangeHandler('shape', (prev, next) => {
        if (
          ids.includes(next.id) &&
          (next as TLFrameShape).props.name === (prev as TLFrameShape).props.name
        )
          return prev
        return next
      })
    )

    // Selection filter (example behavior)
    unsubs.push(
      editor.sideEffects.registerBeforeChangeHandler('instance_page_state', (_prev, next) => {
        next.selectedShapeIds = next.selectedShapeIds.filter((id) => !ids.includes(id))
        if (next.hoveredShapeId && ids.includes(next.hoveredShapeId)) next.hoveredShapeId = null
        return next
      })
    )

    return () => {
      unsubs.forEach((fn) => fn())
    }
  }, [currentSlides, editor])

  const handleMount = (ed: Editor) => {
    setEditor(ed)
    ed.updateInstanceState({ isGridMode: true })
  }

  return <Tldraw onMount={handleMount} components={components} />
}

function Slides() {
  const slides = useSlides()
  const currentSlides = useValue('slides', () => slides.getCurrentSlides(), [slides])
  const lowestIndex = currentSlides[0].index
  const highestIndex = currentSlides[currentSlides.length - 1].index

  return (
    <>
      {/* Keep UI shell intact: between-segment and edge + buttons */}
      {currentSlides.slice(0, -1).map((slide) => (
        <button
          key={slide.id + 'between'}
          style={{
            position: 'absolute',
            top: SLIDE_SIZE.h / 2,
            left: (slide.index + 1) * (SLIDE_SIZE.w + SLIDE_MARGIN) - (SLIDE_MARGIN + 40) / 2,
            width: 40,
            height: 40,
            pointerEvents: 'all',
          }}
          onPointerDown={markEventAsHandled}
          onClick={() => {
            const newSlide = slides.newSlide(slide.index + 1)
            slides.setCurrentSlide(newSlide.id)
          }}
        >
          |
        </button>
      ))}
      <button
        style={{
          position: 'absolute',
          top: SLIDE_SIZE.h / 2,
          left: lowestIndex * (SLIDE_SIZE.w + SLIDE_MARGIN) - (40 + SLIDE_MARGIN * 0.1),
          width: 40,
          height: 40,
          pointerEvents: 'all',
        }}
        onPointerDown={markEventAsHandled}
        onClick={() => {
          const slide = slides.newSlide(lowestIndex - 1)
          slides.setCurrentSlide(slide.id)
        }}
      >
        {`+`}
      </button>
      <button
        style={{
          position: 'absolute',
          top: SLIDE_SIZE.h / 2,
          left: highestIndex * (SLIDE_SIZE.w + SLIDE_MARGIN) + (SLIDE_SIZE.w + SLIDE_MARGIN * 0.1),
          width: 40,
          height: 40,
          pointerEvents: 'all',
        }}
        onPointerDown={markEventAsHandled}
        onClick={() => {
          const slide = slides.newSlide(highestIndex + 1)
          slides.setCurrentSlide(slide.id)
        }}
      >
        {`+`}
      </button>
    </>
  )
}

function SlideControls() {
  const slides = useSlides()

  return (
    <>
      <button
        style={{
          pointerEvents: 'all',
          position: 'absolute',
          top: '50%',
          left: 0,
          width: 50,
          height: 50,
        }}
        onPointerDown={markEventAsHandled}
        onClick={() => slides.prevSlide()}
      >
        {`<`}
      </button>
      <button
        style={{
          pointerEvents: 'all',
          position: 'absolute',
          top: '50%',
          right: 0,
          width: 50,
          height: 50,
        }}
        onPointerDown={markEventAsHandled}
        onClick={() => slides.nextSlide()}
      >
        {`>`}
      </button>
    </>
  )
}

const components: TLComponents = {
  // Draw gridlines per docs example to verify; snap-to-grid is enabled via isGridMode
  Grid: ({ size, ...camera }) => {
    const editor = useEditor()
    const screenBounds = useValue('screenBounds', () => editor.getViewportScreenBounds(), [])
    const devicePixelRatio = useValue('dpr', () => editor.getInstanceState().devicePixelRatio, [])
    const isDarkMode = useIsDarkMode()
    const canvas = useRef<HTMLCanvasElement>(null)

    useLayoutEffect(() => {
      if (!canvas.current) return
      const canvasW = screenBounds.w * devicePixelRatio
      const canvasH = screenBounds.h * devicePixelRatio
      canvas.current.width = canvasW
      canvas.current.height = canvasH

      const ctx = canvas.current.getContext('2d')
      if (!ctx) return

      // Clear the canvas
      ctx.clearRect(0, 0, canvasW, canvasH)

      // Compute visible page-space grid lines
      const pageViewportBounds = editor.getViewportPageBounds()
      const startPageX = Math.ceil(pageViewportBounds.minX / size) * size
      const startPageY = Math.ceil(pageViewportBounds.minY / size) * size
      const endPageX = Math.floor(pageViewportBounds.maxX / size) * size
      const endPageY = Math.floor(pageViewportBounds.maxY / size) * size
      const numRows = Math.round((endPageY - startPageY) / size)
      const numCols = Math.round((endPageX - startPageX) / size)

      ctx.strokeStyle = isDarkMode ? '#555' : '#BBB'

      for (let row = 0; row <= numRows; row++) {
        const pageY = startPageY + row * size
        const canvasY = (pageY + camera.y) * camera.z * devicePixelRatio
        const isMajorLine = approximately(pageY % (size * 10), 0)
        drawLine(ctx, 0, canvasY, canvasW, canvasY, isMajorLine ? 3 : 1)
      }
      for (let col = 0; col <= numCols; col++) {
        const pageX = startPageX + col * size
        const canvasX = (pageX + camera.x) * camera.z * devicePixelRatio
        const isMajorLine = approximately(pageX % (size * 10), 0)
        drawLine(ctx, canvasX, 0, canvasX, canvasH, isMajorLine ? 3 : 1)
      }
    }, [screenBounds, camera, size, devicePixelRatio, editor, isDarkMode])

    return <canvas className="tl-grid" ref={canvas} />
  },
  OnTheCanvas: Slides,
  InFrontOfTheCanvas: SlideControls,
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number
) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.lineWidth = width
  ctx.stroke()
}

function markEventAsHandled(e: { stopPropagation: () => void; preventDefault: () => void }) {
  e.stopPropagation()
  e.preventDefault()
}



