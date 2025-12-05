import { useCallback, useEffect, useRef, useState } from 'react'
import type { LayoutMode } from '../../arena/hooks/useTactileLayout'

type UseStackNavigationOptions = {
  cardCount: number
  stride: number
  scrollOffset: number
  isActive: boolean
  onScrollChange: (offset: number) => void
}

type UseStackNavigationResult = {
  stackIndex: number
  goToIndex: (next: number) => void
  handleWheelDelta: (deltaPx: number) => void
  resetWheel: () => void
}

export function useStackNavigation({
  cardCount,
  stride,
  scrollOffset,
  isActive,
  onScrollChange,
}: UseStackNavigationOptions): UseStackNavigationResult {
  const [stackIndex, setStackIndex] = useState(0)
  const stackIndexRef = useRef(0)
  const wheelAccumRef = useRef(0)

  const clampIndex = useCallback(
    (value: number) => {
      if (cardCount <= 0) return 0
      return Math.max(0, Math.min(cardCount - 1, value))
    },
    [cardCount]
  )

  const commitIndex = useCallback(
    (next: number) => {
      const clamped = clampIndex(next)
      if (clamped === stackIndexRef.current) return false
      stackIndexRef.current = clamped
      setStackIndex(clamped)
      onScrollChange(clamped * stride)
      return true
    },
    [clampIndex, onScrollChange, stride]
  )

  const goToIndex = useCallback(
    (next: number) => {
      if (cardCount <= 0) return
      const clamped = clampIndex(next)
      stackIndexRef.current = clamped
      setStackIndex(clamped)
      onScrollChange(clamped * stride)
    },
    [cardCount, clampIndex, onScrollChange, stride]
  )

  useEffect(() => {
    if (!isActive || cardCount <= 0) return
    const derived = clampIndex(Math.round(scrollOffset / stride))
    if (derived !== stackIndexRef.current) {
      stackIndexRef.current = derived
      setStackIndex(derived)
    }
  }, [cardCount, clampIndex, isActive, scrollOffset, stride])

  const handleWheelDelta = useCallback(
    (deltaPx: number) => {
      if (!isActive || cardCount <= 1 || deltaPx === 0) return
      const threshold = 35
      let accum = wheelAccumRef.current * 0.95 + deltaPx
      const steps = accum > 0 ? Math.floor(accum / threshold) : Math.ceil(accum / threshold)
      if (steps !== 0) {
        const changed = commitIndex(stackIndexRef.current + steps)
        if (changed) {
          accum -= steps * threshold
        } else {
          accum = 0
        }
      }
      wheelAccumRef.current = accum
    },
    [cardCount, commitIndex, isActive]
  )

  const resetWheel = useCallback(() => {
    wheelAccumRef.current = 0
  }, [])

  return { stackIndex, goToIndex, handleWheelDelta, resetWheel }
}

type ScrubberVisibilityOptions = {
  isActive: boolean
  delayMs?: number
  // NEW: Visibility condition inputs
  mode: LayoutMode
  isFocusMode: boolean
  cardCount: number
  containerWidth: number
}

type ScrubberVisibilityResult = {
  isVisible: boolean
  scrubberWidth: number
  showScrubber: boolean
  scrubberStyle: React.CSSProperties
  zoneStyle: React.CSSProperties
  handleZoneEnter: () => void
  handleZoneLeave: () => void
  handleScrubStart: () => void
  handleScrubEnd: () => void
  forceHide: () => void
}

export function useScrubberVisibility({
  isActive,
  delayMs = 450,
  mode,
  isFocusMode,
  cardCount,
  containerWidth,
}: ScrubberVisibilityOptions): ScrubberVisibilityResult {
  const [isVisible, setIsVisible] = useState(false)
  const isHoveringRef = useRef(false)
  const isDraggingRef = useRef(false)
  const hideTimeoutRef = useRef<number | null>(null)

  // Visibility condition calculation
  const rawScrubberWidth = Math.min(Math.max(0, containerWidth - 48), 400)
  const scrubberWidth = rawScrubberWidth >= 50 ? rawScrubberWidth : 0
  const showScrubber = (mode === 'stack' || isFocusMode) && cardCount > 1 && scrubberWidth > 0

  // Style calculations
  const scrubberStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: 12,
    left: '50%',
    transform: `translate(-50%, ${isVisible ? '0px' : '24px'})`,
    opacity: isVisible ? 1 : 0,
    pointerEvents: isVisible ? 'auto' : 'none',
    transition: 'opacity 160ms ease, transform 220ms ease',
    width: scrubberWidth,
    zIndex: 4001,
  }

  const zoneStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '30%',
    pointerEvents: 'auto',
    background: 'transparent',
    zIndex: 4000,
  }

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current != null) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
  }, [])

  const show = useCallback(() => {
    clearHideTimeout()
    setIsVisible(true)
  }, [clearHideTimeout])

  const scheduleHide = useCallback(() => {
    clearHideTimeout()
    hideTimeoutRef.current = window.setTimeout(() => {
      if (!isHoveringRef.current && !isDraggingRef.current) {
        setIsVisible(false)
      }
      hideTimeoutRef.current = null
    }, delayMs)
  }, [clearHideTimeout, delayMs])

  const handleZoneEnter = useCallback(() => {
    isHoveringRef.current = true
    show()
  }, [show])

  const handleZoneLeave = useCallback(() => {
    isHoveringRef.current = false
    scheduleHide()
  }, [scheduleHide])

  const handleScrubStart = useCallback(() => {
    isDraggingRef.current = true
    show()
  }, [show])

  const handleScrubEnd = useCallback(() => {
    isDraggingRef.current = false
    scheduleHide()
  }, [scheduleHide])

  const forceHide = useCallback(() => {
    clearHideTimeout()
    isHoveringRef.current = false
    isDraggingRef.current = false
    setIsVisible(false)
  }, [clearHideTimeout])

  useEffect(() => {
    if (!isActive) {
      forceHide()
    }
  }, [forceHide, isActive])

  useEffect(() => {
    return () => {
      clearHideTimeout()
    }
  }, [clearHideTimeout])

  return {
    isVisible,
    scrubberWidth,
    showScrubber,
    scrubberStyle,
    zoneStyle,
    handleZoneEnter,
    handleZoneLeave,
    handleScrubStart,
    handleScrubEnd,
    forceHide,
  }
}
