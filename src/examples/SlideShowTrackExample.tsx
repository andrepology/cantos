import { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react'
import { Editor, Tldraw, createShapeId, transact, useEditor, useValue, approximately, useIsDarkMode, DefaultToolbar, TldrawUiMenuItem, useTools, useIsToolSelected, stopEventPropagation, DefaultFontStyle, TldrawOverlays, getSvgPathFromPoints } from 'tldraw'
import { LassoingState } from '../tools/lasso/LassoSelectTool'
import * as Popover from '@radix-ui/react-popover'
import type { TLFrameShape, TLUiAssetUrlOverrides } from 'tldraw'
import { SlideShapeUtil } from '../shapes/SlideShape'
import { ThreeDBoxShapeUtil } from '../shapes/ThreeDBoxShape'
import { ArenaBlockShapeUtil } from '../shapes/ArenaBlockShape'
import type { TLComponents, TLUiOverrides } from 'tldraw'
import 'tldraw/tldraw.css'
import { useCanvasPersistence } from '../jazz/useCanvasPersistence'
import { VoiceMemoShapeUtil } from '../shapes/VoiceMemoShape'
import { VoiceMemoTool } from '../tools/VoiceMemoTool'
import { ThreeDBoxTool } from '../tools/ThreeDBoxTool'
import { LaserTool } from '../tools/laser/LaserTool'
import { LassoSelectTool } from '../tools/lasso/LassoSelectTool'
import { LassoOverlays } from '../tools/lasso/LassoOverlays'
import FpsOverlay from './FpsOverlay'
import { useArenaSearch } from '../arena/useArenaChannel'
import { ArenaUserChannelsIndex } from '../arena/ArenaUserChannelsIndex'
import { useArenaAuth } from '../arena/useArenaAuth'
import { ArenaSearchPanel } from '../arena/ArenaSearchResults'
import type { SearchResult } from '../arena/types'
import { LoadingPulse } from '../shapes/LoadingPulse'

// Use shared slides manager and constants
import { SLIDE_MARGIN, SLIDE_SIZE, SlidesProvider, useSlides } from './SlidesManager'

DefaultFontStyle.setDefaultValue('sans')

export default function SlideShowExample() {
  return (
    <div className="tldraw__editor curl-tldraw-theme">
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
              y: 0,
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
            y: 0,
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
    ed.updateInstanceState({ isGridMode: true })
  }

  // Persist approximately every 2s instead of every event
  useCanvasPersistence(editor, 'slides-track', 2000)

  return (
    <Tldraw
      onMount={handleMount}
      components={components}
      shapeUtils={[SlideShapeUtil, VoiceMemoShapeUtil, ThreeDBoxShapeUtil, ArenaBlockShapeUtil]}
      tools={[VoiceMemoTool, ThreeDBoxTool, LaserTool, LassoSelectTool]}
      overrides={uiOverrides}
      assetUrls={customAssetUrls}
    />
  )
}

function Slides() {
  const slides = useSlides()
  const currentSlides = useValue('slides', () => slides.getCurrentSlides(), [slides])
  // const lowestIndex = currentSlides[0]?.index ?? 0
  // const highestIndex = currentSlides[currentSlides.length - 1]?.index ?? 0

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
      {/* <button
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
      </button> */}
    </>
  )
}

//[3]
// moved to src/tools/lasso/LassoOverlays.tsx

function SlideControls() {
  return null
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
      ctx.strokeStyle = isDarkMode ? '#333' : '#F5F5F5'

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

    return <canvas className="tl-grid" ref={canvas} style={{ pointerEvents: 'none' }} />
  },
  OnTheCanvas: Slides,
  InFrontOfTheCanvas: () => (
    <>
      <SlideControls />
      <FpsOverlay />
    </>
  ),
  Toolbar: CustomToolbar,
  Overlays: () => (
    <>
      <LassoOverlays />
    </>
  ),
}

const customAssetUrls: TLUiAssetUrlOverrides = {
  icons: {
    'voice-memo': '/icons/voice-memo.svg',
    'three-d-box': '/icons/three-d-box.svg',
    'pencil': '/icons/pencil.svg',
    'laser': '/icons/laser.svg',
    'lasso': '/icons/lasso.svg',
  },
}

const uiOverrides: TLUiOverrides = {
  tools: (editor, tools) => ({
    ...tools,
    draw: {
      ...tools.draw,
      icon: 'pencil',
    },
    'lasso-select': {
      id: 'lasso-select',
      label: 'Lasso',
      icon: 'lasso',
      kbd: 'shift+l',
      onSelect() {
        editor.setCurrentTool('lasso-select')
      },
    },
    laser: {
      id: 'laser',
      label: 'Laser',
      icon: 'laser',
      kbd: 'l',
      onSelect() {
        editor.setCurrentTool('laser')
      },
    },
    'voice-memo': {
      id: 'voice-memo',
      label: 'Voice',
      icon: 'voice-memo',
      kbd: 'v',
      onSelect() {
        editor.setCurrentTool('voice-memo')
      },
    },
    'three-d-box': {
      id: 'three-d-box',
      label: 'ArenaBrowser',
      icon: 'three-d-box',
      kbd: 'b',
      onSelect() {
        editor.setCurrentTool('three-d-box')
      },
    },
    'arena-channel': {
      id: 'arena-channel',
      label: 'Channel',
      icon: 'three-d-box',
      kbd: 'c',
      onSelect() {
        editor.setCurrentTool('arena-channel')
      },
    },
  }),
}

function CustomToolbar() {
  const editor = useEditor()
  const tools = useTools()
  const isDrawSelected = useIsToolSelected(tools['draw'])
  const isVoiceSelected = useIsToolSelected(tools['voice-memo'])
  const isArenaBrowserSelected = useIsToolSelected(tools['three-d-box'])
  const isLassoSelected = useIsToolSelected(tools['lasso-select'])
  const arenaAuth = useArenaAuth()

  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)
  const [isFocused, setIsFocused] = useState(false)
  const trimmedQuery = query.trim()
  const { error, results } = useArenaSearch(trimmedQuery)
  const resultsContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep highlighted row in view
  useEffect(() => {
    const container = resultsContainerRef.current
    if (!container) return
    const el = container.querySelector(`[data-index="${highlightedIndex}"]`)
    if (el && 'scrollIntoView' in el) {
      ;(el as HTMLElement).scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex])

  useEffect(() => {
    setHighlightedIndex(results.length > 0 ? 0 : -1)
  }, [query, results.length])

  // DERIVED STATE: The popover is open if the input is focused, has a query, and has results.
  const isPopoverOpen = isFocused && trimmedQuery.length > 0 && results.length > 0

  function centerDropXY(w: number, h: number) {
    const vpb = editor.getViewportPageBounds()
    return { x: vpb.midX - w / 2, y: vpb.midY - h / 2 }
  }

  function createFromSelection(result: SearchResult | null) {
    const term = query.trim()
    if (!result && !term) return
    const size = 200
    const w = size
    const h = size
    const { x, y } = centerDropXY(w, h)
    const id = createShapeId()

    

    if (!result) {
      editor.createShapes([
        { id, type: '3d-box', x, y, props: { w, h, channel: term } as any } as any,
      ])
      editor.setSelectedShapes([id])
      setQuery('')
      return
    }

    if (result.kind === 'channel') {
      const slug = (result as any).slug
      editor.createShapes([
        { id, type: '3d-box', x, y, props: { w, h, channel: slug } as any } as any,
      ])
      editor.setSelectedShapes([id])
      setQuery('')
    } else {
      const userId = (result as any).id
      const userName = (result as any).username
      editor.createShapes([
        { id, type: '3d-box', x, y, props: { w, h, channel: '', userId, userName } as any } as any,
      ])
      editor.setSelectedShapes([id])
      setQuery('')
    }
  }

  // Drag-to-spawn state for channels from profile list
  const channelDragRef = useRef<{ origin: { x: number; y: number }; createdId: string | null; pointerId: number | null } | null>(null)
  function screenToPagePoint(clientX: number, clientY: number) {
    const anyEditor = editor as any
    if (typeof anyEditor.screenToPage === 'function') return anyEditor.screenToPage({ x: clientX, y: clientY })
    if (typeof anyEditor.viewportScreenToPage === 'function') return anyEditor.viewportScreenToPage({ x: clientX, y: clientY })
    const v = editor.getViewportPageBounds()
    return { x: v.midX, y: v.midY }
  }
  function spawnChannelBox(slug: string, pageX: number, pageY: number) {
    const size = 200
    const w = size
    const h = size
    const id = createShapeId()
    editor.createShapes([{ id, type: '3d-box', x: pageX - w / 2, y: pageY - h / 2, props: { w, h, channel: slug } as any } as any])
    editor.setSelectedShapes([id])
    return id
  }
  const onUserChanPointerDown = (_info: { slug: string }, e: React.PointerEvent) => {
    stopEventPropagation(e)
    channelDragRef.current = { origin: { x: e.clientX, y: e.clientY }, createdId: null, pointerId: e.pointerId }
    try { (e.currentTarget as any).setPointerCapture?.(e.pointerId) } catch {}
  }
  const onUserChanPointerMove = (info: { slug: string }, e: React.PointerEvent) => {
    stopEventPropagation(e)
    const state = channelDragRef.current
    if (!state || state.pointerId !== e.pointerId) return
    const dx = e.clientX - state.origin.x
    const dy = e.clientY - state.origin.y
    const threshold = 6
    const page = screenToPagePoint(e.clientX, e.clientY)
    if (!state.createdId) {
      if (Math.hypot(dx, dy) < threshold) return
      state.createdId = spawnChannelBox(info.slug, page.x, page.y)
    } else {
      const shape = editor.getShape(state.createdId as any)
      if (!shape) return
      const w = (shape as any).props?.w ?? 200
      const h = (shape as any).props?.h ?? 200
      editor.updateShapes([{ id: state.createdId as any, type: (shape as any).type as any, x: page.x - w / 2, y: page.y - h / 2 } as any])
    }
  }
  const onUserChanPointerUp = (_info: { slug: string }, e: React.PointerEvent) => {
    stopEventPropagation(e)
    const state = channelDragRef.current
    if (state && state.pointerId === e.pointerId) {
      try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId) } catch {}
    }
    channelDragRef.current = null
  }

  return (
    <DefaultToolbar>
      <TldrawUiMenuItem {...tools['draw']} isSelected={isDrawSelected} />
      <TldrawUiMenuItem {...tools['laser']} />
      <TldrawUiMenuItem {...tools['lasso-select']} isSelected={isLassoSelected} />
      <TldrawUiMenuItem {...tools['voice-memo']} isSelected={isVoiceSelected} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
        <TldrawUiMenuItem {...tools['three-d-box']} isSelected={isArenaBrowserSelected} />
        <Popover.Root open={isPopoverOpen}>
          <Popover.Anchor asChild>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
              }}
              placeholder={'Search Are.na'}
              onFocus={() => {
                setIsFocused(true)
              }}
              onBlur={() => {
                // We need to delay the closing so that clicks on the popover content register
                setTimeout(() => setIsFocused(false), 50)
              }}
              onPointerDown={(e) => stopEventPropagation(e)}
              onPointerMove={(e) => stopEventPropagation(e)}
              onPointerUp={(e) => stopEventPropagation(e)}
              onWheel={(e) => {
                if ((e as any).ctrlKey) {
                  ;(e as any).preventDefault()
                } else {
                  ;(e as any).stopPropagation()
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  if (results.length === 0) return
                  setHighlightedIndex((i) => (i < 0 ? 0 : (i + 1) % results.length))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  if (results.length === 0) return
                  setHighlightedIndex((i) => (i <= 0 ? results.length - 1 : i - 1))
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  const chosen = highlightedIndex >= 0 && highlightedIndex < results.length ? results[highlightedIndex] : null
                  createFromSelection(chosen)
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  inputRef.current?.blur()
                }
              }}
              style={{
                fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif",
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: '-0.0125em',
                color: '#111',
                border: '1px solid #e6e6e6',
                borderRadius: 0,
                padding: '8px 12px',
                background: isFocused ? '#fff' : '#f5f5f5',
                width: 260,
                touchAction: 'none',
              }}
            />
          </Popover.Anchor>
          <Popover.Portal>
            <Popover.Content
              side="top"
              align="start"
              sideOffset={0}
              avoidCollisions={false}
              onOpenAutoFocus={(e) => e.preventDefault()}
              style={{
                width: 260,
                maxHeight: 260,
                overflow: 'auto',
                background: '#fff',
                boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
                border: '1px solid #e6e6e6',
                borderRadius: 0,
                padding: '4px 0',
                touchAction: 'none',
                zIndex: 1000,
              }}
              onPointerDown={(e) => stopEventPropagation(e)}
              onPointerMove={(e) => stopEventPropagation(e)}
              onPointerUp={(e) => stopEventPropagation(e)}
              onWheel={(e) => {
                if ((e as any).ctrlKey) {
                  ;(e as any).preventDefault()
                } else {
                  ;(e as any).stopPropagation()
                }
              }}
            >
              <ArenaSearchPanel
                query={query}
                searching={false}
                error={error}
                results={results}
                highlightedIndex={highlightedIndex}
                onHoverIndex={setHighlightedIndex}
                onSelect={(r) => createFromSelection(r)}
                containerRef={resultsContainerRef}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        {/* Auth control — match Are.na: pill "Log in" when logged out; circular initial when logged in */}
        {arenaAuth.state.status === 'authorized' ? (
          <Popover.Root>
            <Popover.Trigger asChild>
              <button
                aria-label="Profile"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 9999,
                  border: '1px solid #e6e6e6',
                  background: '#f5f5f5',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  color: '#000000',
                  lineHeight: 1,
                  padding: 0,
                  boxSizing: 'border-box',
                }}
                onPointerDown={(e) => stopEventPropagation(e)}
                onPointerMove={(e) => stopEventPropagation(e)}
                onPointerUp={(e) => stopEventPropagation(e)}
                onWheel={(e) => {
                  if ((e as any).ctrlKey) {
                    ;(e as any).preventDefault()
                  } else {
                    ;(e as any).stopPropagation()
                  }
                }}
              >
                {(arenaAuth.state.me.full_name?.[0] || arenaAuth.state.me.username?.[0] || '•')}
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                side="top"
                align="center"
                sideOffset={8}
                avoidCollisions={true}
                onOpenAutoFocus={(e) => e.preventDefault()}
                style={{
                  width: 280,
                  background: '#fff',
                  boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
                  border: '1px solid #e6e6e6',
                  borderRadius: 0,
                  padding: '10px 12px',
                  zIndex: 1000,
                }}
                onPointerDown={(e) => stopEventPropagation(e)}
                onPointerMove={(e) => stopEventPropagation(e)}
                onPointerUp={(e) => stopEventPropagation(e)}
                onWheel={(e) => {
                  if ((e as any).ctrlKey) {
                    ;(e as any).preventDefault()
                  } else {
                    ;(e as any).stopPropagation()
                  }
                }}
              >
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 2,
                          background: '#f0f0f0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 14,
                          fontWeight: 600,
                          color: '#666',
                          flexShrink: 0,
                        }}
                      >
                        {(arenaAuth.state.me.full_name?.[0] || arenaAuth.state.me.username?.[0] || '•')}
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: '#000000', fontWeight: 600, letterSpacing: '-0.01em' }}>{arenaAuth.state.me.full_name}</div>
                        
                      </div>
                    </div>
                    <button
                      onClick={() => arenaAuth.logout()}
                      style={{
                        alignSelf: 'start',
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        fontSize: 12,
                        color: '#111',
                        textDecoration: 'underline',
                      }}
                    >
                      Log out
                    </button>
                  </div>
                  <div style={{ height: 1, background: '#eee' }} />
                  <div style={{ height: 240 }}>
                    <ArenaUserChannelsIndex
                      userId={arenaAuth.state.me.id}
                      userName={arenaAuth.state.me.username}
                      width={256}
                      height={240}
                      onSelectChannel={(slug) => {
                        // Click selects channel: spawn centered
                        const size = 200
                        const w = size
                        const h = size
                        const vpb = editor.getViewportPageBounds()
                        const id = createShapeId()
                        editor.createShapes([{ id, type: '3d-box', x: vpb.midX - w / 2, y: vpb.midY - h / 2, props: { w, h, channel: slug } as any } as any])
                        editor.setSelectedShapes([id])
                      }}
                      onChannelPointerDown={onUserChanPointerDown}
                      onChannelPointerMove={onUserChanPointerMove}
                      onChannelPointerUp={onUserChanPointerUp}
                    />
                  </div>
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        ) : (
          <button
            onClick={() => arenaAuth.login()}
            style={{
              height: 28,
              padding: '0 10px',
              borderRadius: 0,
              border: '1px solid #e6e6e6',
              background: '#f5f5f5',
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '-0.0125em',
              color: '#111',
            }}
            onPointerDown={(e) => stopEventPropagation(e)}
            onPointerMove={(e) => stopEventPropagation(e)}
            onPointerUp={(e) => stopEventPropagation(e)}
            onWheel={(e) => {
              if ((e as any).ctrlKey) {
                ;(e as any).preventDefault()
              } else {
                ;(e as any).stopPropagation()
              }
            }}
          >
            {arenaAuth.state.status === 'authorizing' ? <LoadingPulse size={16} color="rgba(255,255,255,0.3)" /> : 'Log in'}
          </button>
        )}
      </div>
    </DefaultToolbar>
  )
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



