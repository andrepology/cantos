import { useSyncExternalStore } from 'react'

type RightClickTiltState = {
  activeShapeId: string | null
  strength: number
}

let state: RightClickTiltState = {
  activeShapeId: null,
  strength: 0,
}

const listeners = new Set<() => void>()

const notify = () => {
  listeners.forEach((listener) => listener())
}

const setState = (next: RightClickTiltState) => {
  if (
    state.activeShapeId === next.activeShapeId &&
    state.strength === next.strength
  ) {
    return
  }
  state = next
  notify()
}

export const setRightClickTiltActive = (shapeId: string | null) => {
  setState({
    ...state,
    activeShapeId: shapeId,
  })
}

export const setRightClickTiltStrength = (strength: number) => {
  setState({
    ...state,
    strength,
  })
}

export const getRightClickTiltState = () => state

export const subscribeRightClickTilt = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useRightClickTiltState = () =>
  useSyncExternalStore(subscribeRightClickTilt, getRightClickTiltState, getRightClickTiltState)
