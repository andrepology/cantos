import React, { useEffect, useRef, useState, useMemo, useCallback, useDeferredValue, memo } from 'react'
import { useWheelPreventDefault } from '../hooks/useWheelPreventDefault'
import { Editor, Tldraw, createShapeId, transact, useEditor, useValue, DefaultToolbar, TldrawUiMenuItem, useTools, useIsToolSelected, stopEventPropagation, DefaultFontStyle, preventDefault, EASINGS } from 'tldraw'
import * as Popover from '@radix-ui/react-popover'
import type { TLFrameShape, TLUiAssetUrlOverrides } from 'tldraw'
import { SlideShapeUtil } from '../shapes/SlideShape'
import { PortalShapeUtil } from '../shapes/PortalShape'
import { ArenaBlockShapeUtil } from '../shapes/ArenaBlockShape'
import type { TLComponents, TLUiOverrides } from 'tldraw'
import 'tldraw/tldraw.css'
import { useCanvasPersistence } from '../jazz/useCanvasPersistence'
import { PortalTool } from '../tools/PortalTool'
import { PortalBrushTool } from '../tools/lasso/PortalBrushTool'
import { CustomSelectTool } from '../tools/CustomSelectTool'
import { LassoOverlays } from '../tools/lasso/LassoOverlays'
import FpsOverlay from './FpsOverlay'
import { TilingPreviewManager } from './TilingPreviewManager'
import { FocusBlurOverlay } from './FocusBlurOverlay'
import { SlideLabelsOverlay } from './SlideLabelsOverlay'
import { TldrawShapeCursor } from '../cursors/TldrawShapeCursor'
import { useArenaSearch } from '../arena/hooks/useArenaSearch'
import { ArenaUserChannelsIndex } from '../arena/ArenaUserChannelsIndex'
import { useArenaAuth } from '../arena/hooks/useArenaAuth'
import { useUserChannels, fuzzySearchChannels, setSessionUser } from '../arena/userChannelsStore'
import { useChannelDragOut } from '../arena/hooks/useChannelDragOut'
import { ArenaSearchPanel } from '../arena/ArenaSearchResults'
import type { SearchResult } from '../arena/types'
import { LoadingPulse } from '../shapes/LoadingPulse'
import { getGridSize, snapToGrid } from '../arena/layout'
import {
  COMPONENT_STYLES,
  DESIGN_TOKENS
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
      zIndex: 1000,
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

  const currentSlide = useValue('currentSlide', () => slides.getCurrentSlide(), [slides])
  const currentSlides = useValue('slides', () => slides.getCurrentSlides(), [])

  useEffect(() => {
    if (!editor || !currentSlide) return

    // Define the slide bounds for proper framing
    const slideBounds = {
      x: 0, // Fixed horizontal position for vertical stacking
      y: currentSlide.index * (SLIDE_SIZE.h + SLIDE_MARGIN), // Vertical stacking
      w: SLIDE_SIZE.w,
      h: SLIDE_SIZE.h,
    }

    // Clear constraints temporarily for smooth animation
    editor.setCameraOptions({
      constraints: undefined, // Remove constraints during transition
    })

    // Use zoomToBounds for smooth, animated transitions that properly frame the slide
    editor.zoomToBounds(slideBounds, {
      animation: {
        duration: 500,
        easing: EASINGS.easeInOutCubic
      },
      inset: 50, // Add inset around the slide for better visual framing
    })

    // After animation completes, set track constraints for manual panning
    setTimeout(() => {
      const trackBounds = {
        x: slideBounds.x - SLIDE_SIZE.w / 4, // Allow sliding back to previous slide area (and beyond)
        y: slideBounds.y, // Constrain to current slide's vertical position
        w: slideBounds.w * 1.5, // Allow sliding across multiple slides worth of space
        h: slideBounds.h, // Constrain height to single slide
      }

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
    }, 520) // Slightly longer than animation duration
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
    // ed.updateInstanceState({ isGridMode: true }) // Disabled grid snapping

    performance.mark('tldraw:mounted')
  }


  useCanvasPersistence(editor, 'slides-track')

  return (
    <div onContextMenu={preventDefault} style={{ width: '100%', height: '100%' }}>
      <Tldraw
        onMount={handleMount}
        components={useMemo(() => ({
          ...components,
          Toolbar: ToolbarContainer,
        }), [])}
        shapeUtils={[SlideShapeUtil, PortalShapeUtil, ConfiguredArenaBlockShapeUtil]}
        tools={[CustomSelectTool, PortalTool, PortalBrushTool]}
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
      <SlideLabelsOverlay />
      <TldrawShapeCursor />
      {/* <SlideControls /> */}
      <FpsOverlay />
       <FocusBlurOverlay />
      {/* <div data-tldraw-front-layer style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }} /> */}
    </>
  ),
  Toolbar: null,
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
    'portal-brush': {
      id: 'portal-brush',
      label: 'Portal',
      icon: 'lasso',
      kbd: 'p',
      onSelect() {
        editor.setCurrentTool('portal-brush')
      },
    },
    'three-d-box': {
      id: 'three-d-box',
      label: 'ArenaBrowser',
      icon: 'three-d-box',
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
  const isLassoSelected = useIsToolSelected(tools['portal-brush'])
  const arenaAuth = useArenaAuth()

  // Latch the last authorized user to avoid UI flashing during transient states
  const [latchedUser, setLatchedUser] = useState<null | { initial: string; fullName: string; userName: string; id: number }>(null)
  useEffect(() => {
    if (arenaAuth.state.status === 'authorized' && arenaAuth.state.me) {
      const me = arenaAuth.state.me
      setLatchedUser({
        initial: me.full_name?.[0] || me.username?.[0] || '•',
        fullName: me.full_name,
        userName: me.username,
        id: me.id,
      })
    }
  }, [arenaAuth.state])

  const stableUserInfo = useMemo(() => {
    if (arenaAuth.state.status === 'authorized') {
      if (latchedUser) return latchedUser
      const me = arenaAuth.state.me
      return me
        ? {
            initial: me.full_name?.[0] || me.username?.[0] || '•',
            fullName: me.full_name,
            userName: me.username,
            id: me.id,
          }
        : null
    }
    return latchedUser
  }, [arenaAuth.state, latchedUser])

  // Set session user for shared store
  useEffect(() => {
    if (stableUserInfo?.id) {
      setSessionUser(stableUserInfo.id, stableUserInfo.userName)
    }
  }, [stableUserInfo])

  // Fetch user channels for search popover
  const { loading: channelsLoading, error: channelsError, channels } = useUserChannels(
    stableUserInfo?.id,
    stableUserInfo?.userName,
    { autoFetch: true }
  )

  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)
  const [isFocused, setIsFocused] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [shouldTranslate, setShouldTranslate] = useState(false)
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

  // Reset translation state when input becomes empty and unfocused
  useEffect(() => {
    if (!isFocused && query.trim() === '') {
      setShouldTranslate(false)
    }
  }, [isFocused, query])

  // DERIVED STATE: The popover is open if the input is focused (and user is logged in)
  const isPopoverOpen = useMemo(() => isFocused && !!stableUserInfo, [isFocused, stableUserInfo])

  // Filter user channels based on query with fuzzy search
  const filteredChannels = useMemo(() => {
    if (!channels) return []
    if (!trimmedQuery) return channels
    return fuzzySearchChannels(channels, trimmedQuery)
  }, [channels, trimmedQuery])

  // Deduplicate search results against user channels
  const dedupedSearchResults = useMemo(() => {
    if (!results.length || !channels) return results
    const userChannelSlugs = new Set(channels.map(ch => ch.slug))
    return results.filter(result =>
      result.kind === 'channel' ? !userChannelSlugs.has((result as any).slug) : true
    )
  }, [results, channels])

  // Convert filtered channels to SearchResult format for unified display
  const channelsAsSearchResults = useMemo(() => {
    return (filteredChannels || []).map(channel => ({
      kind: 'channel' as const,
      id: channel.id,
      title: channel.title,
      slug: channel.slug,
      author: channel.author,
      description: undefined, // UserChannelListItem doesn't have description
      length: channel.length,
      updatedAt: channel.updatedAt,
      status: channel.status,
      open: channel.open
    }))
  }, [filteredChannels])

  // Combine filtered channels + deduped search results
  const combinedResults = useMemo(() => {
    return [...channelsAsSearchResults, ...dedupedSearchResults]
  }, [channelsAsSearchResults, dedupedSearchResults])

  useEffect(() => {
    setHighlightedIndex(combinedResults.length > 0 ? 0 : -1)
  }, [query, combinedResults.length])

  // Login button style: circular when loading, rectangular when showing text
  const loginButtonStyle = useMemo(() => {
    const isAuthorizing = arenaAuth.state.status === 'authorizing'
    return isAuthorizing ? COMPONENT_STYLES.buttons.iconButton : COMPONENT_STYLES.buttons.textButton
  }, [arenaAuth.state.status])

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
        { id, type: 'portal', x, y, props: { w, h, channel: term } as any } as any,
      ])
      editor.setSelectedShapes([id])
      setQuery('')
      return
    }

    if (result.kind === 'channel') {
      const slug = (result as any).slug
      editor.createShapes([
        { id, type: 'portal', x, y, props: { w, h, channel: slug } as any } as any,
      ])
      editor.setSelectedShapes([id])
      setQuery('')
    } else {
      const userId = (result as any).id
      const userName = (result as any).username
      editor.createShapes([
        { id, type: 'portal', x, y, props: { w, h, channel: '', userId, userName } as any } as any,
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
      <div style={COMPONENT_STYLES.layouts.toolbarRow}>
        {/* Left section: Profile circle */}
        <div style={COMPONENT_STYLES.layouts.toolbarLeft}>
          {stableUserInfo ? (
            <Popover.Root modal={true}>
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
                  {stableUserInfo.initial}
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  side="top"
                  align="center"
                  sideOffset={12}
                  avoidCollisions={true}
                  onOpenAutoFocus={(e) => e.preventDefault()}
                  style={{
                    ...COMPONENT_STYLES.overlays.profilePopover,
                    padding: '12px',
                    minWidth: '200px'
                  }}
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
                  <div style={COMPONENT_STYLES.layouts.flexBaselineSpaceBetween}>
                    <div style={COMPONENT_STYLES.layouts.flexCenter}>
                      <div
                        style={COMPONENT_STYLES.avatars.profile}
                      >
                        {stableUserInfo?.initial}
                      </div>
                      <div>
                        <div style={COMPONENT_STYLES.typography.profileName}>{stableUserInfo?.fullName}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => { setLatchedUser(null); arenaAuth.logout() }}
                      style={COMPONENT_STYLES.typography.profileLogout}
                    >
                      Log out
                    </button>
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          ) : (
            <button
              ref={buttonRef}
              onClick={() => arenaAuth.login()}
              style={loginButtonStyle}
              onPointerDown={(e) => stopEventPropagation(e)}
              onPointerUp={(e) => stopEventPropagation(e)}
            >
              {arenaAuth.state.status === 'authorizing' ? <LoadingPulse size={16} color="rgba(255,255,255,0.3)" /> : 'Log in'}
            </button>
          )}
        </div>

        {/* Center section: Search bar */}
        <div style={COMPONENT_STYLES.layouts.toolbarCenter}>
          <Popover.Root open={isPopoverOpen}>
            <Popover.Anchor asChild>
              <div
                style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
                onMouseEnter={() => {
                  setIsHovered(true)
                  if (!isFocused && query.trim() === '') {
                    setShouldTranslate(true)
                  }
                }}
                onMouseLeave={() => {
                  setIsHovered(false)
                  if (!isFocused && query.trim() === '') {
                    setShouldTranslate(false)
                  }
                }}
              >
                {/* Magnifying glass icon */}
                <div
                  className="search-icon"
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)' + (shouldTranslate ? ' translateX(-46px)' : ''),
                    pointerEvents: 'none',
                    zIndex: 1,
                    transition: isFocused || query.trim() !== '' ? 'opacity 0.15s ease-out' : 'transform 0.2s ease-out, opacity 0.15s ease-out',
                    opacity: isFocused || query.trim() !== '' ? 0 : 1,
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      color: isFocused ? '#111' : 'rgba(0,0,0,0.45)',
                      transition: 'color 0.15s ease',
                    }}
                  >
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                  </svg>
                </div>

                {/* Search arena text */}
                <div
                  className="search-text"
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%) translateX(14px)',
                    pointerEvents: 'none',
                    zIndex: 1,
                    opacity: (isHovered && query.trim() === '' && !isFocused) ? 1 : 0,
                    transition: 'opacity 0.2s ease-out',
                    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif",
                    fontSize: 14,
                    fontWeight: 600,
                    letterSpacing: '-0.0125em',
                    color: isFocused ? '#111' : 'rgba(0,0,0,0.45)',
                  }}
                >
                  search arena
                </div>

                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                  }}
                  placeholder=""
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
                      if (combinedResults.length === 0) return
                      setHighlightedIndex((i) => (i < 0 ? 0 : (i + 1) % combinedResults.length))
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      if (combinedResults.length === 0) return
                      setHighlightedIndex((i) => (i <= 0 ? combinedResults.length - 1 : i - 1))
                    } else if (e.key === 'Enter') {
                      e.preventDefault()
                      const chosen = highlightedIndex >= 0 && highlightedIndex < combinedResults.length ? combinedResults[highlightedIndex] : null
                      createFromSelection(chosen)
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      inputRef.current?.blur()
                    }
                  }}
                  style={useMemo(() => ({
                    ...COMPONENT_STYLES.inputs.search,
                    textAlign: 'left', // Always left-align when typing
                    backgroundImage: isFocused
                      ? `radial-gradient(circle 2px at 4px 4px, rgba(255,255,255,0.15) 0%, transparent 2px)`
                      : `radial-gradient(circle 2px at 4px 4px, rgba(245,245,245,0.15) 0%, transparent 2px)`,
                    backgroundColor: isFocused ? DESIGN_TOKENS.colors.surfaceBackground : 'rgba(245,245,245,0.8)',
                    backgroundRepeat: 'no-repeat',
                    backdropFilter: 'blur(4px)',
                  }), [isFocused, query, isHovered, shouldTranslate])}
                />
              </div>
            </Popover.Anchor>
            <Popover.Portal>
              <Popover.Content
                side="top"
                align="center"
                sideOffset={6}
                avoidCollisions={false}
                onOpenAutoFocus={(e) => e.preventDefault()}
                style={{
                  ...COMPONENT_STYLES.overlays.searchPopover,
                  height: Math.min(400, windowHeight * 0.8),
                  padding: 0,
                  borderRadius: 8
                }}
                onPointerDown={(e) => stopEventPropagation(e)}
                // Allow pointermove to propagate for MotionCursor position tracking
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
                  results={combinedResults}
                  highlightedIndex={highlightedIndex}
                  onHoverIndex={setHighlightedIndex}
                  onSelect={createFromSelection}
                  containerRef={resultsContainerRef}
                  onChannelPointerDown={wrappedOnUserChanPointerDown}
                  onChannelPointerMove={wrappedOnUserChanPointerMove}
                  onChannelPointerUp={wrappedOnUserChanPointerUp}
                />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>

        {/* Right section: Lasso tool */}
        <div style={COMPONENT_STYLES.layouts.toolbarRight}>
          <TldrawUiMenuItem
            {...tools['portal-brush']}
            isSelected={isLassoSelected}
            onSelect={(source) => {
              if (isLassoSelected) {
                // If already selected, deselect by switching to select tool
                editor.setCurrentTool('select')
              } else {
                // Otherwise, select the lasso tool
                tools['lasso-select'].onSelect(source)
              }
            }}
          />
        </div>
      </div>
    </DefaultToolbar>
  )
}

function markEventAsHandled(e: { stopPropagation: () => void; preventDefault: () => void }) {
  e.stopPropagation()
  e.preventDefault()
}


