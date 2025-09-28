import { useEffect, useMemo, useState } from 'react'
import type { Editor, TLShapeId } from 'tldraw'
import { computePreviewCandidate } from './tiling/preview'
import type { AnchorInfo, TileCandidate, TileSize, TilingParams, RectLike } from './tiling/types'

export interface UseTilingPreviewOptions {
  editor: Editor
  isActive: boolean
  anchor: AnchorInfo | null
  overrideAnchor?: AnchorInfo | null
  tileSize: TileSize | null
  params: TilingParams
  epsilon: number
  ignoreIds?: TLShapeId[]
  pageBounds?: RectLike | null
}

export interface TilingPreviewResult {
  candidate: TileCandidate | null
  anchorUsed: AnchorInfo | null
}

export function useTilingPreview({ editor, isActive, anchor, overrideAnchor, tileSize, params, epsilon, ignoreIds, pageBounds }: UseTilingPreviewOptions): TilingPreviewResult {
  const [candidate, setCandidate] = useState<TileCandidate | null>(null)
  const [anchorUsed, setAnchorUsed] = useState<AnchorInfo | null>(null)

  const resolvedIgnore = useMemo(() => ignoreIds ?? editor.getSelectedShapeIds(), [editor, ignoreIds])
  const effectiveAnchor = overrideAnchor ?? anchor

  useEffect(() => {
    if (!isActive || !effectiveAnchor || !tileSize) {
      setCandidate((prev) => (prev === null ? prev : null))
      setAnchorUsed(null)
      return
    }
    const next = computePreviewCandidate({ editor, anchor: effectiveAnchor, tileSize, params, epsilon, ignoreIds: resolvedIgnore, pageBounds })
    setCandidate((prev) => {
      if (prev === null && next === null) return prev
      if (prev && next) {
        if (
          prev.x === next.x &&
          prev.y === next.y &&
          prev.w === next.w &&
          prev.h === next.h &&
          prev.source === next.source
        ) {
          return prev
        }
      }
      return next
    })
    setAnchorUsed(effectiveAnchor)
  }, [editor, isActive, effectiveAnchor, tileSize, params, epsilon, resolvedIgnore, pageBounds])

  return { candidate, anchorUsed }
}

