import { useEffect, useRef, useCallback } from 'react'
import type { LayoutMode } from '../layout'

// Ephemeral, in-memory scroll state. Avoids localStorage to play well with TLDraw.
type ScrollState = { rowX: number; colY: number; anchorId?: string; anchorFrac?: number; stackIndex?: number }
const deckScrollMemory = new Map<string, ScrollState>()

function computeDeckKey(cards: { id: number }[]): string {
  if (!cards || cards.length === 0) return 'empty'
  // Keep the key short but stable: use length + first/last 10 ids
  const head = cards.slice(0, 10).map((c) => String(c.id))
  const tail = cards.slice(-10).map((c) => String(c.id))
  return `${cards.length}:${head.join('|')}::${tail.join('|')}`
}

type Axis = 'row' | 'column'

export interface UseDeckScrollOptions {
  cards: { id: number }[]
  layoutMode: LayoutMode
  initialPersist?: { anchorId?: string; anchorFrac?: number; rowX?: number; colY?: number; stackIndex?: number }
  onPersist?: (state: { anchorId?: string; anchorFrac?: number; rowX: number; colY: number; stackIndex?: number }) => void
  currentIndex: number
  setCurrentIndex: (index: number) => void
}

export interface UseDeckScrollResult {
  deckKey: string
  saveAnchorFromContainer: (container: HTMLDivElement, axis: Axis) => void
  restoreUsingAnchor: (container: HTMLDivElement, axis: Axis, fallbackScroll: number) => void
  scheduleSaveAnchor: (container: HTMLDivElement, axis: Axis) => void
  setIndex: (nextIndex: number) => void
  // Refs for external use
  rowRef: React.RefObject<HTMLDivElement | null>
  colRef: React.RefObject<HTMLDivElement | null>
  anchorRafRef: React.RefObject<number | null>
  lastUserActivityAtRef: React.RefObject<number>
  resizeObserverRef: React.RefObject<ResizeObserver | null>
  resizeDebounceRef: React.RefObject<number | null>
}

export function useDeckScroll({
  cards,
  layoutMode,
  initialPersist,
  onPersist,
  currentIndex,
  setCurrentIndex
}: UseDeckScrollOptions): UseDeckScrollResult {
  const rowRef = useRef<HTMLDivElement>(null)
  const colRef = useRef<HTMLDivElement>(null)
  const deckKey = computeDeckKey(cards)

  // Throttle anchor computation to once per animation frame during scroll
  const anchorRafRef = useRef<number | null>(null)
  const lastUserActivityAtRef = useRef<number>(0)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const resizeDebounceRef = useRef<number | null>(null)

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
  const escapeAttrValue = (val: string) => val.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

  const saveAnchorFromContainer = useCallback(
    (container: HTMLDivElement, axis: Axis) => {
      const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-card-id]'))
      if (cards.length === 0) return
      const crect = container.getBoundingClientRect()
      const cStart = axis === 'row' ? crect.left : crect.top
      const cEnd = axis === 'row' ? crect.right : crect.bottom

      let chosen: HTMLElement | null = null
      let bestVisibleRatio = -1
      for (const el of cards) {
        const r = el.getBoundingClientRect()
        const start = axis === 'row' ? r.left : r.top
        const end = axis === 'row' ? r.right : r.bottom
        const size = axis === 'row' ? r.width : r.height
        const whollyVisible = start >= cStart && end <= cEnd && size > 0
        if (whollyVisible) {
          chosen = el
          break
        }
        // Fallback: pick the most visible one if none are wholly visible
        const visible = Math.max(0, Math.min(end, cEnd) - Math.max(start, cStart))
        const ratio = size > 0 ? visible / size : 0
        if (ratio > bestVisibleRatio) {
          bestVisibleRatio = ratio
          chosen = el
        }
      }
      if (!chosen) return
      const rr = chosen.getBoundingClientRect()
      const fraction = clamp(((axis === 'row' ? rr.left : rr.top) - cStart) / (axis === 'row' ? crect.width : crect.height), 0, 1)
      const anchorId = chosen.getAttribute('data-card-id') || undefined

      const prev = deckScrollMemory.get(deckKey) || { rowX: 0, colY: 0 }
      const next = { ...prev, anchorId, anchorFrac: fraction }
      deckScrollMemory.set(deckKey, next)
      if (onPersist) onPersist({ anchorId: next.anchorId, anchorFrac: next.anchorFrac, rowX: next.rowX, colY: next.colY, stackIndex: next.stackIndex })
    },
    [deckKey, onPersist]
  )

  const scheduleSaveAnchor = useCallback(
    (container: HTMLDivElement, axis: Axis) => {
      if (anchorRafRef.current != null) return
      anchorRafRef.current = requestAnimationFrame(() => {
        anchorRafRef.current = null
        saveAnchorFromContainer(container, axis)
      })
    },
    [saveAnchorFromContainer]
  )

  const restoreUsingAnchor = useCallback(
    (container: HTMLDivElement, axis: Axis, fallbackScroll: number) => {
      const state = deckScrollMemory.get(deckKey)
      if (!container) return
      const anchorId = state?.anchorId
      const anchorFrac = state?.anchorFrac
      if (anchorId && typeof anchorFrac === 'number') {
        const selector = `[data-card-id="${escapeAttrValue(String(anchorId))}"]`
        const anchorEl = container.querySelector(selector) as HTMLElement | null
        if (anchorEl) {
          // Use the saved fraction of the viewport to position the anchor consistently
          const target = axis === 'row'
            ? anchorEl.offsetLeft - anchorFrac * container.clientWidth
            : anchorEl.offsetTop - anchorFrac * container.clientHeight
          if (axis === 'row') container.scrollLeft = clamp(target, 0, Math.max(0, container.scrollWidth - container.clientWidth))
          else container.scrollTop = clamp(target, 0, Math.max(0, container.scrollHeight - container.clientHeight))
          return
        }
      }
      // Fallback to previous raw scroll if no anchor available
      if (axis === 'row') container.scrollLeft = fallbackScroll
      else container.scrollTop = fallbackScroll
    },
    [deckKey]
  )

  // Persist and restore current stack index across view changes
  const setIndex = useCallback(
    (nextIndex: number) => {
      setCurrentIndex(nextIndex)
      const nextCard = cards[nextIndex]
      const prev = deckScrollMemory.get(deckKey) || { rowX: 0, colY: 0 }
      // Also seed anchor so that switching to row/column centers roughly on the same card
      const next = {
        ...prev,
        stackIndex: nextIndex,
        anchorId: nextCard ? String(nextCard.id) : prev.anchorId,
        anchorFrac: 0.5,
      }
      deckScrollMemory.set(deckKey, next)
      if (onPersist) onPersist({ anchorId: next.anchorId, anchorFrac: next.anchorFrac, rowX: next.rowX, colY: next.colY, stackIndex: next.stackIndex })
    },
    [deckKey, cards, onPersist, setCurrentIndex]
  )

  // Seed memory from host-provided persisted state when first seen for this deck key
  useEffect(() => {
    if (!deckScrollMemory.has(deckKey) && initialPersist) {
      const prev = { rowX: 0, colY: 0 }
      deckScrollMemory.set(deckKey, { ...prev, ...initialPersist })
    }
  }, [deckKey, initialPersist])

  // Handle layout mode changes and anchor capture
  useEffect(() => {
    // Before switching modes, capture the current anchor and raw scroll so we can restore accurately.
    try {
      if (layoutMode === 'row' && rowRef.current) {
        const container = rowRef.current
        const x = container.scrollLeft
        const prev = deckScrollMemory.get(deckKey) || { rowX: 0, colY: 0 }
        deckScrollMemory.set(deckKey, { ...prev, rowX: x })
        // Inline anchor capture for row axis
        const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-card-id]'))
        if (cards.length > 0) {
          const crect = container.getBoundingClientRect()
          const cStart = crect.left
          const cEnd = crect.right
          let chosen: HTMLElement | null = null
          let bestVisibleRatio = -1
          for (const el of cards) {
            const r = el.getBoundingClientRect()
            const start = r.left
            const end = r.right
            const size = r.width
            const whollyVisible = start >= cStart && end <= cEnd && size > 0
            if (whollyVisible) {
              chosen = el
              break
            }
            const visible = Math.max(0, Math.min(end, cEnd) - Math.max(start, cStart))
            const ratio = size > 0 ? visible / size : 0
            if (ratio > bestVisibleRatio) {
              bestVisibleRatio = ratio
              chosen = el
            }
          }
          if (chosen) {
            const rr = chosen.getBoundingClientRect()
            const fraction = Math.max(0, Math.min(1, (rr.left - cStart) / Math.max(1, crect.width)))
            const anchorId = chosen.getAttribute('data-card-id') || undefined
            const prev2 = deckScrollMemory.get(deckKey) || { rowX: 0, colY: 0 }
            const nextState = { ...prev2, anchorId, anchorFrac: fraction }
            deckScrollMemory.set(deckKey, nextState)
            if (onPersist) onPersist({ anchorId: nextState.anchorId, anchorFrac: nextState.anchorFrac, rowX: nextState.rowX, colY: nextState.colY, stackIndex: nextState.stackIndex })
          }
        }
      } else if ((layoutMode === 'column' || layoutMode === 'grid') && colRef.current) {
        const container = colRef.current
        const y = container.scrollTop
        const prev = deckScrollMemory.get(deckKey) || { rowX: 0, colY: 0 }
        deckScrollMemory.set(deckKey, { ...prev, colY: y })
        // Inline anchor capture for column axis
        const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-card-id]'))
        if (cards.length > 0) {
          const crect = container.getBoundingClientRect()
          const cStart = crect.top
          const cEnd = crect.bottom
          let chosen: HTMLElement | null = null
          let bestVisibleRatio = -1
          for (const el of cards) {
            const r = el.getBoundingClientRect()
            const start = r.top
            const end = r.bottom
            const size = r.height
            const whollyVisible = start >= cStart && end <= cEnd && size > 0
            if (whollyVisible) {
              chosen = el
              break
            }
            const visible = Math.max(0, Math.min(end, cEnd) - Math.max(start, cStart))
            const ratio = size > 0 ? visible / size : 0
            if (ratio > bestVisibleRatio) {
              bestVisibleRatio = ratio
              chosen = el
            }
          }
          if (chosen) {
            const rr = chosen.getBoundingClientRect()
            const fraction = Math.max(0, Math.min(1, (rr.top - cStart) / Math.max(1, crect.height)))
            const anchorId = chosen.getAttribute('data-card-id') || undefined
            const prev2 = deckScrollMemory.get(deckKey) || { rowX: 0, colY: 0 }
            const nextState = { ...prev2, anchorId, anchorFrac: fraction }
            deckScrollMemory.set(deckKey, nextState)
            if (onPersist) onPersist({ anchorId: nextState.anchorId, anchorFrac: nextState.anchorFrac, rowX: nextState.rowX, colY: nextState.colY, stackIndex: nextState.stackIndex })
          }
        }
      } else if (layoutMode === 'stack' || layoutMode === 'mini') {
        const prev = deckScrollMemory.get(deckKey) || { rowX: 0, colY: 0 }
        const centerCard = cards[currentIndex]
        const nextState = {
          ...prev,
          stackIndex: currentIndex,
          anchorId: centerCard ? String(centerCard.id) : prev.anchorId,
          anchorFrac: 0.5,
        }
        deckScrollMemory.set(deckKey, nextState)
        if (onPersist) onPersist({ anchorId: nextState.anchorId, anchorFrac: nextState.anchorFrac, rowX: nextState.rowX, colY: nextState.colY, stackIndex: nextState.stackIndex })
      }
    } catch {}
  }, [layoutMode, rowRef, colRef, deckKey, currentIndex, cards, onPersist])

  return {
    deckKey,
    saveAnchorFromContainer,
    restoreUsingAnchor,
    scheduleSaveAnchor,
    setIndex,
    rowRef,
    colRef,
    anchorRafRef,
    lastUserActivityAtRef,
    resizeObserverRef,
    resizeDebounceRef,
  }
}
