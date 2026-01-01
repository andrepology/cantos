import React, { useEffect, useRef, useState, useMemo, useCallback, useDeferredValue, memo } from 'react'

import { Editor, Tldraw, createShapeId, transact, useEditor, useValue, DefaultToolbar, TldrawUiMenuItem, useTools, useIsToolSelected, stopEventPropagation, DefaultFontStyle, preventDefault, EASINGS, loadSnapshot } from 'tldraw'
import type { TLFrameShape, TLUiAssetUrlOverrides } from 'tldraw'
import { SlideShapeUtil } from '../shapes/SlideShape'
import { TactilePortalShapeUtil } from '../shapes/TactilePortalShape'
import { ArenaBlockShapeUtil } from '../shapes/ArenaBlockShape'
import type { TLComponents, TLUiOverrides } from 'tldraw'
import type { SlideShape } from '../shapes/SlideShape'
import 'tldraw/tldraw.css'
import { useCanvasPersistence } from '../jazz/useCanvasPersistence'
import { PortalBrushTool } from '../tools/lasso/PortalBrushTool'
import { ArenaBlockTool } from '../tools/ArenaBlockTool'
import { CustomSelectTool } from '../tools/CustomSelectTool'
import { LassoOverlays } from '../tools/lasso/LassoOverlays'
import FpsOverlay from './FpsOverlay'
import { TilingPreviewManager } from './TilingPreviewManager'
import { TactileCursor } from './TactileCursor'
import { MetadataPanelOverlay } from './MetadataPanelOverlay'
import { CustomToolbar } from './CustomToolbar'
import { HoverSelectionHandles } from './HoverSelectionHandles'


// Use shared slides manager and constants
import { SLIDE_MARGIN, SLIDE_SIZE, SlidesProvider, useSlides } from './SlidesManager'

DefaultFontStyle.setDefaultValue('sans')

// Configure once at module scope to keep a stable reference across renders


export default function SlideEditor() {
  return (
    <div className="tldraw__editor curl-tldraw-theme">
      <SlidesProvider>
        <InsideSlidesContext />
      </SlidesProvider>
    </div>
  )
}

// Stable container for the toolbar to avoid remounting between renders
const ToolbarContainer = memo(function ToolbarContainer() {
  return (
    <div style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      pointerEvents: 'none',
      zIndex: 10000, // Higher than slide labels (9999) to ensure toolbar is always clickable
    }}>
      <div style={{ pointerEvents: 'auto' }}>
        <CustomToolbar />
      </div>
    </div>
  )
})

function InsideSlidesContext() {
  const [editor, setEditor] = useState<Editor | null>(null)
  const slides = useSlides()
  const focusTimeoutRef = useRef<number | null>(null)

  const currentSlide = useValue('currentSlide', () => slides.getCurrentSlide(), [slides])
  const currentSlides = useValue('slides', () => slides.getCurrentSlides(), [])

  const focusSlide = useCallback((slide: any, animate = true) => {
    if (!editor) return
    if (focusTimeoutRef.current !== null) {
      window.clearTimeout(focusTimeoutRef.current)
      focusTimeoutRef.current = null
    }
    const animationDurationMs = animate ? 200 : 0

    // Define the slide bounds for proper framing
    const slideBounds = {
      x: 0, // Fixed horizontal position for vertical stacking
      y: slide.index * (SLIDE_SIZE.h + SLIDE_MARGIN), // Vertical stacking
      w: SLIDE_SIZE.w,
      h: SLIDE_SIZE.h,
    }

    // Clear constraints temporarily for smooth animation
    editor.setCameraOptions({
      constraints: undefined, // Remove constraints during transition
    })

    // Pan vertically to center the target slide while preserving zoom and x
    const cam = editor.getCamera()
    const vpb = editor.getViewportPageBounds()
    const slideCenterY = slideBounds.y + slideBounds.h / 2
    const deltaY = slideCenterY - vpb.midY
   
    const targetCamera = { ...cam, y: cam.y - deltaY }

    editor.setCamera(targetCamera, {
      animation: animate ? {
        duration: animationDurationMs,
        easing: EASINGS.easeInOutCubic
      } : undefined,
    })

    // After animation completes, set track constraints for manual panning
    // We use a timeout to ensure animation finishes before applying constraints
    focusTimeoutRef.current = window.setTimeout(() => {
      // Check if we are still targeting this slide (user might have switched again)
      const currentId = slides.getCurrentSlideId()
      if (currentId !== slide.id) {
        focusTimeoutRef.current = null
        return
      }

      const trackBounds = {
        x: slideBounds.x - 128,
        y: slideBounds.y, // Constrain to current slide's vertical position
        w: slideBounds.w * 1.25,
        h: slideBounds.h, // Constrain height to single slide
      }

      editor.setCameraOptions({
        constraints: {
          bounds: trackBounds,
          behavior: 'contain', // Constrain camera to stay within track bounds
          initialZoom: 'default',
          baseZoom: 'default',
          origin: { x: 0.5, y: 0.5 },
          padding: { x: 0, y: 12 },
        },
      })
      focusTimeoutRef.current = null
    }, animationDurationMs > 0 ? animationDurationMs + 20 : 0)
  }, [editor, slides])

  useEffect(() => {
    if (!editor || !currentSlide) return
    focusSlide(currentSlide)
  }, [editor, currentSlide, focusSlide])

  useEffect(() => {
    return () => {
      if (focusTimeoutRef.current !== null) {
        window.clearTimeout(focusTimeoutRef.current)
        focusTimeoutRef.current = null
      }
    }
  }, [])

  // "Breakout & Snap" Logic
  // useEffect(() => {
  //   if (!editor) return

  //   // 1. LIVE BREAKOUT: Drop constraints when zoomed out
  //   const cleanupStore = editor.store.listen((entry) => {
  //     // Check if camera changed (optimization)
  //     const changes = entry.changes
  //     const isCameraChange = (changes.updated as any)['camera:page:' + editor.getCurrentPageId()]
  //     if (!isCameraChange) return

  //     const constraints = editor.getCameraOptions().constraints
  //     if (!constraints) return // Already free

  //     const viewport = editor.getViewportPageBounds()
  //     // Check ratio of Slide Width to Viewport Width
  //     // If slide occupies less than 70% of screen width, we consider it "zoomed out"
  //     const coverage = SLIDE_SIZE.w / viewport.w
      
  //     if (coverage < 0.70) {
  //        editor.setCameraOptions({ constraints: undefined })
  //     }
  //   })

  //   // 2. SNAP ON RELEASE: Magnetize to nearest slide
  //   const handlePointerUp = () => {
  //       const constraints = editor.getCameraOptions().constraints
  //       if (constraints) return // Already locked, ignore

  //       const center = editor.getViewportPageBounds().center
  //       const allSlides = slides.getCurrentSlides()
        
  //       let closest = null
  //       let minDist = Infinity
        
  //       // Find slide closest to viewport center
  //       for (const slide of allSlides) {
  //           const slideCenterY = slide.index * (SLIDE_SIZE.h + SLIDE_MARGIN) + SLIDE_SIZE.h / 2
  //           const slideCenterX = SLIDE_SIZE.w / 2 
            
  //           // Calculate distance (prioritizing Y axis as slides are vertical)
  //           const dy = Math.abs(center.y - slideCenterY)
  //           const dx = Math.abs(center.x - slideCenterX)
            
  //           // We use a weighted distance to prefer vertical alignment but respect horizontal proximity
  //           const dist = Math.sqrt(dx*dx + dy*dy)
            
  //           if (dist < minDist) {
  //               minDist = dist
  //               closest = slide
  //           }
  //       }

  //       // Snap threshold: If within reasonable distance (e.g. 1.5x slide height)
  //       // This allows "flinging" the camera near a slide to catch it
  //       if (closest && minDist < SLIDE_SIZE.h * 1.5) {
  //           if (closest.id !== slides.getCurrentSlideId()) {
  //               slides.setCurrentSlide(closest.id)
  //               // The main useEffect will trigger focusSlide
  //           } else {
  //               // If same slide, re-lock explicitly since ID didn't change
  //               focusSlide(closest)
  //           }
  //       }
  //   }
    
  //   window.addEventListener('pointerup', handlePointerUp)

  //   return () => {
  //     cleanupStore()
  //     window.removeEventListener('pointerup', handlePointerUp)
  //   }
  // }, [editor, slides, focusSlide])

  // Keep the frame-shape syncing from the example (acts as visual ruler segments)
  useEffect(() => {
    if (!editor) return

    const ids = currentSlides.map((slide) => createShapeId(slide.id))

    transact(() => {
      for (let i = 0; i < currentSlides.length; i++) {
        const shapeId = ids[i]
        const slide = currentSlides[i]
        const shape = editor.getShape(shapeId)
        const x = 0 // Fixed horizontal position for vertical stacking
        const y = slide.index * (SLIDE_SIZE.h + SLIDE_MARGIN) // Vertical stacking
        if (shape) {
          if (shape.x === x && shape.y === y) continue

          // Use the slide name from SlidesManager
          const name = slide.name

          if ((shape as any).type === 'frame') {
            // migrate frame -> slide, preserving id and dimensions
            const prev = shape as TLFrameShape
            editor.deleteShape(prev)
            editor.createShape({
              id: shapeId,
              parentId: editor.getCurrentPageId(),
              type: 'slide',
              x,
              y,
              isLocked: true,
              props: {
                w: prev.props.w,
                h: prev.props.h,
                label: name,
              },
            })
            continue
          }

          editor.updateShape({
            id: shapeId,
            type: 'slide',
            x,
            y,
            props: {
              label: name,
            },
          })
        } else {
          editor.createShape({
            id: shapeId,
            parentId: editor.getCurrentPageId(),
            type: 'slide',
            x,
            y,
            isLocked: true,
            props: {
              label: slide.name,
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

    // Prevent deletion/erasing of slide shapes
    unsubs.push(
      editor.sideEffects.registerBeforeChangeHandler('shape', (prev, next) => {
        // When a shape is being deleted, `next` will be undefined. If it's a slide, cancel.
        if (prev && (prev as any).type === 'slide' && (next as any) === undefined) {
          return prev
        }
        return next
      })
    )

    return () => {
      unsubs.forEach((fn) => fn())
    }
  }, [currentSlides, editor])

  const handleMount = (ed: Editor) => {
    setEditor(ed)
    // Make editor accessible for console commands (e.g. exporting default slide)
    ;(window as any).editor = ed
    
    // ed.updateInstanceState({ isGridMode: true }) // Disabled grid snapping

    performance.mark('tldraw:mounted')
  }

  const canvasState = useCanvasPersistence(editor, 'slides-track')

  useEffect(() => {
    if (!editor) return
    if (!canvasState.hydrated) return
    if (slides.getCurrentSlides().length > 0) return

    const syncSlidesFromStore = () => {
      const slideShapes = editor
        .getCurrentPageShapes()
        .filter((shape): shape is SlideShape => shape.type === 'slide')

      if (slideShapes.length > 0) {
        const stride = SLIDE_SIZE.h + SLIDE_MARGIN
        const rebuiltSlides = slideShapes
          .map((shape) => {
            const rawId = String(shape.id)
            const id = rawId.startsWith('shape:') ? rawId.slice('shape:'.length) : rawId
            return {
              id,
              index: Math.round(shape.y / stride),
              name: shape.props.label,
            }
          })
          .sort((a, b) => (a.index < b.index ? -1 : 1))
        slides.setSlides(rebuiltSlides, rebuiltSlides[0]?.id)
        return true
      }
      return false
    }

    // 1. Try to sync from existing store (e.g. hydrated from persistence)
    if (syncSlidesFromStore()) return

    // 2. If store is empty, try to fetch default template
    fetch('/default-slide.json')
      .then((res) => {
        if (!res.ok) throw new Error('No default template')
        return res.json()
      })
      .then((snapshot) => {
        console.log('[SlideEditor] Loading default template...')
        loadSnapshot(editor.store, snapshot)
        // Sync again after loading snapshot
        if (!syncSlidesFromStore()) {
          slides.seedDefaults()
        }
      })
      .catch(() => {
        // 3. Fallback to hardcoded defaults
        console.log('[SlideEditor] No default template found, seeding defaults.')
        slides.seedDefaults()
      })
  }, [canvasState.hydrated, editor, slides])

  return (
    <div onContextMenu={preventDefault} style={{ width: '100%', height: '100%' }}>
      <Tldraw
        onMount={handleMount}
        components={useMemo(() => ({
          ...components,
          Toolbar: ToolbarContainer,
        }), [])}
        shapeUtils={[SlideShapeUtil, TactilePortalShapeUtil, ArenaBlockShapeUtil]}
        tools={[CustomSelectTool, PortalBrushTool, ArenaBlockTool]}
        overrides={uiOverrides}
        assetUrls={customAssetUrls}
      />
    </div>
  )
}


function Slides() {
  const slides = useSlides()
  const currentSlides = useValue('slides', () => slides.getCurrentSlides(), [slides])
  const lowestIndex = currentSlides[0]?.index ?? 0
  const highestIndex = currentSlides[currentSlides.length - 1]?.index ?? 0

  return (
    <>
      {/* Keep UI shell intact: between-segment and edge + buttons
      {currentSlides.slice(0, -1).map((slide) => (
        <button
          key={slide.id + 'between'}
          disabled={true}
          style={{
            position: 'absolute',
            left: SLIDE_SIZE.w / 2, // Center horizontally
            top: (slide.index + 1) * (SLIDE_SIZE.h + SLIDE_MARGIN) - (SLIDE_MARGIN + 40) / 2, // Position vertically between slides
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
          +
        </button>
      ))}
      <button
        style={{
          position: 'absolute',
          left: SLIDE_SIZE.w / 2,
          top: lowestIndex * (SLIDE_SIZE.h + SLIDE_MARGIN) - (40 + SLIDE_MARGIN * 0.1),
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
          left: SLIDE_SIZE.w / 2,
          top: highestIndex * (SLIDE_SIZE.h + SLIDE_MARGIN) + (SLIDE_SIZE.h + SLIDE_MARGIN * 0.1),
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
      </button> */}
    </>
  )
}


const components: TLComponents = {
  // Keep only the default Toolbar; hide most other built-in UI
  ContextMenu: null,
  ActionsMenu: null,
  HelpMenu: null,
  ZoomMenu: null,
  MainMenu: null,
  Minimap: null,
  StylePanel: null,
  PageMenu: null,
  NavigationPanel: null,
  RichTextToolbar: null,
  ImageToolbar: null,
  VideoToolbar: null,
  KeyboardShortcutsDialog: null,
  QuickActions: null,
  HelperButtons: null,
  DebugPanel: null,
  DebugMenu: null,
  MenuPanel: null,
  TopPanel: null,
  SharePanel: null,
  CursorChatBubble: null,
  Dialogs: null,
  Toasts: null,

  Grid: null,
  OnTheCanvas: Slides,
  InFrontOfTheCanvas: () => (
    <>
      <TactileCursor />
      {/* <FpsOverlay /> */}
      <MetadataPanelOverlay />
    </>
  ),
  Toolbar: null,
  Overlays: () => (
    <>
      <LassoOverlays />
      <HoverSelectionHandles />
      <TilingPreviewManager />
    </>
  ),
}

const customAssetUrls: TLUiAssetUrlOverrides = {
  icons: {

    'pencil': '/icons/pencil.svg',
    'lasso': '/icons/lasso.svg',
    'plus': '/icons/plus.svg',
  },
}

const uiOverrides: TLUiOverrides = {
  tools: (editor, tools) => ({
    ...tools,
    draw: {
      ...tools.draw,
      icon: 'pencil',
    },
    'portal-brush': {
      id: 'portal-brush',
      label: 'Portal',
      icon: 'lasso',
      kbd: 'p',
      onSelect() {
        editor.setCurrentTool('portal-brush')
      },
    },
  }),
}
