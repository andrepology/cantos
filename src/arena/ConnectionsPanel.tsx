import { useEffect, useRef, useCallback } from 'react'
import { stopEventPropagation, createShapeId, transact } from 'tldraw'
import { useGlobalPanelState } from '../jazz/usePanelState'
import { useChannelDragOut } from './useChannelDragOut'
import { getGridSize, snapToGrid } from './layout'
import type { Editor, TLShapeId } from 'tldraw'


export type ConnectionItem = {
  id: number
  title: string
  slug?: string
  author?: string
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
  loading: boolean
  error: string | null
  connections: ConnectionItem[]
  hasMore?: boolean
  onSelectChannel?: (slug: string) => void
  editor?: Editor
  defaultDimensions?: { w: number; h: number }
}

export function ConnectionsPanel(props: ConnectionsPanelProps) {
  const { isOpen, togglePanel, setOpen } = useGlobalPanelState()


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
    loading,
    error,
    connections,
    hasMore,
    onSelectChannel,
    editor,
    defaultDimensions,
  } = props

  const px = (n: number) => n / z
  const ref = useRef<HTMLDivElement>(null)

  // Drag-to-spawn channels using reusable hook
  const screenToPagePoint = useCallback((clientX: number, clientY: number) => {
    if (!editor) return { x: 0, y: 0 }
    const anyEditor = editor as any
    if (typeof anyEditor.screenToPage === 'function') return anyEditor.screenToPage({ x: clientX, y: clientY })
    if (typeof anyEditor.viewportScreenToPage === 'function') return anyEditor.viewportScreenToPage({ x: clientX, y: clientY })
    const v = editor.getViewportPageBounds()
    return { x: v.midX, y: v.midY }
  }, [editor])

  const { onChannelPointerDown, onChannelPointerMove, onChannelPointerUp } = useChannelDragOut({
    editor,
    screenToPagePoint,
    defaultDimensions,
  })

  // User drag-out state
  const userDragRef = useRef<{
    active: boolean
    pointerId: number | null
    startScreen: { x: number; y: number } | null
    spawnedId: string | null
    currentUser: AuthorInfo | null
    initialDimensions: { w: number; h: number } | null
  }>({ active: false, pointerId: null, startScreen: null, spawnedId: null, currentUser: null, initialDimensions: null })

  const onUserPointerDown = useCallback((user: AuthorInfo, e: React.PointerEvent) => {
    userDragRef.current.active = true
    userDragRef.current.pointerId = e.pointerId
    userDragRef.current.startScreen = { x: e.clientX, y: e.clientY }
    userDragRef.current.spawnedId = null
    userDragRef.current.currentUser = user
    userDragRef.current.initialDimensions = null
    try { (e.currentTarget as any).setPointerCapture?.(e.pointerId) } catch {}
  }, [])

  const onUserPointerMove = useCallback((user: AuthorInfo, e: React.PointerEvent) => {
    const s = userDragRef.current
    if (!s.active || s.pointerId !== e.pointerId || s.currentUser?.id !== user.id) return
    if (!s.startScreen) return

    const dx = e.clientX - s.startScreen.x
    const dy = e.clientY - s.startScreen.y
    const dist = Math.hypot(dx, dy)
    const page = screenToPagePoint(e.clientX, e.clientY)

    if (!s.spawnedId && dist >= 6) { // 6px threshold
      const gridSize = getGridSize()
      const w = snapToGrid(defaultDimensions?.w ?? 200, gridSize)
      const h = snapToGrid(defaultDimensions?.h ?? 200, gridSize)
      s.initialDimensions = { w, h }
      const id = createShapeId()
      transact(() => {
        editor?.createShapes([{
          id,
          type: '3d-box',
          x: snapToGrid(page.x - w / 2, gridSize),
          y: snapToGrid(page.y - h / 2, gridSize),
          props: {
            w,
            h,
            userId: user.id,
            userName: user.username || user.full_name,
            userAvatar: user.avatar
          }
        } as any])
        editor?.setSelectedShapes([id])
      })
      s.spawnedId = id
    } else if (s.spawnedId) {
      // Update position
      if (!s.initialDimensions) return
      const { w, h } = s.initialDimensions
      editor?.updateShapes([{
        id: s.spawnedId as any,
        type: '3d-box',
        x: page.x - w / 2,
        y: page.y - h / 2
      } as any])
    }
  }, [screenToPagePoint, defaultDimensions, editor])

  const onUserPointerUp = useCallback((user: AuthorInfo, e: React.PointerEvent) => {
    const s = userDragRef.current
    if (s.active && s.pointerId === e.pointerId && s.currentUser?.id === user.id) {
      try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId) } catch {}
    }
    userDragRef.current.active = false
    userDragRef.current.pointerId = null
    userDragRef.current.startScreen = null
    userDragRef.current.spawnedId = null
    userDragRef.current.currentUser = null
    userDragRef.current.initialDimensions = null
  }, [])

  // Global wheel capture to prevent browser zoom on pinch within the panel
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      const el = ref.current
      if (!el) return
      const target = e.target as Node | null
      if (target && el.contains(target)) {
        // Prevent browser (page) zoom; allow event to bubble to TLDraw for canvas zoom
        e.preventDefault()
      }
    }
    window.addEventListener('wheel', handler, { capture: true, passive: false })
    return () => window.removeEventListener('wheel', handler, { capture: true } as any)
  }, [])

  // If the global panel state isn’t available, skip rendering the affordance entirely.
  if (!setOpen) {
    return null
  }

  if (!isOpen) {
    return (
      <div
        data-interactive="collapsed-panel"
        style={{
          position: 'absolute',
          top: y,
          left: x,
          width: px(25),
          height: px(25),
          background: '#ffffff',
          borderRadius: 9999,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 1000,
          fontSize: `${px(12)}px`,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: '#111',
          lineHeight: 1,
          padding: 0,
          boxSizing: 'border-box',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}
        onPointerDownCapture={stopEventPropagation}
        onMouseDownCapture={stopEventPropagation}
        onClick={(e) => {
          stopEventPropagation(e as any)
          setOpen(true)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          stopEventPropagation(e as any)
          setOpen(true)
        }}
        onPointerDown={stopEventPropagation}
        onPointerUp={stopEventPropagation}
        onPointerMove={stopEventPropagation}
      >
        <svg
          data-interactive="open-button"
          width={px(25)}
          height={px(25)}
          viewBox="0 0 25 25"
          fill="none"
          style={{
            userSelect: 'none',
          }}
        >
          <circle
            cx="12.5"
            cy="12.5"
            r="12"
            fill="#ffffff"
            stroke="#e6e6e6"
            strokeWidth="1"
          />
          <line x1="12.5" y1="16.5" x2="12.5" y2="12.5" stroke="#999999" strokeWidth="2" strokeLinecap="round"/>
          <line x1="12.5" y1="8.5" x2="12.51" y2="8.5" stroke="#999999" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
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
        maxHeight: px(maxHeightPx),
        overflow: 'auto',
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
        zIndex: 1000,
        background: 'rgba(255,255,255,0.88)',
        borderRadius: px(8),
        boxShadow: `0 ${px(12)}px ${px(32)}px rgba(0,0,0,.12), 0 ${px(3)}px ${px(8)}px rgba(0,0,0,.06), inset 0 0 0 ${px(1)}px rgba(0,0,0,.06)`,
        backdropFilter: 'saturate(1.1) blur(2px)',
        WebkitBackdropFilter: 'saturate(1.1) blur(2px)',
      }}
      onPointerDown={stopEventPropagation}
      onPointerMove={stopEventPropagation}
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
        <div style={{ fontFamily: "'Alte Haas Grotesk', sans-serif", fontWeight: 700, fontSize: `${px(12)}px`, letterSpacing: '-0.0125em', paddingRight: px(28) }}>
          {title || 'Untitled'}
        </div>
        <button
          data-interactive="close-button"
          onClick={(e) => {
            stopEventPropagation(e as any)
            togglePanel()
          }}
          style={{
            position: 'absolute',
            top: px(8),
            right: px(8),
            width: px(20),
            height: px(20),
            borderRadius: 9999,
            // border: '1px solid #e6e6e6',
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
          }}
          onPointerDown={stopEventPropagation}
          onPointerUp={stopEventPropagation}
          onPointerMove={stopEventPropagation}
        >
          <svg width={px(10)} height={px(10)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div style={{ padding: px(8), display: 'grid', rowGap: px(6), color: 'rgba(0,0,0,.7)' }}>
        {loading ? (
          <div style={{ fontSize: `${px(12)}px`, opacity: 0.6 }}>loading…</div>
        ) : error ? (
          <div style={{ fontSize: `${px(12)}px`, opacity: 0.6 }}>error: {error}</div>
        ) : (
          <>
            {author ? (
              <div style={{ display: 'flex', gap: px(6), alignItems: 'baseline' }}>
                <span
                  style={{ fontSize: `${px(12)}px`, cursor: 'pointer' }}
                  onPointerDown={(e) => {
                    stopEventPropagation(e)
                    onUserPointerDown(author, e)
                  }}
                  onPointerMove={(e) => {
                    stopEventPropagation(e)
                    onUserPointerMove(author, e)
                  }}
                  onPointerUp={(e) => {
                    stopEventPropagation(e)
                    onUserPointerUp(author, e)
                  }}
                >
                  {author.full_name || author.username}
                </span>
              </div>
            ) : null}
            {createdAt ? (
              <div style={{ display: 'flex', gap: px(6) }}>
                <span style={{ fontSize: `${px(11)}px`, opacity: 0.6 }}>Added</span>
                <span style={{ fontSize: `${px(12)}px` }}>{new Date(createdAt).toLocaleDateString()}</span>
              </div>
            ) : null}
            {updatedAt ? (
              <div style={{ display: 'flex', gap: px(6) }}>
                <span style={{ fontSize: `${px(11)}px`, opacity: 0.6 }}>Modified</span>
                <span style={{ fontSize: `${px(12)}px` }}>{new Date(updatedAt).toLocaleDateString()}</span>
              </div>
            ) : null}
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
                  border: '1px solid rgba(0,0,0,.08)',
                  borderRadius: px(4),
                  background: 'rgba(0,0,0,.02)',
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: px(8),
                  cursor: (onSelectChannel || editor) ? 'pointer' : 'default',
                  userSelect: 'none',
                }}
                onClick={(e) => {
                  stopEventPropagation(e as any)
                  if (!onSelectChannel) return
                  if (c.slug) onSelectChannel(c.slug)
                }}
                onPointerDown={(e) => {
                  if (editor && c.slug) {
                    stopEventPropagation(e)
                    onChannelPointerDown(c.slug, e)
                  } else {
                    stopEventPropagation(e)
                  }
                }}
                onPointerMove={(e) => {
                  if (editor && c.slug) {
                    stopEventPropagation(e)
                    onChannelPointerMove(c.slug, e)
                  } else {
                    stopEventPropagation(e)
                  }
                }}
                onPointerUp={(e) => {
                  if (editor && c.slug) {
                    stopEventPropagation(e)
                    onChannelPointerUp(c.slug, e)
                  } else {
                    stopEventPropagation(e)
                  }
                }}
              >
                <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'baseline', gap: px(8) }}>
                  <div style={{ fontSize: `${px(12)}px`, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title || c.slug}</div>
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


