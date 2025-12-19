import { useEffect } from 'react'
import { isInteractiveTarget } from '../../arena/dom'

type UseStackArrowKeysOptions = {
  enabled: boolean
  isSelected: boolean
  shapeId?: string
  getIndex: () => number
  goToIndex: (next: number) => void
}

export function useStackArrowKeys({
  enabled,
  isSelected,
  shapeId,
  getIndex,
  goToIndex,
}: UseStackArrowKeysOptions) {
  useEffect(() => {
    if (!enabled || !isSelected || !shapeId) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInteractiveTarget(e.target)) return

      let delta = 0
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        delta = -1
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        delta = 1
      }

      if (delta === 0) return
      e.preventDefault()
      e.stopPropagation()
      goToIndex(getIndex() + delta)
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [enabled, getIndex, goToIndex, isSelected, shapeId])
}
