import { useMemo, useRef, useState, useEffect } from 'react'
import { useEditor, useValue } from 'tldraw'

interface RectPage {
  x: number
  y: number
  w: number
  h: number
}

interface RectScreen {
  left: number
  top: number
  width: number
  height: number
}

interface FocusRects {
  shape: RectScreen
  panel: RectScreen | null
  viewport: RectScreen
}

function intersectPage(a: RectPage, b: RectPage): RectPage | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const r = Math.min(a.x + a.w, b.x + b.w)
  const btm = Math.min(a.y + a.h, b.y + b.h)
  if (r <= x || btm <= y) return null
  return { x, y, w: r - x, h: btm - y }
}

export function FocusBlurOverlay() {
  const editor = useEditor()

  const selectedIds = useValue('focus/selection', () => editor.getSelectedShapeIds(), [editor])
  const vpb = useValue('focus/vpb', () => editor.getViewportPageBounds(), [editor])
  const screen = useValue('focus/screen', () => editor.getViewportScreenBounds(), [editor])
  const zoom = useValue('focus/zoom', () => (typeof editor.getZoomLevel === 'function' ? editor.getZoomLevel() || 1 : 1), [editor])
  const camera = useValue('focus/camera', () => (typeof (editor as any).getCamera === 'function' ? (editor as any).getCamera() : { x: 0, y: 0, z: zoom }), [editor, zoom]) as { x: number; y: number; z?: number }

  // Check if any ConnectionsPanel is open
  const [hasOpenPanel, setHasOpenPanel] = useState(false)

  useEffect(() => {
    const checkPanels = () => {
      const panels = document.querySelectorAll('[data-interactive="connections-panel"]')
      setHasOpenPanel(panels.length > 0)
    }

    // Check immediately
    checkPanels()

    // Observe the shapes layer specifically (more targeted)
    // Panels are rendered as part of shape components, so watch the shapes container
    const shapesElement = document.querySelector('.tl-shapes') ||
                         document.querySelector('[data-tldraw-shapes]') ||
                         document.querySelector('.tldraw-shapes')

    const targetElement = shapesElement || document.body

    // Set up observer for future changes
    const observer = new MutationObserver(checkPanels)
    observer.observe(targetElement, {
      childList: true,
      subtree: true
    })

    return () => observer.disconnect()
  }, []) // Empty dependency array - only set up once

  // Single-stage focus: blur when panel opens
  const hasFullFocus = hasOpenPanel

  // Performance monitoring
  const [fps, setFps] = useState(0)
  const [avgFps, setAvgFps] = useState(0)
  const frameCountRef = useRef(0)
  const lastTimeRef = useRef(performance.now())
  const fpsHistoryRef = useRef<number[]>([])

  useEffect(() => {
    let animationId: number

    const measureFPS = () => {
      const now = performance.now()
      frameCountRef.current++

      // Update FPS every 60 frames (~1 second at 60fps)
      if (frameCountRef.current >= 60) {
        const deltaTime = (now - lastTimeRef.current) / 1000 // seconds
        const currentFps = Math.round(frameCountRef.current / deltaTime)

        setFps(currentFps)

        // Maintain rolling average of last 10 measurements
        fpsHistoryRef.current.push(currentFps)
        if (fpsHistoryRef.current.length > 10) {
          fpsHistoryRef.current.shift()
        }
        const average = Math.round(
          fpsHistoryRef.current.reduce((a, b) => a + b, 0) / fpsHistoryRef.current.length
        )
        setAvgFps(average)

        frameCountRef.current = 0
        lastTimeRef.current = now
      }

      animationId = requestAnimationFrame(measureFPS)
    }

    measureFPS()

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
    }
  }, [])

  // Compute precise rects for shape and panel
  const focusRects: FocusRects | null = useMemo(() => {
    // Keep overlay mounted even when not focused; only bail if viewport info missing
    if (!vpb || !screen) return null


    const viewport = { left: screen.x, top: screen.y, width: screen.w, height: screen.h }
    const visible: RectPage = { x: vpb.minX, y: vpb.minY, w: vpb.width, h: vpb.height }

    // Get selected shape bounds in screen space
    let shapeBounds: RectScreen | null = null
    for (const id of selectedIds) {
      const shape = editor.getShape(id)
      if (!shape) continue
      const b = editor.getShapePageBounds(shape)
      if (!b) continue
      const clipped = intersectPage({ x: b.minX, y: b.minY, w: b.width, h: b.height }, visible)
      if (!clipped) continue

      const sx = screen.w / vpb.width
      const sy = screen.h / vpb.height
      const pageToScreenX = (px: number) => screen.x + (px - vpb.minX) * sx
      const pageToScreenY = (py: number) => screen.y + (py - vpb.minY) * sy

      shapeBounds = {
        left: pageToScreenX(clipped.x),
        top: pageToScreenY(clipped.y),
        width: clipped.w * sx,
        height: clipped.h * sy,
      }
      break // Only use first selected shape
    }

    // Get fresh panel bounds directly - observers might lag during pan operations
    const panels = document.querySelectorAll('[data-interactive="connections-panel"]')
    const currentPanelBounds = panels.length > 0 ? panels[0].getBoundingClientRect() : null

    let panelRect: RectScreen | null = null
    if (currentPanelBounds && currentPanelBounds.width > 0 && currentPanelBounds.height > 0) {
      // Panel bounds are screen coordinates, clamp to viewport
      const clampedPanel = {
        left: Math.max(viewport.left, currentPanelBounds.left),
        top: Math.max(viewport.top, currentPanelBounds.top),
        width: Math.max(0, Math.min(viewport.left + viewport.width, currentPanelBounds.left + currentPanelBounds.width) - Math.max(viewport.left, currentPanelBounds.left)),
        height: Math.max(0, Math.min(viewport.top + viewport.height, currentPanelBounds.top + currentPanelBounds.height) - Math.max(viewport.top, currentPanelBounds.top)),
      }
      if (clampedPanel.width > 0 && clampedPanel.height > 0) {
        panelRect = clampedPanel
      }
    }

    // Always return rects so the overlay remains mounted and can animate in/out
    const result = {
      shape: shapeBounds || { left: viewport.left + viewport.width / 2, top: viewport.top + viewport.height / 2, width: 1, height: 1 },
      panel: panelRect,
      viewport,
    }
    return result
  }, [editor, selectedIds, vpb, screen, zoom, camera, hasFullFocus])

  if (!focusRects) return null

  const { shape, panel, viewport } = focusRects

  return (
    <>
      {/* SVG mask for precise even-odd cutouts */}
      <svg
        style={{
          position: 'fixed',
          left: viewport.left,
          top: viewport.top,
          width: viewport.width,
          height: viewport.height,
          pointerEvents: 'none',
          zIndex: 999, // Behind overlay
        }}
      >
        <defs>
          <mask id="focus-mask">
            {/* Full viewport rect (white = visible) */}
            <rect
              x="0"
              y="0"
              width={viewport.width}
              height={viewport.height}
              fill="white"
            />
            {/* Subtract shape rect (black = invisible) */}
            <rect
              x={shape.left - viewport.left}
              y={shape.top - viewport.top}
              width={shape.width}
              height={shape.height}
              fill="black"
              rx={8}
            />
            {/* Subtract panel rect if exists */}
            {panel && (
              <rect
                x={panel.left - viewport.left}
                y={panel.top - viewport.top}
                width={panel.width}
                height={panel.height}
                fill="black"
                rx={8}
              />
            )}
          </mask>
        </defs>
      </svg>

      {/* Blur layer - activates when panel opens for focus pull */}
      <div
        style={{
          position: 'fixed',
          left: viewport.left,
          top: viewport.top,
          width: viewport.width,
          height: viewport.height,
          // Keep blur at minimum 0.5px when unfocused to prevent compositor from disabling filter
          backdropFilter: `blur(${hasFullFocus ? 8 : 0.5}px)`,
          WebkitBackdropFilter: `blur(${hasFullFocus ? 8 : 0.5}px)`,
          // Keep bg slightly above 0 to maintain filter layer
          backgroundColor: `rgba(255,255,255,${hasFullFocus ? 0.28 : 0.01})`,
          opacity: hasFullFocus ? 1 : 0,
          mask: 'url(#focus-mask)',
          WebkitMask: 'url(#focus-mask)',
          willChange: 'opacity',
          // Only transition opacity - blur/bg stay constant at their floor values
          transition: 'opacity 240ms cubic-bezier(0.4, 0, 0.2, 1)',
          pointerEvents: 'none',
          zIndex: 999,
        }}
      />

      {/* FPS Performance Monitor */}
      <div
        style={{
          position: 'fixed',
          top: 10,
          right: 10,
          background: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          fontFamily: 'monospace',
          fontSize: '12px',
          zIndex: 1000,
          pointerEvents: 'none',
        }}
      >
        <div>FPS: {fps}</div>
        <div>Avg: {avgFps}</div>
        <div style={{ fontSize: '10px', color: '#ccc' }}>
          Blur: {hasFullFocus ? '8px' : 'off'}
        </div>
      </div>

    </>
  )
}



