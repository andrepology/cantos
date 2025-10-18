import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import { stopEventPropagation, createShapeId, transact } from 'tldraw'
import { useGlobalPanelState } from '../jazz/usePanelState'
import { useChannelDragOut } from './hooks/useChannelDragOut'
import { getGridSize, snapToGrid } from './layout'
import type { Editor } from 'tldraw'


export type ConnectionItem = {
  id: number
  title: string
  slug?: string
  author?: string
  blockCount?: number
}

export type AuthorInfo = {
  id: number
  username?: string
  full_name?: string
  avatar?: string
}

export type ConnectionsPanelProps = {
  z: number
  x: number
  y: number
  widthPx: number
  maxHeightPx: number
  title?: string
  author?: AuthorInfo
  createdAt?: string
  updatedAt?: string
  blockCount?: number
  loading: boolean
  error: string | null
  connections: ConnectionItem[]
  hasMore?: boolean
  onSelectChannel?: (slug: string) => void
  onSelectAuthor?: (userId: number, userName: string, userAvatar?: string) => void
  editor?: Editor
  defaultDimensions?: { w: number; h: number }
  // Optional local panel state overrides
  isOpen?: boolean
  setOpen?: (open: boolean) => void
  // Whether to show the Blocks field
  showBlocksField?: boolean
  // Channel connection state
  selectedChannelIds?: Set<number>
  onChannelToggle?: (channelId: number) => void
  // Connect popover state (controlled from parent)
  showConnectPopover?: boolean
  onConnectToggle?: () => void
}

export function ConnectionsPanel(props: ConnectionsPanelProps) {
  const globalState = useGlobalPanelState()
  const { isOpen: globalIsOpen, togglePanel, setOpen: globalSetOpen } = globalState

  const {
    z,
    x,
    y,
    widthPx,
    maxHeightPx,
    title,
    author,
    createdAt,
    updatedAt,
    blockCount,
    loading,
    error,
    connections,
    hasMore,
    onSelectChannel,
    onSelectAuthor,
    editor,
    defaultDimensions,
    isOpen: propIsOpen,
    setOpen: propSetOpen,
    showBlocksField = true,
    selectedChannelIds = new Set(),
    onChannelToggle,
    showConnectPopover = false,
    onConnectToggle,
  } = props

  // Use props if provided, otherwise fall back to global state
  const isOpen = propIsOpen ?? globalIsOpen
  const setOpen = propSetOpen ?? globalSetOpen

  const ref = useRef<HTMLDivElement>(null)
  const px = useCallback((n: number) => n / z, [z])
  const gridSize = useMemo(() => getGridSize(), [])
  const [isHovered, setIsHovered] = useState(false)

  // Memoize expensive computations
  const formattedBlockCount = useMemo(() =>
    blockCount !== undefined ? `${blockCount} block${blockCount === 1 ? '' : 's'}` : null,
    [blockCount]
  )

  const formattedCreatedAt = useMemo(() =>
    createdAt ? new Date(createdAt).toLocaleDateString() : null,
    [createdAt]
  )

  const formattedUpdatedAt = useMemo(() =>
    updatedAt ? new Date(updatedAt).toLocaleDateString() : null,
    [updatedAt]
  )

  // Drag-to-spawn channels using reusable hook
  const screenToPagePoint = useCallback((clientX: number, clientY: number) => {
    if (!editor) return { x: 0, y: 0 }
    const anyEditor = editor as any
    return anyEditor.screenToPage?.({ x: clientX, y: clientY }) ||
           anyEditor.viewportScreenToPage?.({ x: clientX, y: clientY }) ||
           { x: editor.getViewportPageBounds().midX, y: editor.getViewportPageBounds().midY }
  }, [editor])

  const { onChannelPointerDown, onChannelPointerMove, onChannelPointerUp } = useChannelDragOut({
    editor,
    screenToPagePoint,
    defaultDimensions,
    thresholdPx: 6, // Use default threshold to distinguish clicks from drags
    onDragStart: () => {
      dragStateRef.current.lastWasDrag = true
    }
  })

  // Combined drag state for both channel and user drags
  const dragStateRef = useRef({
    channel: { active: false, pointerId: null as number | null, slug: null as string | null },
    user: { active: false, pointerId: null as number | null, startScreen: null as { x: number; y: number } | null, spawnedId: null as string | null, currentUser: null as AuthorInfo | null, initialDimensions: null as { w: number; h: number } | null },
    lastWasDrag: false
  })

  const onUserPointerDown = useCallback((user: AuthorInfo, e: React.PointerEvent) => {
    const state = dragStateRef.current.user
    state.active = true
    state.pointerId = e.pointerId
    state.startScreen = { x: e.clientX, y: e.clientY }
    state.spawnedId = null
    state.currentUser = user
    state.initialDimensions = null
    try { (e.currentTarget as any).setPointerCapture?.(e.pointerId) } catch {}
    // Don't spawn immediately - wait for threshold in onUserPointerMove
  }, [])

  const onUserPointerMove = useCallback((user: AuthorInfo, e: React.PointerEvent) => {
    const s = dragStateRef.current.user
    if (!s.active || s.pointerId !== e.pointerId || s.currentUser?.id !== user.id) return
    if (!s.startScreen) return

    const dx = e.clientX - s.startScreen.x
    const dy = e.clientY - s.startScreen.y
    const dist = Math.hypot(dx, dy)
    const thresholdPx = 6 // Same threshold as channel drag

    if (!s.spawnedId) {
      if (dist < thresholdPx) return
      // Spawn the shape after threshold
      const page = screenToPagePoint(e.clientX, e.clientY)
      const w = snapToGrid(defaultDimensions?.w ?? 200, gridSize)
      const h = snapToGrid(defaultDimensions?.h ?? 200, gridSize)
      s.initialDimensions = { w, h }
      const id = createShapeId()
      transact(() => {
        editor?.createShapes([{
          id,
          type: 'portal',
          x: snapToGrid(page.x - w / 2, gridSize),
          y: snapToGrid(page.y - h / 2, gridSize),
          props: {
            w,
            h,
            userId: user.id,
            userName: user.username || user.full_name,
            userAvatar: user.avatar,
            spawnDragging: true,
            spawnIntro: true
          }
        } as any])
        editor?.setSelectedShapes([id])
      })
      // Clear intro on next frame
      try { requestAnimationFrame(() => { try { editor?.updateShape({ id: id as any, type: 'portal', props: { spawnIntro: false } as any }) } catch {} }) } catch {}
      s.spawnedId = id
      dragStateRef.current.lastWasDrag = true
      return
    }

    // Update position of spawned shape
    if (!s.initialDimensions) return
    const page = screenToPagePoint(e.clientX, e.clientY)
    const { w, h } = s.initialDimensions
    editor?.updateShapes([{
      id: s.spawnedId as any,
      type: 'portal',
      x: page.x - w / 2,
      y: page.y - h / 2
    } as any])
  }, [screenToPagePoint, defaultDimensions, gridSize, editor])

  const onUserPointerUp = useCallback((user: AuthorInfo, e: React.PointerEvent) => {
    const s = dragStateRef.current.user
    if (s.active && s.pointerId === e.pointerId && s.currentUser?.id === user.id) {
      try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId) } catch {}
    }
    // Clear spawn-dragging flag if a shape was spawned
    if (s.spawnedId) {
      try {
        const anyEditor = editor as any
        const spawned = anyEditor?.getShape?.(s.spawnedId)
        const spawnedType = spawned?.type ?? 'portal'
        editor?.updateShape({ id: s.spawnedId as any, type: spawnedType, props: { spawnDragging: false } as any })
        // Force TLDraw to re-render crisply by triggering a no-op geometry update
        requestAnimationFrame(() => {
          try {
            const shape = anyEditor?.getShape?.(s.spawnedId)
            if (shape) {
              editor?.updateShape({ id: s.spawnedId as any, type: spawnedType, x: shape.x, y: shape.y })
            }
          } catch {}
        })
      } catch {}
    }
    s.active = false
    s.pointerId = null
    s.startScreen = null
    s.spawnedId = null
    s.currentUser = null
    s.initialDimensions = null
  }, [])

  // Helper for metadata rows with fade-in animation
  const renderMetadataRow = useCallback((label: string, value: string | null, isInteractive = false, isLoading = false) => {
    const hasValue = value !== null && value !== undefined && value !== ''
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: px(6), borderBottom: `${px(1)}px solid rgba(0,0,0,.08)` }}>
        <span style={{ fontSize: `${px(10)}px`, opacity: 0.6 }}>{label}</span>
        <span
          style={{
            fontSize: `${px(11)}px`,
            ...(isInteractive && hasValue ? { cursor: 'pointer' } : {}),
            opacity: hasValue ? 1 : 0.4,
            transition: hasValue ? 'opacity 0.3s ease-in-out' : 'none',
            position: 'relative'
          }}
          data-author-row={label === 'Author' && !!author ? true : undefined}
          data-user-id={label === 'Author' && !!author ? String(author.id) : undefined}
          data-user-username={label === 'Author' && !!author ? String(author.username || '') : undefined}
          data-user-fullname={label === 'Author' && !!author ? String(author.full_name || '') : undefined}
          data-user-avatar={label === 'Author' && !!author ? String(author.avatar || '') : undefined}
          onPointerDown={isInteractive && hasValue ? (e) => {
            stopEventPropagation(e)
            if (author) {
              // Always start drag session for potential dragging
              onUserPointerDown(author, e)
            }
          } : undefined}
          onClick={isInteractive && hasValue && onSelectAuthor ? (e) => {
            stopEventPropagation(e as any)
            if (dragStateRef.current.lastWasDrag) return
            if (author) {
              // Regular click: replace current shape
              onSelectAuthor(author.id, author.username || author.full_name || '', author.avatar)
            }
          } : undefined}
        >
          {hasValue ? value : '—'}
        </span>
      </div>
    )
  }, [px, author, onUserPointerDown])

  // Window-level routing for pointermove/up while dragging channels or author
  useEffect(() => {
    const state = dragStateRef.current
    const handlePointerMove = (e: PointerEvent) => {
      // Only process moves during active drag (buttons down)
      if (e.buttons === 0) return

      // Channel drag follow
      if (state.channel.active && state.channel.pointerId === e.pointerId && state.channel.slug) {
        const fakeEvt: any = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, currentTarget: { releasePointerCapture: () => {} } }
        try { onChannelPointerMove(state.channel.slug, fakeEvt) } catch {}
      }
      // User drag follow
      if (state.user.active && state.user.pointerId === e.pointerId && state.user.currentUser) {
        const fakeEvt: any = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, currentTarget: { releasePointerCapture: () => {} } }
        try { onUserPointerMove(state.user.currentUser, fakeEvt) } catch {}
      }
    }
    const handlePointerUp = (e: PointerEvent) => {
      // Channel drag end
      if (state.channel.active && state.channel.pointerId === e.pointerId && state.channel.slug) {
        const fakeEvt: any = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, currentTarget: { releasePointerCapture: () => {} } }
        try { onChannelPointerUp(state.channel.slug, fakeEvt) } catch {}
        state.channel.active = false
        state.channel.pointerId = null
        state.channel.slug = null
        setTimeout(() => { state.lastWasDrag = false }, 100)
      }
      // User drag end
      if (state.user.active && state.user.pointerId === e.pointerId && state.user.currentUser) {
        const fakeEvt: any = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, currentTarget: { releasePointerCapture: () => {} } }
        try { onUserPointerUp(state.user.currentUser, fakeEvt) } catch {}
        state.user.active = false
        state.user.pointerId = null
        state.user.startScreen = null
        state.user.spawnedId = null
        state.user.currentUser = null
        state.user.initialDimensions = null
        setTimeout(() => { state.lastWasDrag = false }, 100)
      }
    }
    window.addEventListener('pointermove', handlePointerMove, { capture: true, passive: true })
    window.addEventListener('pointerup', handlePointerUp, { capture: true, passive: true })
    window.addEventListener('pointercancel', handlePointerUp, { capture: true, passive: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove as any)
      window.removeEventListener('pointerup', handlePointerUp as any)
      window.removeEventListener('pointercancel', handlePointerUp as any)
    }
  }, [onChannelPointerMove, onChannelPointerUp, onUserPointerMove, onUserPointerUp])

  // Global wheel capture to prevent browser zoom on pinch within the panel
  // Only active when panel is open to minimize performance impact
  useEffect(() => {
    if (!isOpen) return
    
    const el = ref.current
    if (!el) return
    
    const handler = (e: WheelEvent) => {
      // Early exit: only handle Ctrl+wheel (pinch-zoom)
      if (!e.ctrlKey) return
      
      // Early exit: check if target is within panel without querying DOM
      const target = e.target as Node | null
      if (!target || !el.contains(target)) return
      
      // Prevent browser (page) zoom; allow event to bubble to TLDraw for canvas zoom
      e.preventDefault()
    }
    
    window.addEventListener('wheel', handler, { capture: true, passive: false })
    return () => window.removeEventListener('wheel', handler, { capture: true } as any)
  }, [isOpen])

  // If the global panel state isn’t available, skip rendering the affordance entirely.
  if (!setOpen) {
    return null
  }

  if (!isOpen) {
    return (
      <>
        {/* Collapsed panel - connections/info button */}
        <div
          data-interactive="collapsed-panel"
          style={{
            position: 'absolute',
            top: y,
            left: x,
            width: 28,
            height: 28,
            borderRadius: 9999,
            border: '0.5px solid rgba(0,0,0,.05)',
            mixBlendMode: 'multiply',
            background: isHovered ? '#f5f5f5' : '#ffffff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 1000,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: '#000000',
            lineHeight: 1,
            padding: 0,
            boxSizing: 'border-box',
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onPointerDownCapture={stopEventPropagation}
          onMouseDownCapture={stopEventPropagation}
          onClick={(e) => {
            stopEventPropagation(e as any)
            setOpen(!isOpen)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            stopEventPropagation(e as any)
            setOpen(!isOpen)
          }}
          onPointerDown={stopEventPropagation}
          onPointerUp={stopEventPropagation}
          onPointerMove={(e) => {
            // Only stop propagation during active interactions
            if (e.buttons > 0) {
              stopEventPropagation(e)
            }
          }}
        >
          {connections && connections.length > 0 ? (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                color: '#000000',
                lineHeight: 1,
                userSelect: 'none',
              }}
            >
              {connections.length >= 1000
                ? `${(connections.length / 1000).toFixed(1)}k`.replace('.0k', 'k')
                : connections.length
              }
            </span>
          ) : (
            <svg
              data-interactive="open-button"
              width={28}
              height={28}
              viewBox="0 0 25 25"
              fill="none"
              style={{
                userSelect: 'none',
              }}
            >
              <circle
                cx="12.5"
                cy="12.5"
                r="12.25"
                fill="transparent"
                stroke="rgba(0,0,0,.05)"
                strokeWidth="0.5"
              />
              <line x1="12.5" y1="16.5" x2="12.5" y2="12.5" stroke="rgba(0,0,0,.3)" strokeWidth="2" strokeLinecap="round"/>
              <line x1="12.5" y1="8.5" x2="12.51" y2="8.5" stroke="rgba(0,0,0,.3)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          )}
        </div>

        {/* Connect to channels button - positioned below */}
        <div
          data-interactive="connect-button"
          style={{
            position: 'absolute',
            top: y + 36, // 28px button + 8px gap
            left: x,
            width: 28,
            height: 28,
            borderRadius: 9999,
            border: '0.5px solid rgba(0,0,0,.05)',
            mixBlendMode: 'multiply',
            background: showConnectPopover ? '#e5e5e5' : '#ffffff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 1000,
            lineHeight: 1,
            padding: 0,
            boxSizing: 'border-box',
            transition: 'background-color 0.15s ease',
          }}
          onPointerDownCapture={stopEventPropagation}
          onMouseDownCapture={stopEventPropagation}
          onClick={(e) => {
            stopEventPropagation(e as any)
            onConnectToggle?.()
          }}
          onPointerDown={stopEventPropagation}
          onPointerUp={stopEventPropagation}
          onPointerMove={(e) => {
            // Only stop propagation during active interactions
            if (e.buttons > 0) {
              stopEventPropagation(e)
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
              color: '#000000',
              userSelect: 'none',
            }}
          >
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </div>
      </>
    )
  }

  return (
    <div
      ref={ref}
      data-interactive="connections-panel"
      style={{
        position: 'absolute',
        top: y,
        left: x,
        width: px(widthPx),
        height: px(maxHeightPx),
        overflow: 'auto',
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
        zIndex: 1000,
        background: '#ffffff',
        borderRadius: px(8),
        boxShadow: `0 ${px(12)}px ${px(32)}px rgba(0,0,0,.12), 0 ${px(3)}px ${px(8)}px rgba(0,0,0,.06), inset 0 0 0 ${px(1)}px rgba(0,0,0,.06)`,
      }}
      onPointerDown={stopEventPropagation}
      onPointerMove={(e) => {
        // Only stop propagation during active interactions (buttons down or dragging)
        if (e.buttons > 0 || dragStateRef.current.channel.active || dragStateRef.current.user.active) {
          stopEventPropagation(e)
        }
      }}
      onPointerUp={stopEventPropagation}
      onWheel={(e) => {
        if ((e as any).ctrlKey) {
          // Let TLDraw handle pinch-zoom; do not preventDefault here (handled globally), and do not stop propagation
          return
        }
        // Keep normal scrolling local to the panel
        e.stopPropagation()
      }}
      onWheelCapture={(e) => {
        if ((e as any).ctrlKey) return
        e.stopPropagation()
      }}
    >
      <div style={{ padding: px(8), position: 'relative' }}>
        <div style={{ fontFamily: "'Alte Haas Grotesk', sans-serif", fontWeight: 700, fontSize: `${px(14)}px`, letterSpacing: '-0.0125em', paddingRight: px(28), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title || 'Untitled'}
        </div>
        <button
          data-interactive="close-button"
          onClick={(e) => {
            stopEventPropagation(e as any)
            setOpen(false)
          }}
          style={{
            position: 'absolute',
            top: px(8),
            right: px(8),
            width: px(20),
            height: px(20),
            borderRadius: 9999,
            border: 'none',
            background: '#f5f5f5',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: `${px(10)}px`,
            fontWeight: 600,
            color: '#111',
            lineHeight: 1,
            padding: 0,
            boxSizing: 'border-box',
            boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
            outline: 'none !important',
            WebkitTapHighlightColor: 'transparent',
          }}
          onPointerDown={stopEventPropagation}
          onPointerUp={stopEventPropagation}
          onPointerMove={(e) => {
            // Only stop propagation during active interactions
            if (e.buttons > 0) {
              stopEventPropagation(e)
            }
          }}
        >
          <svg width={px(10)} height={px(10)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div style={{ padding: px(8), display: 'flex', flexDirection: 'column', gap: px(6), color: 'rgba(0,0,0,.7)' }}>
        {error ? (
          <div style={{ fontSize: `${px(12)}px`, opacity: 0.6 }}>error: {error}</div>
        ) : (
          <>
            {renderMetadataRow('Author', author?.full_name || author?.username || null, true)}
            {showBlocksField && renderMetadataRow('Blocks', formattedBlockCount)}
            {renderMetadataRow('Created', formattedCreatedAt)}
            {renderMetadataRow('Modified', formattedUpdatedAt)}
          </>
        )}
      </div>
      <div style={{ padding: `${px(8)}px ${px(8)}px` }}>
        <div style={{ fontSize: `${px(11)}px`, fontWeight: 700, opacity: 0.7, marginBottom: px(6) }}>Connections{connections ? ` (${connections.length})` : ''}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: px(6) }}>
          {connections?.length ? (
            connections.map((c) => (
              <div
                key={c.id}
                style={{
                  padding: px(8),
                  border: `1px solid rgba(0,0,0,.08)`,
                  borderRadius: px(4),
                  background: 'rgba(0,0,0,.02)',
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: px(8),
                  cursor: (onSelectChannel || editor) ? 'pointer' : 'default',
                  userSelect: 'none',
                }}
                onMouseEnter={(e) => {
                  const blockCountEl = e.currentTarget.querySelector('[data-interactive="block-count"]') as HTMLElement
                  if (blockCountEl) blockCountEl.style.opacity = '1'
                }}
                onMouseLeave={(e) => {
                  const blockCountEl = e.currentTarget.querySelector('[data-interactive="block-count"]') as HTMLElement
                  if (blockCountEl) blockCountEl.style.opacity = '0'
                }}
                onPointerDown={(e) => {
                  if (editor && c.slug) {
                    stopEventPropagation(e)
                    const ch = dragStateRef.current.channel
                    ch.active = true
                    ch.pointerId = e.pointerId
                    ch.slug = c.slug
                    onChannelPointerDown(c.slug, e)
                  } else {
                    stopEventPropagation(e)
                  }
                }}
                onClick={(e) => {
                  stopEventPropagation(e as any)
                  if (dragStateRef.current.lastWasDrag) return
                  if (!onSelectChannel || !c.slug) return
                  onSelectChannel(c.slug)
                }}
              >
                <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'baseline', gap: px(8) }}>
                  <div style={{ fontSize: `${px(12)}px`, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: px(140) }}>{c.title || c.slug}</div>
                  {c.blockCount !== undefined ? (
                    <div
                      data-interactive="block-count"
                      style={{
                        color: 'rgba(0,0,0,.4)',
                        fontSize: `${px(10)}px`,
                        fontWeight: 600,
                        opacity: 0,
                        transition: 'opacity 0.15s ease',
                        flexShrink: 0,
                        lineHeight: 1
                      }}
                    >
                      {c.blockCount >= 1000
                        ? `${(c.blockCount / 1000).toFixed(1)}k`.replace('.0k', 'k')
                        : c.blockCount
                      }
                    </div>
                  ) : null}
                </div>
                <div style={{ fontSize: `${px(11.5)}px`, opacity: 0.7, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.author ?? ''}
                </div>
              </div>
            ))
          ) : loading ? null : (
            <div style={{ fontSize: `${px(12)}px`, opacity: 0.6 }}>No connections</div>
          )}
          {hasMore ? (
            <div style={{ fontSize: `${px(11)}px`, opacity: 0.6 }}>More connections exist…</div>
          ) : null}
        </div>
      </div>

    </div>
  )
}


