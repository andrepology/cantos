import { useEffect, type RefObject } from 'react'

type WheelEventCondition = (e: WheelEvent) => boolean

interface WheelControlOptions {
  onWheel?: (e: WheelEvent) => void
  condition?: WheelEventCondition
  capture?: boolean
  passive?: boolean
}

const DEFAULT_OPTIONS: WheelControlOptions = {
  condition: () => true,
  capture: false,
  passive: false,
}

export const useWheelControl = <T extends HTMLElement>(
  ref: RefObject<T | null>,
  options: WheelControlOptions = {}
) => {
  const { onWheel, condition, capture, passive } = { ...DEFAULT_OPTIONS, ...options }

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const listener = (event: WheelEvent) => {
      if (condition && condition(event)) {
        event.preventDefault()
      }
      if (onWheel) {
        onWheel(event)
      }
    }

    const listenerOptions: AddEventListenerOptions = { capture, passive }
    element.addEventListener('wheel', listener, listenerOptions)

    return () => {
      element.removeEventListener('wheel', listener, listenerOptions)
    }
  }, [ref, condition, onWheel, capture, passive])
}

export const useWheelPreventDefault = <T extends HTMLElement>(
  ref: RefObject<T | null>,
  condition: WheelEventCondition = () => true
) => {
  useWheelControl(ref, { condition })
}

