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
 */
export const setFocusedShape = (
  shapeId: string | null,
  cameraSnapshot: { x: number; y: number; z: number } | null = state.cameraSnapshot
) => {
  setState({
    activeShapeId: shapeId,
    cameraSnapshot,
  })
}

export const getShapeFocusState = () => state

export const subscribeShapeFocus = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useShapeFocusState = () =>
  useSyncExternalStore(subscribeShapeFocus, getShapeFocusState, getShapeFocusState)

