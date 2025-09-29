import { useEffect, useMemo, useRef, useState } from 'react'
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

  const result = useMemo<{ hole: RectScreen; viewport: RectScreen } | null>(() => {
    if (!vpb || !screen) return null

    // Visible page rect (page space)
    const visible: RectPage = { x: vpb.minX, y: vpb.minY, w: vpb.width, h: vpb.height }

    // Collect page-space rects of selected shapes, clipped to visible area
    const rects: RectPage[] = []
    for (const id of selectedIds) {
      const shape = editor.getShape(id)
      if (!shape) continue
      const b = editor.getShapePageBounds(shape)
      if (!b) continue
      const clipped = intersectPage({ x: b.minX, y: b.minY, w: b.width, h: b.height }, visible)
      if (clipped) rects.push(clipped)
    }
    // Union in page space (or fallback to a 1px hole at viewport center when no selection)
    let minX: number
    let minY: number
    let maxX: number
    let maxY: number
    if (rects.length === 0) {
      const cx = vpb.minX + vpb.width / 2
      const cy = vpb.minY + vpb.height / 2
      minX = cx
      minY = cy
      maxX = cx + 1
      maxY = cy + 1
    } else {
      minX = rects[0].x
      minY = rects[0].y
      maxX = rects[0].x + rects[0].w
      maxY = rects[0].y + rects[0].h
      for (let i = 1; i < rects.length; i++) {
        const r = rects[i]
        if (r.x < minX) minX = r.x
        if (r.y < minY) minY = r.y
        const rx = r.x + r.w
        const ry = r.y + r.h
        if (rx > maxX) maxX = rx
        if (ry > maxY) maxY = ry
      }
    }

    // Convert page -> screen using viewport mapping (robust; avoids relying on camera)
    const sx = screen.w / vpb.width
    const sy = screen.h / vpb.height
    const pageToScreenX = (px: number) => screen.x + (px - vpb.minX) * sx
    const pageToScreenY = (py: number) => screen.y + (py - vpb.minY) * sy

    const hole = {
      left: pageToScreenX(minX),
      top: pageToScreenY(minY),
      width: (maxX - minX) * sx,
      height: (maxY - minY) * sy,
    }

    // Clamp hole to current viewport screen bounds
    const view = { left: screen.x, top: screen.y, width: screen.w, height: screen.h }
    const clamp = (v: RectScreen): RectScreen => ({
      left: Math.max(view.left, v.left),
      top: Math.max(view.top, v.top),
      width: Math.max(0, Math.min(view.left + view.width, v.left + v.width) - Math.max(view.left, v.left)),
      height: Math.max(0, Math.min(view.top + view.height, v.top + v.height) - Math.max(view.top, v.top)),
    })
    const holeClamped = clamp(hole)

    return { hole: holeClamped, viewport: view }
  }, [editor, selectedIds, vpb, screen, zoom, camera])

  if (!result) return null

  // Simple, efficient "focus pull": animate blur intensity & dimming when selection toggles
  const hasSelection = (selectedIds?.length ?? 0) > 0
  const TRANSITION_MS = 180

  // Freeze the hole on deselect so the blur fades out without covering the previously selected shape
  const lastHoleRef = useRef<RectScreen>(result.hole)
  const [freezeHole, setFreezeHole] = useState(false)

  useEffect(() => {
    if (hasSelection) {
      lastHoleRef.current = result.hole
      setFreezeHole(false)
      return
    }
    // When deselecting, keep previous hole until blur reaches 0
    setFreezeHole(true)
    const t = window.setTimeout(() => setFreezeHole(false), TRANSITION_MS + 40)
    return () => window.clearTimeout(t)
  }, [hasSelection, result.hole])

  const centerHole: RectScreen = useMemo(() => {
    const cx = Math.round(result.viewport.left + result.viewport.width / 2)
    const cy = Math.round(result.viewport.top + result.viewport.height / 2)
    return { left: cx, top: cy, width: 1, height: 1 }
  }, [result.viewport])

  const effectiveHole = hasSelection ? result.hole : (freezeHole ? lastHoleRef.current : centerHole)
  const blurPx = hasSelection ? 10 : 0
  const dimAlpha = hasSelection ? 0.16 : 0

  const styleCommon: React.CSSProperties = {
    position: 'fixed',
    backdropFilter: `blur(${blurPx}px)`,
    WebkitBackdropFilter: `blur(${blurPx}px)`,
    background: `rgba(255,255,255,${dimAlpha})`,
    transition: 'backdrop-filter 380ms ease, -webkit-backdrop-filter 380ms ease, background 380ms ease, left 380ms ease, top 380ms ease, width 380ms ease, height 380ms ease',
    pointerEvents: 'none',
    zIndex: 1000,
  }

  // Single overlay with CSS mask (four linear-gradients) to avoid seams and reduce DOM updates
  const view = result.viewport
  const hole = effectiveHole
  const topH = Math.max(0, Math.round(hole.top - view.top))
  const bottomH = Math.max(0, Math.round(view.top + view.height - (hole.top + hole.height)))
  const leftW = Math.max(0, Math.round(hole.left - view.left))
  const rightW = Math.max(0, Math.round(view.left + view.width - (hole.left + hole.width)))

  const maskImage = 'linear-gradient(#000, #000), linear-gradient(#000, #000), linear-gradient(#000, #000), linear-gradient(#000, #000)'
  const maskRepeat = 'no-repeat, no-repeat, no-repeat, no-repeat'
  const maskSize = `${view.width}px ${topH}px, ${view.width}px ${bottomH}px, ${leftW}px ${hole.height}px, ${rightW}px ${hole.height}px`
  const maskPosition = `${0}px ${0}px, ${0}px ${hole.top + hole.height}px, ${0}px ${hole.top}px, ${hole.left + hole.width}px ${hole.top}px`

  return (
    <>
      <div
        style={{
          ...styleCommon,
          left: view.left,
          top: view.top,
          width: view.width,
          height: view.height,
          WebkitMaskImage: maskImage as unknown as string,
          WebkitMaskRepeat: maskRepeat as unknown as string,
          WebkitMaskSize: maskSize as unknown as string,
          WebkitMaskPosition: maskPosition as unknown as string,
          maskImage: maskImage as unknown as string,
          maskRepeat: maskRepeat as unknown as string,
          maskSize: maskSize as unknown as string,
          maskPosition: maskPosition as unknown as string,
          willChange: 'backdrop-filter',
        }}
      />
      {/* Feathered halo to soften the inner edge (optional) */}
      <div
        style={{
          position: 'fixed',
          left: hole.left,
          top: hole.top,
          width: Math.max(0, Math.round(hole.width)),
          height: Math.max(0, Math.round(hole.height)),
          boxShadow: hasSelection ? '0 0 0 64px rgba(255,255,255,0.12)' : '0 0 0 0 rgba(255,255,255,0.0)',
          borderRadius: 2,
          transition: 'box-shadow 160ms ease',
          pointerEvents: 'none',
          zIndex: 1000,
        }}
      />
    </>
  )
}


