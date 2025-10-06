import { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback, useDeferredValue, memo } from 'react'
import { Editor, Tldraw, createShapeId, transact, useEditor, useValue, approximately, useIsDarkMode, DefaultToolbar, TldrawUiMenuItem, useTools, useIsToolSelected, stopEventPropagation, DefaultFontStyle, TldrawOverlays, getSvgPathFromPoints, preventDefault } from 'tldraw'
import { LassoingState } from '../tools/lasso/LassoSelectTool'
import * as Popover from '@radix-ui/react-popover'
import type { TLFrameShape, TLUiAssetUrlOverrides } from 'tldraw'
import { SlideShapeUtil } from '../shapes/SlideShape'
import { ThreeDBoxShapeUtil } from '../shapes/ThreeDBoxShape'
import { ArenaBlockShapeUtil } from '../shapes/ArenaBlockShape'
import type { TLComponents, TLUiOverrides } from 'tldraw'
import 'tldraw/tldraw.css'
import { useCanvasPersistence } from '../jazz/useCanvasPersistence'
import { ThreeDBoxTool } from '../tools/ThreeDBoxTool'
import { LassoSelectTool } from '../tools/lasso/LassoSelectTool'
import { LassoOverlays } from '../tools/lasso/LassoOverlays'
import FpsOverlay from './FpsOverlay'
import { TilingPreviewManager } from './TilingPreviewManager'
import { FocusBlurOverlay } from './FocusBlurOverlay'
import { useArenaSearch } from '../arena/hooks/useArenaChannel'
import { ArenaUserChannelsIndex } from '../arena/ArenaUserChannelsIndex'
import { useArenaAuth } from '../arena/hooks/useArenaAuth'
import { useChannelDragOut } from '../arena/hooks/useChannelDragOut'
import { ArenaSearchPanel } from '../arena/ArenaSearchResults'
import type { SearchResult } from '../arena/types'
import { LoadingPulse } from '../shapes/LoadingPulse'
import { getGridSize, snapToGrid } from '../arena/layout'
import { CARD_BORDER_RADIUS } from '../arena/constants'

// Use shared slides manager and constants
import { SLIDE_MARGIN, SLIDE_SIZE, SlidesProvider, useSlides } from './SlidesManager'

DefaultFontStyle.setDefaultValue('sans')

// Configure once at module scope to keep a stable reference across renders
const ConfiguredArenaBlockShapeUtil = (ArenaBlockShapeUtil as any).configure({ resizeMode: 'scale' })

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
    performance.mark('tldraw:mounted')
    console.timeEnd('[Perf] App->TldrawMounted')
  }

  // Persist approximately every 2s instead of every event
  useCanvasPersistence(editor, 'slides-track', 2000)

  return (
    <div onContextMenu={preventDefault} style={{ width: '100%', height: '100%' }}>
      <Tldraw
        onMount={handleMount}
        components={components}
        shapeUtils={[SlideShapeUtil, ThreeDBoxShapeUtil, ConfiguredArenaBlockShapeUtil]}
        tools={[ThreeDBoxTool, LassoSelectTool]}
        overrides={uiOverrides}
        assetUrls={customAssetUrls}
      />
    </div>
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
      {/* <SlideControls /> */}
      <FpsOverlay />
       <FocusBlurOverlay />
      {/* <div data-tldraw-front-layer style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }} /> */}
    </>
  ),
  Toolbar: memo(CustomToolbar),
  Overlays: () => (
    <>
      <LassoOverlays />
      <TilingPreviewManager />
    </>
  ),
}

const customAssetUrls: TLUiAssetUrlOverrides = {
  icons: {

    'pencil': '/icons/pencil.svg',
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
  const isLassoSelected = useIsToolSelected(tools['lasso-select'])
  const arenaAuth = useArenaAuth()

  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)
  const [isFocused, setIsFocused] = useState(false)
  const [windowHeight, setWindowHeight] = useState(() => typeof window !== 'undefined' ? window.innerHeight : 800)
  const trimmedQuery = useMemo(() => query.trim(), [query])
  const deferredTrimmedQuery = useMemo(() => deferredQuery.trim(), [deferredQuery])
  const { error, results } = useArenaSearch(deferredTrimmedQuery)
  const resultsContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Track window height for responsive panel sizing
  useEffect(() => {
    const handleResize = () => setWindowHeight(window.innerHeight)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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
  const isPopoverOpen = useMemo(() => isFocused && trimmedQuery.length > 0 && results.length > 0, [isFocused, trimmedQuery, results.length])

  // Calculate responsive panel height: min of 320px or 3/4 screen height
  const panelHeight = useMemo(() => Math.min(320, windowHeight * 0.75), [windowHeight])

  const centerDropXY = useCallback((w: number, h: number) => {
    const vpb = editor.getViewportPageBounds()
    const gridSize = getGridSize()
    return {
      x: snapToGrid(vpb.midX - w / 2, gridSize),
      y: snapToGrid(vpb.midY - h / 2, gridSize)
    }
  }, [editor])

  const createFromSelection = useCallback((result: SearchResult | null) => {
    const term = trimmedQuery
    if (!result && !term) return
    const gridSize = getGridSize()
    const size = snapToGrid(200, gridSize)
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
  }, [centerDropXY, trimmedQuery, editor])

  // Drag-to-spawn channels using reusable hook
  const screenToPagePoint = useCallback((clientX: number, clientY: number) => {
    const anyEditor = editor as any
    if (typeof anyEditor.screenToPage === 'function') return anyEditor.screenToPage({ x: clientX, y: clientY })
    if (typeof anyEditor.viewportScreenToPage === 'function') return anyEditor.viewportScreenToPage({ x: clientX, y: clientY })
    const v = editor.getViewportPageBounds()
    return { x: v.midX, y: v.midY }
  }, [editor])

  const { onChannelPointerDown: onUserChanPointerDown, onChannelPointerMove: onUserChanPointerMove, onChannelPointerUp: onUserChanPointerUp } = useChannelDragOut({
    editor,
    screenToPagePoint,
  })

  // Create wrapper functions to match ArenaUserChannelsIndex interface
  const wrappedOnUserChanPointerDown = useCallback((info: { slug: string }, e: React.PointerEvent) => {
    stopEventPropagation(e)
    onUserChanPointerDown(info.slug, e)
  }, [onUserChanPointerDown])

  const wrappedOnUserChanPointerMove = useCallback((info: { slug: string }, e: React.PointerEvent) => {
    stopEventPropagation(e)
    onUserChanPointerMove(info.slug, e)
  }, [onUserChanPointerMove])

  const wrappedOnUserChanPointerUp = useCallback((info: { slug: string }, e: React.PointerEvent) => {
    stopEventPropagation(e)
    onUserChanPointerUp(info.slug, e)
  }, [onUserChanPointerUp])

  return (
    <DefaultToolbar>
      {/* Auth control — match Are.na: pill "Log in" when logged out; circular initial when logged in */}
      {arenaAuth.state.status === 'authorized' ? (
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              aria-label="Profile"
              style={PROFILE_BUTTON_STYLE}
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
              align="start"
              sideOffset={16}
              avoidCollisions={true}
              onOpenAutoFocus={(e) => e.preventDefault()}
              style={PROFILE_POPOVER_STYLE}
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
              <div style={GRID_GAP_8_STYLE}>
                <div style={BASELINE_SPACE_BETWEEN_STYLE}>
                  <div style={ALIGN_CENTER_GAP_8_STYLE}>
                    <div
                      style={PROFILE_AVATAR_STYLE}
                    >
                      {(arenaAuth.state.me.full_name?.[0] || arenaAuth.state.me.username?.[0] || '•')}
                    </div>
                    <div>
                      <div style={PROFILE_NAME_STYLE}>{arenaAuth.state.me.full_name}</div>

                    </div>
                  </div>
                  <button
                    onClick={() => arenaAuth.logout()}
                    style={PROFILE_LOGOUT_STYLE}
                  >
                    Log out
                  </button>
                </div>
                <div style={DIVIDER_STYLE} />
                <div style={{ height: panelHeight }}>
                  <ArenaUserChannelsIndex
                    userId={arenaAuth.state.me.id}
                    userName={arenaAuth.state.me.username}
                    width={256}
                    height={panelHeight}
                    padding={0}
                    onSelectChannel={(slug) => {
                      // Click selects channel: spawn centered
                      const gridSize = getGridSize()
                      const size = snapToGrid(200, gridSize)
                      const w = size
                      const h = size
                      const vpb = editor.getViewportPageBounds()
                      const id = createShapeId()
                      editor.createShapes([{ id, type: '3d-box', x: snapToGrid(vpb.midX - w / 2, gridSize), y: snapToGrid(vpb.midY - h / 2, gridSize), props: { w, h, channel: slug } as any } as any])
                      editor.setSelectedShapes([id])
                    }}
                    onChannelPointerDown={wrappedOnUserChanPointerDown}
                    onChannelPointerMove={wrappedOnUserChanPointerMove}
                    onChannelPointerUp={wrappedOnUserChanPointerUp}
                  />
                </div>
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      ) : (
          <button
            onClick={() => arenaAuth.login()}
            style={LOGIN_BUTTON_STYLE}
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
      <div style={TOOLBAR_ROW_STYLE}>
        <Popover.Root open={isPopoverOpen}>
          <Popover.Anchor asChild>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
              }}
              placeholder={'search arena'}
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
              style={useMemo(() => ({
                ...SEARCH_INPUT_BASE_STYLE,
                backgroundImage: isFocused
                  ? `radial-gradient(circle 2px at 4px 4px, rgba(255,255,255,0.15) 0%, transparent 2px),
                     radial-gradient(circle 2px at 20px 4px, rgba(255,255,255,0.15) 0%, transparent 2px),
                     radial-gradient(circle 2px at 4px 20px, rgba(255,255,255,0.15) 0%, transparent 2px),
                     radial-gradient(circle 2px at 20px 20px, rgba(255,255,255,0.15) 0%, transparent 2px),
                     radial-gradient(circle 2px at 12px 4px, rgba(255,255,255,0.15) 0%, transparent 2px),
                     radial-gradient(circle 2px at 4px 12px, rgba(255,255,255,0.15) 0%, transparent 2px),
                     radial-gradient(circle 2px at 20px 12px, rgba(255,255,255,0.15) 0%, transparent 2px),
                     radial-gradient(circle 2px at 12px 20px, rgba(255,255,255,0.15) 0%, transparent 2px)`
                  : `radial-gradient(circle 2px at 4px 4px, rgba(245,245,245,0.15) 0%, transparent 2px),
                     radial-gradient(circle 2px at 20px 4px, rgba(245,245,245,0.15) 0%, transparent 2px),
                     radial-gradient(circle 2px at 4px 20px, rgba(245,245,245,0.15) 0%, transparent 2px),
                     radial-gradient(circle 2px at 20px 20px, rgba(245,245,245,0.15) 0%, transparent 2px),
                     radial-gradient(circle 2px at 12px 4px, rgba(245,245,245,0.15) 0%, transparent 2px),
                     radial-gradient(circle 2px at 4px 12px, rgba(245,245,245,0.15) 0%, transparent 2px),
                     radial-gradient(circle 2px at 20px 12px, rgba(245,245,245,0.15) 0%, transparent 2px),
                     radial-gradient(circle 2px at 12px 20px, rgba(245,245,245,0.15) 0%, transparent 2px)`,
                backgroundColor: isFocused ? 'rgba(255,255,255,0.8)' : 'rgba(245,245,245,0.8)',
                backgroundRepeat: 'no-repeat',
                backdropFilter: 'blur(4px)',
              }), [isFocused])}
            />
          </Popover.Anchor>
          <Popover.Portal>
            <Popover.Content
              side="top"
              align="center"
              sideOffset={6}
              avoidCollisions={false}
              onOpenAutoFocus={(e) => e.preventDefault()}
              style={SEARCH_POPOVER_STYLE}
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
                onSelect={createFromSelection}
                containerRef={resultsContainerRef}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <div style={TOOL_BUTTON_WRAPPER_STYLE}>
          <TldrawUiMenuItem {...tools['draw']} isSelected={isDrawSelected} />
        </div>
        <div style={TOOL_BUTTON_WRAPPER_STYLE}>
          <TldrawUiMenuItem {...tools['lasso-select']} isSelected={isLassoSelected} />
        </div>
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

// Hoisted style objects (stable references)
const PROFILE_BUTTON_STYLE: React.CSSProperties = {
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
  marginRight: 16,
}

const PROFILE_POPOVER_STYLE: React.CSSProperties = {
  width: 280,
  background: '#fff',
  boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
  border: '1px solid #e6e6e6',
  borderRadius: CARD_BORDER_RADIUS,
  padding: '10px 12px',
  zIndex: 1000,
}

const GRID_GAP_8_STYLE: React.CSSProperties = { display: 'grid', gap: 8 }
const BASELINE_SPACE_BETWEEN_STYLE: React.CSSProperties = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }
const ALIGN_CENTER_GAP_8_STYLE: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }

const PROFILE_AVATAR_STYLE: React.CSSProperties = {
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
}

const PROFILE_NAME_STYLE: React.CSSProperties = { fontSize: 12, color: '#000000', fontWeight: 600, letterSpacing: '-0.01em' }
const PROFILE_LOGOUT_STYLE: React.CSSProperties = { alignSelf: 'start', border: 'none', background: 'transparent', padding: 0, fontSize: 12, color: '#111', textDecoration: 'underline' }
const DIVIDER_STYLE: React.CSSProperties = { height: 1, background: '#eee' }

const LOGIN_BUTTON_STYLE: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 9999,
  border: '1px solid #e6e6e6',
  background: '#f5f5f5',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '-0.02em',
  color: '#111',
  marginRight: 16,
}

const TOOLBAR_ROW_STYLE: React.CSSProperties = { position: 'relative', display: 'flex', alignItems: 'center', gap: 16 }

const TOOL_BUTTON_WRAPPER_STYLE: React.CSSProperties = {
  transform: 'scale(1.3)',
  transformOrigin: 'center',
  marginLeft: 4,
  marginRight: 4,
}

const SEARCH_INPUT_BASE_STYLE: React.CSSProperties = {
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif",
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: '-0.0125em',
  color: '#111',
  border: '1px solid #e6e6e6',
  borderRadius: CARD_BORDER_RADIUS,
  padding: '8px 12px',
  width: 320,
  touchAction: 'none',
}

const SEARCH_POPOVER_STYLE: React.CSSProperties = {
  width: 320,
  maxHeight: 260,
  overflow: 'auto',
  background: '#fff',
  boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
  border: '1px solid #e6e6e6',
  borderRadius: 0,
  padding: '12px 0',
  touchAction: 'none',
  zIndex: 1000,
}




