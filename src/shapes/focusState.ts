import { useSyncExternalStore } from 'react'

export type ShapeFocusState = {
  activeShapeId: string | null
  cameraSnapshot: { x: number; y: number; z: number } | null
}

let state: ShapeFocusState = {
  activeShapeId: null,
  cameraSnapshot: null,
}

const listeners = new Set<() => void>()

const notify = () => {
  listeners.forEach((listener) => listener())
}

const setState = (next: ShapeFocusState) => {
  if (
    state.activeShapeId === next.activeShapeId &&
    state.cameraSnapshot === next.cameraSnapshot
  ) {
    return
  }
  state = next
  notify()
}

/**
 * Sets the active focused shape and optionally captures the camera state.
 * Also updates a DOM attribute for CSS-based deemphasis (no React re-renders).
 */
export const setFocusedShape = (
  shapeId: string | null,
  cameraSnapshot: { x: number; y: number; z: number } | null = state.cameraSnapshot
) => {
  setState({
    activeShapeId: shapeId,
    cameraSnapshot,
  })

  // DOM-based deemphasis: set attribute on document root for CSS selectors
  // This allows non-focused shapes to be styled without React re-renders
  const root = document.documentElement
  if (shapeId) {
    root.setAttribute('data-shape-focused', shapeId)
  } else {
    root.removeAttribute('data-shape-focused')
  }
}

export const getShapeFocusState = () => state

export const subscribeShapeFocus = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useShapeFocusState = () =>
  useSyncExternalStore(subscribeShapeFocus, getShapeFocusState, getShapeFocusState)


