import { useCallback, useMemo } from 'react'
import type { Card } from '../types'
import { useAspectRatioCache } from './useAspectRatioCache'

export interface UseCardSizingOptions {
  cardW: number
  cardH: number
  gridSize: number
  snapToGrid: (value: number) => number
}

export interface UseCardSizingResult {
  aspectByIdRef: React.RefObject<Map<number, number>> // Kept for backward compatibility
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
  // Use shared aspect ratio cache with blockId keys
  const { getAspectRatio, setAspectRatio, ensureAspectRatio, aspectVersion } = useAspectRatioCache()

  // Backward compatibility: provide aspectByIdRef that mirrors the shared cache
  const aspectByIdRef = useMemo(() => ({
    current: new Map<number, number>()
  }), [])

  // Sync the compatibility ref with shared cache
  useMemo(() => {
    aspectByIdRef.current.clear()
    // Note: We don't populate this ref since we're migrating away from it
  }, [aspectByIdRef])

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
    const blockId = String(card.id)

    // Check if already cached in shared cache
    if (getAspectRatio(blockId) !== null) return

    // Use shared cache ensureAspectRatio with metadata and image loading
    ensureAspectRatio(
      blockId,
      () => {
        // Get source URL for image loading
        if (card.type === 'image') return (card as any).url
        else if (card.type === 'media') return (card as any).thumbnailUrl
        else if (card.type === 'link') return (card as any).imageUrl
        return undefined
      },
      () => getAspectFromMetadata(card) // Metadata fallback
    )
  }, [getAspectRatio, ensureAspectRatio, getAspectFromMetadata])

  // Compute intrinsic-sized card container within square bounds for stack layout - with grid snapping
  const getCardSizeWithinSquare = useMemo(() =>
    (card: Card): { w: number; h: number } => {
      // Trigger async aspect discovery if needed
      ensureAspect(card)

      // Default square - already snapped to grid
      let w = cardW
      let h = cardH

      // Prefer cached or metadata-derived aspect
      let r: number | null = getAspectRatio(String(card.id)) ?? getAspectFromMetadata(card)
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
