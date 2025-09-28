import { useEffect, useMemo, useState } from 'react'
import type { Editor, TLShapeId } from 'tldraw'
import { computePreviewCandidate } from './tiling/preview'
import type { AnchorInfo, TileCandidate, TileSize, TilingParams } from './tiling/types'

export interface UseTilingPreviewOptions {
  editor: Editor
  isActive: boolean
  anchor: AnchorInfo | null
  tileSize: TileSize | null
  params: TilingParams
  epsilon: number
  ignoreIds?: TLShapeId[]
}

export interface TilingPreviewResult {
  candidate: TileCandidate | null
}

export function useTilingPreview({ editor, isActive, anchor, tileSize, params, epsilon, ignoreIds }: UseTilingPreviewOptions): TilingPreviewResult {
  const [candidate, setCandidate] = useState<TileCandidate | null>(null)

  const resolvedIgnore = useMemo(() => ignoreIds ?? editor.getSelectedShapeIds(), [editor, ignoreIds])

  useEffect(() => {
    if (!isActive || !anchor || !tileSize) {
      setCandidate((prev) => (prev === null ? prev : null))
      return
    }
    const next = computePreviewCandidate({ editor, anchor, tileSize, params, epsilon, ignoreIds: resolvedIgnore })
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
  }, [editor, isActive, anchor, tileSize, params, epsilon, resolvedIgnore])

  return { candidate }
}

