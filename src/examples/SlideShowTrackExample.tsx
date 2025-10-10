import { useEffect, useRef, useState, useMemo, useCallback, useDeferredValue, memo } from 'react'
import { useWheelPreventDefault } from '../hooks/useWheelPreventDefault'
import { Editor, Tldraw, createShapeId, transact, useEditor, useValue, DefaultToolbar, TldrawUiMenuItem, useTools, useIsToolSelected, stopEventPropagation, DefaultFontStyle, preventDefault } from 'tldraw'
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
import { SlideLabelsOverlay } from './SlideLabelsOverlay'
import { TldrawShapeCursor } from '../cursors/TldrawShapeCursor'
import { useArenaSearch } from '../arena/hooks/useArenaSearch'
import { ArenaUserChannelsIndex } from '../arena/ArenaUserChannelsIndex'
import { useArenaAuth } from '../arena/hooks/useArenaAuth'
import { useChannelDragOut } from '../arena/hooks/useChannelDragOut'
import { ArenaSearchPanel } from '../arena/ArenaSearchResults'
import type { SearchResult } from '../arena/types'
import { LoadingPulse } from '../shapes/LoadingPulse'
import { getGridSize, snapToGrid } from '../arena/layout'
import {
  COMPONENT_STYLES
} from '../arena/constants'

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
  const currentSlides = useValue('slides', () => slides.getCurrentSlides(), [])

  useEffect(() => {
    if (!editor || !currentSlide) return
    const slideBounds = {
      x: 0, // Fixed horizontal position for vertical stacking
      y: currentSlide.index * (SLIDE_SIZE.h + SLIDE_MARGIN), // Vertical stacking
      w: SLIDE_SIZE.w,
      h: SLIDE_SIZE.h,
    }

    // Get viewport dimensions
    const viewportBounds = editor.getViewportScreenBounds()

    // Calculate zoom so slide height matches viewport height
    const zoom = viewportBounds.h / slideBounds.h

    // Create expanded bounds that allow horizontal sliding but constrain vertically
    // For vertical stacking, allow horizontal movement but constrain to current slide's vertical area
    const trackBounds = {
      x: slideBounds.x - SLIDE_SIZE.w / 4, // Allow sliding back to previous slide area (and beyond)
      y: slideBounds.y, // Constrain to current slide's vertical position
      w: slideBounds.w * 1.5, // Allow sliding across multiple slides worth of space
      h: slideBounds.h, // Constrain height to single slide
    }

    // Center the slide horizontally in the viewport
    const cameraX = slideBounds.x + slideBounds.w / 2 - viewportBounds.w / (2 * zoom)
    const cameraY = slideBounds.y

    // Set camera directly to achieve height-matching zoom
    editor.setCamera({ x: cameraX, y: cameraY, z: zoom }, { animation: { duration: 500 } })

    // Set constraints to maintain track-like sliding behavior
    editor.setCameraOptions({
      constraints: {
        bounds: trackBounds,
        behavior: 'contain', // Constrain camera to stay within track bounds
        initialZoom: 'default',
        baseZoom: 'default',
        origin: { x: 0.5, y: 0.5 },
        padding: { x: 50, y: 50 },
      },
    })
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
  const lowestIndex = currentSlides[0]?.index ?? 0
  const highestIndex = currentSlides[currentSlides.length - 1]?.index ?? 0

  return (
    <>
      {/* Keep UI shell intact: between-segment and edge + buttons */}
      {currentSlides.slice(0, -1).map((slide) => (
        <button
          key={slide.id + 'between'}
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
      </button>
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
      <SlideLabelsOverlay />
      <TldrawShapeCursor />
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
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Prevent default wheel behavior when Ctrl is pressed
  useWheelPreventDefault(buttonRef, (e) => e.ctrlKey)
  useWheelPreventDefault(inputRef, (e) => e.ctrlKey)

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
              style={COMPONENT_STYLES.buttons.iconButton}
              onPointerDown={(e) => stopEventPropagation(e)}
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
              style={COMPONENT_STYLES.overlays.profilePopover}
              onPointerDown={(e) => stopEventPropagation(e)}
              onPointerUp={(e) => stopEventPropagation(e)}
              onWheel={(e) => {
                if ((e as any).ctrlKey) {
                  ;(e as any).preventDefault()
                } else {
                  ;(e as any).stopPropagation()
                }
              }}
            >
              <div style={COMPONENT_STYLES.layouts.gridGap8}>
                <div style={COMPONENT_STYLES.layouts.flexBaselineSpaceBetween}>
                  <div style={COMPONENT_STYLES.layouts.flexCenter}>
                    <div
                      style={COMPONENT_STYLES.avatars.profile}
                    >
                      {(arenaAuth.state.me.full_name?.[0] || arenaAuth.state.me.username?.[0] || '•')}
                    </div>
                    <div>
                      <div style={COMPONENT_STYLES.typography.profileName}>{arenaAuth.state.me.full_name}</div>

                    </div>
                  </div>
                  <button
                    onClick={() => arenaAuth.logout()}
                    style={COMPONENT_STYLES.typography.profileLogout}
                  >
                    Log out
                  </button>
                </div>
                <div style={COMPONENT_STYLES.dividers.horizontal} />
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
          ref={buttonRef}
          onClick={() => arenaAuth.login()}
          style={COMPONENT_STYLES.buttons.iconButtonWithShadow}
          onPointerDown={(e) => stopEventPropagation(e)}
          onPointerUp={(e) => stopEventPropagation(e)}
        >
          {arenaAuth.state.status === 'authorizing' ? <LoadingPulse size={16} color="rgba(255,255,255,0.3)" /> : 'Log in'}
        </button>
      )}
      <div style={COMPONENT_STYLES.layouts.toolbarRow}>
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
              onPointerUp={(e) => stopEventPropagation(e)}
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
                ...COMPONENT_STYLES.inputs.search,
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
              style={COMPONENT_STYLES.overlays.searchPopover}
              onPointerDown={(e) => stopEventPropagation(e)}
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
        <div style={COMPONENT_STYLES.layouts.toolButtonWrapper}>
          <TldrawUiMenuItem {...tools['draw']} isSelected={isDrawSelected} />
        </div>
        <div style={COMPONENT_STYLES.layouts.toolButtonWrapper}>
          <TldrawUiMenuItem {...tools['lasso-select']} isSelected={isLassoSelected} />
        </div>
      </div>
    </DefaultToolbar>
  )
}

function markEventAsHandled(e: { stopPropagation: () => void; preventDefault: () => void }) {
  e.stopPropagation()
  e.preventDefault()
}

