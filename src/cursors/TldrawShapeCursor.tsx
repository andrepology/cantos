import { useEffect, useLayoutEffect, useState, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, useMotionValue, motionValue, useTransform, type MotionValue } from 'motion/react'
import { useEditor } from 'tldraw'



/* -------------------------------------------------------------------------- */
/* Cursor State Types                                                         */
/* -------------------------------------------------------------------------- */

type CursorStateType = 'idle' | 'moving' | 'edge' | 'corner'

type TldrawCursorState = 
  | { type: 'idle' }
  | { type: 'moving' }
  | { type: 'edge', direction: 'horizontal' | 'vertical', rotation: number }
  | { type: 'corner', position: 'tl' | 'tr' | 'bl' | 'br', rotation: number }

/* -------------------------------------------------------------------------- */
/* Pointer Position Tracking                                                  */
/* -------------------------------------------------------------------------- */

let mvX: MotionValue<number> | null = null
let mvY: MotionValue<number> | null = null

function usePointerPosition(): { x: MotionValue<number>; y: MotionValue<number> } {
  if (!mvX || !mvY) {
    mvX = motionValue(0)
    mvY = motionValue(0)
    if (typeof window !== 'undefined') {
      window.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'mouse') {
          mvX!.set(e.clientX)
          mvY!.set(e.clientY)
        }
      }, { passive: true })
    }
  }
  return { x: mvX!, y: mvY! }
}

/* -------------------------------------------------------------------------- */
/* State Detection Lookup Tables (O(1) instead of nested if/else)            */
/* -------------------------------------------------------------------------- */

const HANDLE_STATE_MAP: Record<string, TldrawCursorState> = {
  'selection.top-left': { type: 'corner', position: 'tl', rotation: 0 },
  'selection.top_left': { type: 'corner', position: 'tl', rotation: 0 },
  'selection.target.top-left': { type: 'corner', position: 'tl', rotation: 0 },
  'selection.target.top_left': { type: 'corner', position: 'tl', rotation: 0 },
  'selection.top-right': { type: 'corner', position: 'tr', rotation: 0 },
  'selection.top_right': { type: 'corner', position: 'tr', rotation: 0 },
  'selection.target.top-right': { type: 'corner', position: 'tr', rotation: 0 },
  'selection.target.top_right': { type: 'corner', position: 'tr', rotation: 0 },
  'selection.bottom-right': { type: 'corner', position: 'br', rotation: 0 },
  'selection.bottom_right': { type: 'corner', position: 'br', rotation: 0 },
  'selection.target.bottom-right': { type: 'corner', position: 'br', rotation: 0 },
  'selection.target.bottom_right': { type: 'corner', position: 'br', rotation: 0 },
  'selection.bottom-left': { type: 'corner', position: 'bl', rotation: 0 },
  'selection.bottom_left': { type: 'corner', position: 'bl', rotation: 0 },
  'selection.target.bottom-left': { type: 'corner', position: 'bl', rotation: 0 },
  'selection.target.bottom_left': { type: 'corner', position: 'bl', rotation: 0 },
}

// Edge patterns - check for substrings since testId varies
function getEdgeState(testId: string): TldrawCursorState | null {
  if (testId.includes('.top') || testId.includes('.bottom')) {
    return { type: 'edge', direction: 'horizontal', rotation: 0 }
  }
  if (testId.includes('.left') || testId.includes('.right')) {
    return { type: 'edge', direction: 'vertical', rotation: 0 }
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* DOM Cache (small LRU to avoid WeakMap growth concerns)                     */
/* -------------------------------------------------------------------------- */

const testIdCache = new Map<Element, string | null>()
const MAX_CACHE_SIZE = 100

function getCachedTestId(element: Element): string | null {
  if (testIdCache.has(element)) {
    return testIdCache.get(element)!
  }

  const testId = element.getAttribute('data-testid')

  // Simple LRU: if cache is full, delete oldest entry (first in Map)
  if (testIdCache.size >= MAX_CACHE_SIZE) {
    const firstKey = testIdCache.keys().next().value
    if (firstKey) testIdCache.delete(firstKey)
  }

  testIdCache.set(element, testId)
  return testId
}

/* -------------------------------------------------------------------------- */
/* TLDraw Cursor State Detection (Optimized with RAF + Refs)                 */
/* -------------------------------------------------------------------------- */

function useTldrawCursorState(): TldrawCursorState {
  const editor = useEditor()
  const [state, setState] = useState<TldrawCursorState>({ type: 'idle' })
  
  // Use refs to avoid effect re-registration on state changes
  const stateRef = useRef<TldrawCursorState>(state)
  const resizeStateRef = useRef<TldrawCursorState | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const latestEventRef = useRef<{ type: 'over' | 'move' | 'down' | 'up', event: PointerEvent } | null>(null)
  const debounceTimeoutRef = useRef<number | null>(null)

  // Sync stateRef with state
  useLayoutEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    if (!editor) return

    const checkResizingState = () => {
      const anyEditor = editor as any
      const isResizing = anyEditor.inputs?.isResizing || editor.getPath().includes('resizing')
      return isResizing
    }

    // Debounced state setter to prevent flickering during rapid handle hovers
    const setStateDebounced = (newState: TldrawCursorState, immediate = false) => {
      if (debounceTimeoutRef.current !== null) {
        clearTimeout(debounceTimeoutRef.current)
        debounceTimeoutRef.current = null
      }

      if (immediate || newState.type === 'moving') {
        setState(newState)
        return
      }

      // For idle/edge/corner, add small debounce to prevent flicker
      debounceTimeoutRef.current = setTimeout(() => {
        setState(newState)
        debounceTimeoutRef.current = null
      }, 30) as any
    }

    // Process accumulated events in RAF for 60fps max
    const processEvents = () => {
      const latest = latestEventRef.current
      latestEventRef.current = null
      rafIdRef.current = null

      if (!latest) return

      const { type: eventType, event: e } = latest

      if (eventType === 'up') {
        resizeStateRef.current = null
        setStateDebounced({ type: 'idle' }, true)
        return
      }

      if (eventType === 'down') {
        const currentState = stateRef.current
        if (currentState.type === 'edge' || currentState.type === 'corner') {
          resizeStateRef.current = currentState
        }
        return
      }

      // For over/move events
      if (eventType === 'over' || eventType === 'move') {
        // Early exit: only check cursor states if shapes are selected (optimization)
        const hasSelection = editor.getSelectedShapeIds().length > 0
        if (!hasSelection) {
          if (stateRef.current.type !== 'idle') {
            setStateDebounced({ type: 'idle' })
          }
          resizeStateRef.current = null
          return
        }

        // If we're resizing, maintain the current resize state
        if (checkResizingState() && resizeStateRef.current) {
          if (stateRef.current.type !== resizeStateRef.current.type) {
            setStateDebounced(resizeStateRef.current, true)
          }
          return
        }

        const target = e.target as Element | null
        if (!target) return

        // Check for selection handles using cached testId
        const testId = getCachedTestId(target)

        if (testId && testId.includes('selection')) {
          // Try exact lookup first (O(1))
          let newState: TldrawCursorState | null = HANDLE_STATE_MAP[testId] || null

          // Fall back to edge pattern matching
          if (!newState) {
            newState = getEdgeState(testId)
          }

          if (newState) {
            // Only update if state actually changed
            const currentState = stateRef.current
            if (currentState.type !== newState.type ||
                (newState.type === 'edge' && currentState.type === 'edge' && (currentState as any).direction !== (newState as any).direction) ||
                (newState.type === 'corner' && currentState.type === 'corner' && (currentState as any).position !== (newState as any).position)) {
              setStateDebounced(newState)
            }
            resizeStateRef.current = newState
            return
          }
        }

        // Check if we're moving a shape (not resizing)
        const anyEditor = editor as any
        const isDragging = anyEditor.inputs?.isDragging

        if (isDragging && !checkResizingState()) {
          if (stateRef.current.type !== 'moving') {
            setStateDebounced({ type: 'moving' }, true)
          }
          resizeStateRef.current = null
          return
        }

        // Default to idle
        if (stateRef.current.type !== 'idle') {
          setStateDebounced({ type: 'idle' })
        }
        resizeStateRef.current = null
      }
    }

    // RAF-throttled event scheduler
    const scheduleProcess = (type: 'over' | 'move' | 'down' | 'up', event: PointerEvent) => {
      latestEventRef.current = { type, event }

      // For critical events (down/up), process immediately
      if (type === 'down' || type === 'up') {
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current)
        }
        processEvents()
        return
      }

      // For move/over, throttle with RAF
      if (rafIdRef.current !== null) {
        return
      }
      rafIdRef.current = requestAnimationFrame(processEvents)
    }

    const onPointerOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') {
        return
      }
      scheduleProcess('over', e)
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') {
        return
      }
      scheduleProcess('down', e)
    }

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') {
        return
      }
      scheduleProcess('move', e)
    }

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') {
        return
      }
      scheduleProcess('up', e)
    }

    // Register listeners ONCE (no state in dependencies) - use capture phase to be immune to stopEventPropagation
    window.addEventListener('pointerover', onPointerOver, { passive: true, capture: true })
    window.addEventListener('pointerdown', onPointerDown, { passive: true, capture: true })
    window.addEventListener('pointermove', onPointerMove, { passive: true, capture: true })
    window.addEventListener('pointerup', onPointerUp, { passive: true, capture: true })

    return () => {
      // Cleanup RAF and timeouts
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
      if (debounceTimeoutRef.current !== null) {
        clearTimeout(debounceTimeoutRef.current)
      }

      window.removeEventListener('pointerover', onPointerOver, { capture: true })
      window.removeEventListener('pointerdown', onPointerDown, { capture: true })
      window.removeEventListener('pointermove', onPointerMove, { capture: true })
      window.removeEventListener('pointerup', onPointerUp, { capture: true })
    }
  }, [editor]) // Only depends on editor (stable)

  return state
}

/* -------------------------------------------------------------------------- */
/* Hide System Cursor                                                         */
/* -------------------------------------------------------------------------- */

function useHideSystemCursor() {
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return
    
    const style = document.createElement('style')
    style.id = 'tldraw-shape-cursor-hide'
    style.textContent = `
      .tldraw__editor * { cursor: none !important; }
    `
    document.head.appendChild(style)

    return () => {
      const existing = document.getElementById('tldraw-shape-cursor-hide')
      if (existing) {
        document.head.removeChild(existing)
      }
    }
  }, [])
}

/* -------------------------------------------------------------------------- */
/* Main Cursor Component (Split Concerns + Motion Values)                    */
/* -------------------------------------------------------------------------- */

export function TldrawShapeCursor() {
  useHideSystemCursor()

  const pointer = usePointerPosition()
  const state = useTldrawCursorState()

  // Direct mouse position for pixel-perfect precision (no spring delay)
  const posX = pointer.x
  const posY = pointer.y

  const hasPointerMoved = useRef(false)
  const isActiveRef = useRef(false)
  const willChangeTimeoutRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    const sub = pointer.x.on('change', () => {
      hasPointerMoved.current = true
      sub()
    })
  }, [pointer.x])

  // Get rotation for edge/corner states
  const rotation = useMemo(() => {
    if (state.type === 'edge' || state.type === 'corner') {
      return state.rotation
    }
    return 0
  }, [state])

  // Memoize variants (static configuration)
  const variants = useMemo(() => ({
    idle: { 
      width: 17, 
      height: 17, 
      borderRadius: 20,
      scale: 1,
      opacity: 1,
    },
    moving: { 
      width: 24, 
      height: 24, 
      borderRadius: 20,
      scale: 1.4,
      opacity: 0.8,
    },
    edge: { 
      width: state.type === 'edge' && (state as any).direction === 'vertical' ? 6 : 48,
      height: state.type === 'edge' && (state as any).direction === 'vertical' ? 48 : 6,
      borderRadius: 2,
      scale: 1,
      opacity: 1,
    },
    corner: { 
      width: 20, 
      height: 20, 
      borderRadius: 20,
      scale: 1,
      opacity: 1,
    },
  }), [state])

  // Dynamic will-change management (add on activity, remove on idle)
  useEffect(() => {
    // Set will-change when state changes (activity)
    if (!isActiveRef.current) {
      isActiveRef.current = true
    }

    // Clear existing timeout
    if (willChangeTimeoutRef.current !== null) {
      clearTimeout(willChangeTimeoutRef.current)
    }

    // Remove will-change after 200ms of no state changes (saves GPU memory)
    willChangeTimeoutRef.current = setTimeout(() => {
      isActiveRef.current = false
      willChangeTimeoutRef.current = null
    }, 200) as any

    return () => {
      if (willChangeTimeoutRef.current !== null) {
        clearTimeout(willChangeTimeoutRef.current)
      }
    }
  }, [state])

  if (!hasPointerMoved.current) return null

  return createPortal(
    <motion.div
        data-tldraw-cursor={state.type}
        variants={variants}
        animate={state.type}
        transition={{ duration: 0.15, ease: [0.38, 0.12, 0.29, 1] }}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          pointerEvents: 'none',
          zIndex: 99999,
          background: 'rgba(0, 0, 0, 0.06)',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(0, 0, 0, 0.15)',
          willChange: isActiveRef.current ? 'transform' : 'auto',
          x: posX,
          y: posY,
          rotate: rotation,
          transformOrigin: 'center',
          // Center the cursor on the pointer
          translateX: '-50%',
          translateY: '-50%',
        }}
      />,
    document.body
  )
}

