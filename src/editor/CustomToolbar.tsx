import React, { useEffect, useRef, useState, useMemo, useCallback, useDeferredValue } from 'react'
import { getTactileScales } from '../arena/constants'
import { useWheelPreventDefault } from '../hooks/useWheelControl'
import { Editor, createShapeId, useEditor, useValue, DefaultToolbar, useTools, useIsToolSelected, stopEventPropagation } from 'tldraw'
import * as Popover from '@radix-ui/react-popover'
import { useArenaSearch } from '../arena/hooks/useArenaSearch'
import { useArenaAuth } from '../arena/hooks/useArenaAuth'
import { useUserChannels, fuzzySearchChannels, setSessionUser, clearSessionUser } from '../arena/userChannelsStore'
import { useChannelDragOut } from '../arena/hooks/useChannelDragOut'
import { ArenaSearchPanel } from '../arena/ArenaSearchResults'
import type { ArenaUser, SearchResult } from '../arena/types'
import { useAccount, useIsAuthenticated, usePasskeyAuth } from 'jazz-tools/react'
import { useJazzContextManager } from 'jazz-tools/react-core'
import { Account } from '../jazz/schema'
import {
  COMPONENT_STYLES,
  DESIGN_TOKENS,
  SHAPE_SHADOW
} from '../arena/constants'
import { getGridSize, snapToGrid } from '../arena/layout'
import { useScreenToPagePoint } from '../arena/hooks/useScreenToPage'

export function CustomToolbar() {
  const editor = useEditor()
  const tools = useTools()
  const isLassoSelected = useIsToolSelected(tools['portal-brush'])
  const isArenaBlockSelected = useIsToolSelected(tools['arena-block'])
  const arenaAuth = useArenaAuth()
  const me = useAccount(Account, { resolve: { profile: true } } as any)
  const passkeyAuth = usePasskeyAuth({ appName: 'Cantos' })
  const isAuthenticated = useIsAuthenticated()
  const jazzContextManager = useJazzContextManager()

  const arenaUser: ArenaUser | null = arenaAuth.state.status === 'authorized'
    ? arenaAuth.state.me
    : null
  const arenaUserId = arenaUser?.id
  const arenaUsername = arenaUser?.username

  // Set session user for shared store
  useEffect(() => {
    if (arenaUserId && isAuthenticated) {
      setSessionUser(arenaUserId, arenaUsername)
      return
    }
    clearSessionUser()
  }, [arenaUserId, arenaUsername, isAuthenticated])

  // Fetch user channels for search popover
  const { loading: channelsLoading, error: channelsError, channels } = useUserChannels(
    arenaUserId,
    arenaUsername,
    { autoFetch: true }
  )

  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)
  const [isFocused, setIsFocused] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [shouldTranslate, setShouldTranslate] = useState(false)
  const [windowHeight, setWindowHeight] = useState(() => typeof window !== 'undefined' ? window.innerHeight : 800)
  const [portalBrushPressed, setPortalBrushPressed] = useState(false)
  const [arenaPressed, setArenaPressed] = useState(false)
  const [tactilePressed, setTactilePressed] = useState(false)
  const trimmedQuery = useMemo(() => query.trim(), [query])
  const deferredTrimmedQuery = useMemo(() => deferredQuery.trim(), [deferredQuery])
  const { error, results } = useArenaSearch(deferredTrimmedQuery)
  const resultsContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const profileButtonRef = useRef<HTMLDivElement>(null)

  // Prevent default wheel behavior when Ctrl is pressed
  useWheelPreventDefault(profileButtonRef, (e) => e.ctrlKey)
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
  const isPopoverOpen = useMemo(() => isFocused && !!arenaUserId, [isFocused, arenaUserId])

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
  const screenToPagePoint = useScreenToPagePoint()

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
        {/* Left section: profile circle + account popover (keeps prior Arena UI intact) */}
        <div style={COMPONENT_STYLES.layouts.toolbarLeft}>
          <Popover.Root>
            <Popover.Trigger asChild>
              {isAuthenticated ? (
                <div
                  ref={profileButtonRef}
                  onPointerDown={(e) => stopEventPropagation(e)}
                  onPointerUp={(e) => stopEventPropagation(e)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: '#f5f5f5',
                    border: `1px solid ${DESIGN_TOKENS.colors.border}`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 12,
                    color: '#111',
                    cursor: 'pointer',
                    userSelect: 'none',
                    marginRight: 12,
                  }}
                >
                  {(arenaUsername || 'You').slice(0, 1).toUpperCase()}
                </div>
              ) : (
                <button
                  ref={profileButtonRef}
                  style={{ ...COMPONENT_STYLES.buttons.textButton, marginRight: 12 }}
                  onPointerDown={(e) => stopEventPropagation(e)}
                  onPointerUp={(e) => stopEventPropagation(e)}
                >
                  Sign in
                </button>
              )}
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                side="bottom"
                align="start"
                sideOffset={6}
                onPointerDown={(e) => stopEventPropagation(e)}
                onPointerUp={(e) => stopEventPropagation(e)}
                style={{
                  background: '#fff',
                  border: '1px solid #e5e5e5',
                  borderRadius: 10,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  padding: 12,
                  maxWidth: 320,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                {isAuthenticated ? (
                  <>
                    {arenaUser ? (
                      <div
                        style={{
                          borderRadius: 12,
                          border: '1px solid #eee',
                          boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
                          padding: 12,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                          alignItems: 'center',
                        }}
                      >
                        <div
                          style={{
                            width: 72,
                            height: 72,
                            borderRadius: 14,
                            overflow: 'hidden',
                            background: '#f3f3f3',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid #e5e5e5',
                          }}
                        >
                          {arenaUser.avatar ? (
                            <img
                              src={arenaUser.avatar}
                              alt={arenaUser.full_name || arenaUser.username}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <span style={{ fontWeight: 700, fontSize: 20 }}>
                              {(arenaUser.full_name || arenaUser.username || 'A').slice(0, 1).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>
                          {arenaUser.full_name || arenaUser.username || 'Arena user'}
                        </div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            width: '100%',
                            gap: 4,
                            textAlign: 'center',
                            fontSize: 12,
                            color: '#444',
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <strong style={{ fontSize: 14 }}>{arenaUser.channel_count ?? '—'}</strong>
                            <span>channels</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <strong style={{ fontSize: 14 }}>{arenaUser.follower_count ?? '—'}</strong>
                            <span>followers</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <strong style={{ fontSize: 14 }}>{arenaUser.following_count ?? '—'}</strong>
                            <span>following</span>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    <label style={{ fontSize: 12, color: '#333', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      Profile name
                      <input
                        value={me?.profile?.name ?? ''}
                        placeholder="Name"
                        onChange={(e) => {
                          const val = e.target.value
                          if (me?.profile) me.profile.$jazz.set('name', val)
                        }}
                        style={{ border: '1px solid #ccc', borderRadius: 6, padding: '6px 8px', fontSize: 13, background: 'transparent' }}
                      />
                    </label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ fontSize: 12, color: '#333', flex: 1, fontWeight: 600 }}>Arena</div>
                      {arenaAuth.state.status === 'authorized' ? (
                        <button
                          style={{ ...COMPONENT_STYLES.buttons.textButton, flex: 1 }}
                          onClick={() => { setLatchedUser(null); arenaAuth.logout() }}
                        >
                          Disconnect
                        </button>
                      ) : (
                        <button
                          style={{ ...COMPONENT_STYLES.buttons.textButton, flex: 1 }}
                          onClick={() => arenaAuth.login()}
                        >
                          Connect
                        </button>
                      )}
                    </div>
                    <button
                      style={COMPONENT_STYLES.buttons.textButton}
                      onClick={() => {
                        jazzContextManager.logOut()
                        setLatchedUser(null)
                        arenaAuth.logout()
                      }}
                    >
                      Log out
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        style={COMPONENT_STYLES.buttons.textButton}
                        onClick={() => passkeyAuth.signUp('')}
                      >
                        Sign up (passkey)
                      </button>
                      <button
                        style={COMPONENT_STYLES.buttons.textButton}
                        onClick={() => passkeyAuth.logIn()}
                      >
                        Log in (passkey)
                      </button>
                    </div>
                  </>
                )}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
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
                  data-tactile
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
                    ...getTactileScales('subtle'),
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

        {/* Right section: Portal brush tool
        <div style={{
          ...COMPONENT_STYLES.layouts.toolbarRight,
          marginLeft: 8,
        }}>
          <button
            aria-label="Portal Brush"
            data-tactile
            style={{
              width: 36,
              height: 36,
              borderRadius: DESIGN_TOKENS.borderRadius.large,
              border: `1px solid ${DESIGN_TOKENS.colors.border}`,
              background: portalBrushPressed
                ? 'rgba(150,150,150,0.9)'
                : isLassoSelected
                ? 'rgba(255,255,255,0.9)'
                : 'rgba(245,245,245,0.8)',
              boxShadow: SHAPE_SHADOW,
              backdropFilter: 'blur(4px)',
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
              marginRight: 0,
              cursor: 'pointer',
              ...getTactileScales('toggle', isLassoSelected),
            }}
            onPointerDown={(e) => {
              stopEventPropagation(e)
              setPortalBrushPressed(true)
              if (isLassoSelected) {
                // If already selected, deselect by switching to select tool
                editor.setCurrentTool('select')
              } else {
                // Otherwise, select the portal-brush tool
                editor.setCurrentTool('portal-brush')
              }
            }}
            onPointerUp={(e) => {
              stopEventPropagation(e)
              setPortalBrushPressed(false)
            }}
            onPointerLeave={() => setPortalBrushPressed(false)}
            onWheel={(e) => {
              if ((e as any).ctrlKey) {
                ;(e as any).preventDefault()
              } else {
                ;(e as any).stopPropagation()
              }
            }}
          >
            <img
              src="/icons/lasso.svg"
              alt="Portal Brush"
              style={{
                width: 16,
                height: 16,
                filter: isLassoSelected
                  ? 'brightness(0) saturate(100%)'
                  : 'brightness(0) saturate(100%) opacity(0.45)',
                transition: 'filter 0.15s ease',
              }}
            />
          </button>
          <button
            aria-label="Text Block"
            data-tactile
            style={{
              width: 36,
              height: 36,
              borderRadius: DESIGN_TOKENS.borderRadius.large,
              border: `1px solid ${DESIGN_TOKENS.colors.border}`,
              background: arenaPressed
                ? 'rgba(150,150,150,0.9)'
                : isArenaBlockSelected
                ? 'rgba(255,255,255,0.9)'
                : 'rgba(245,245,245,0.8)',
              boxShadow: SHAPE_SHADOW,
              backdropFilter: 'blur(4px)',
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
              marginRight: 8,
              cursor: 'pointer',
              ...getTactileScales('toggle', isArenaBlockSelected),
            }}
            onPointerDown={(e) => {
              stopEventPropagation(e)
              setArenaPressed(true)
              if (isArenaBlockSelected) {
                // If already selected, deselect by switching to select tool
                editor.setCurrentTool('select')
              } else {
                // Otherwise, select the arena-block tool
                editor.setCurrentTool('arena-block')
              }
            }}
            onPointerUp={(e) => {
              stopEventPropagation(e)
              setArenaPressed(false)
            }}
            onPointerLeave={() => setArenaPressed(false)}
            onWheel={(e) => {
              if ((e as any).ctrlKey) {
                ;(e as any).preventDefault()
              } else {
                ;(e as any).stopPropagation()
              }
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
                color: isArenaBlockSelected ? '#111' : 'rgba(0,0,0,0.45)',
                transition: 'color 0.15s ease',
              }}
            >
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <button
            aria-label="Tactile Portal"
            data-tactile
            style={{
              width: 36,
              height: 36,
              borderRadius: DESIGN_TOKENS.borderRadius.large,
              border: `1px solid ${DESIGN_TOKENS.colors.border}`,
              background: tactilePressed
                ? 'rgba(150,150,150,0.9)'
                : 'rgba(245,245,245,0.8)',
              boxShadow: SHAPE_SHADOW,
              backdropFilter: 'blur(4px)',
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
              cursor: 'pointer',
              ...getTactileScales('toggle', false),
            }}
            onPointerDown={(e) => {
              stopEventPropagation(e)
              setTactilePressed(true)
              const id = createShapeId()
              const vpb = editor.getViewportPageBounds()
              const gridSize = getGridSize()
              const w = 320
              const h = 320
              const x = snapToGrid(vpb.midX - w / 2, gridSize)
              const y = snapToGrid(vpb.midY - h / 2, gridSize)

              editor.createShapes([
                {
                  id,
                  type: 'tactile-portal',
                  x,
                  y,
                  props: { w, h }
                } as any
              ])
              editor.setSelectedShapes([id])
            }}
            onPointerUp={(e) => {
              stopEventPropagation(e)
              setTactilePressed(false)
            }}
            onPointerLeave={() => setTactilePressed(false)}
            onWheel={(e) => {
              if ((e as any).ctrlKey) {
                ;(e as any).preventDefault()
              } else {
                ;(e as any).stopPropagation()
              }
            }}
          >
            <div style={{ fontWeight: 'bold', fontSize: 10 }}>TP</div>
          </button>
        </div> */}
      </div>
    </DefaultToolbar>
  )
}
