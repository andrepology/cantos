import { useCallback, useRef, useState, useMemo } from 'react'
import type { Card } from '../types'

export interface UseCardSizingOptions {
  cardW: number
  cardH: number
  gridSize: number
  snapToGrid: (value: number) => number
}

export interface UseCardSizingResult {
  aspectByIdRef: React.RefObject<Map<number, number>>
  aspectVersion: number
  getAspectFromMetadata: (card: Card) => number | null
  ensureAspect: (card: Card) => void
  getCardSizeWithinSquare: (card: Card) => { w: number; h: number }
}

export function useCardSizing({
  cardW,
  cardH,
  gridSize,
  snapToGrid
}: UseCardSizingOptions): UseCardSizingResult {
  // Aspect cache to mirror row/column's intrinsic sizing robustness
  const aspectByIdRef = useRef<Map<number, number>>(new Map())
  const [aspectVersion, setAspectVersion] = useState(0)

  const getAspectFromMetadata = useCallback((card: Card): number | null => {
    if (card.type === 'image') {
      const dims = (card as any).originalDimensions
      if (dims?.width && dims?.height && dims.width > 0 && dims.height > 0) return dims.width / dims.height
    }
    if (card.type === 'media') {
      const html = (card as any).embedHtml as string
      if (html) {
        try {
          const mw = html.match(/\bwidth\s*=\s*"?(\d+)/i)
          const mh = html.match(/\bheight\s*=\s*"?(\d+)/i)
          const ow = mw ? parseFloat(mw[1]) : NaN
          const oh = mh ? parseFloat(mh[1]) : NaN
          if (Number.isFinite(ow) && Number.isFinite(oh) && ow > 0 && oh > 0) return ow / oh
        } catch {}
      }
    }
    return null
  }, [])

  const ensureAspect = useCallback((card: Card) => {
    const map = aspectByIdRef.current
    if (map.has(card.id)) return
    const meta = getAspectFromMetadata(card)
    if (meta && Number.isFinite(meta)) {
      map.set(card.id, meta)
      return
    }
    // Load an image to infer; try best available url
    let src: string | undefined
    if (card.type === 'image') src = (card as any).url
    else if (card.type === 'media') src = (card as any).thumbnailUrl
    else if (card.type === 'link') src = (card as any).imageUrl
    if (!src) return
    try {
      const img = new Image()
      img.decoding = 'async' as any
      img.loading = 'eager' as any
      img.onload = () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          const r = img.naturalWidth / img.naturalHeight
          map.set(card.id, r)
          setAspectVersion((v) => v + 1)
        }
      }
      img.src = src
    } catch {}
  }, [getAspectFromMetadata])

  // Compute intrinsic-sized card container within square bounds for stack layout - with grid snapping
  const getCardSizeWithinSquare = useMemo(() =>
    (card: Card): { w: number; h: number } => {
      // Trigger async aspect discovery if needed
      ensureAspect(card)

      // Default square - already snapped to grid
      let w = cardW
      let h = cardH

      // Prefer cached or metadata-derived aspect
      let r: number | null = aspectByIdRef.current.get(card.id) ?? getAspectFromMetadata(card)
      if (!r && card.type === 'media') {
        // Fallback to 16:9 for media
        r = 16 / 9
      }

      if (r && Number.isFinite(r) && r > 0) {
        if (r >= 1) {
          w = cardW
          h = Math.min(cardH, snapToGrid(Math.round(cardW / Math.max(0.0001, r))))
        } else {
          h = cardH
          w = Math.min(cardW, snapToGrid(Math.round(cardH * r)))
        }
      }
      return { w: snapToGrid(w), h: snapToGrid(h) }
    },
    [cardW, cardH, ensureAspect, getAspectFromMetadata, aspectVersion, gridSize, snapToGrid]
  )

  return {
    aspectByIdRef,
    aspectVersion,
    getAspectFromMetadata,
    ensureAspect,
    getCardSizeWithinSquare,
  }
}
