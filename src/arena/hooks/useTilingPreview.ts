import { useEffect, useMemo, useState } from 'react'
import type { Editor, TLShapeId } from 'tldraw'
import { computePreviewCandidate } from '../tiling/preview'
import { getSnappedAnchorAabb } from '../tiling/generateCandidates'
import type { AnchorInfo, TileCandidate, TileSize, TilingParams, RectLike } from '../tiling/types'
import { rectEquals } from '../tiling/types'

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
  debug?: boolean
}

export interface TilingPreviewResult {
  candidate: TileCandidate | null
  anchorUsed: AnchorInfo | null
  snappedAnchorAabb: RectLike | null
  debugSamples?: Array<{
    source: string
    x: number
    y: number
    w: number
    h: number
    bounded: boolean
    rejectedByBounds: boolean
    rejectedAsDuplicate: boolean
    rejectedByBlockedList: boolean
    blockingIdsCount: number
    accepted: boolean
  }>
}

export function useTilingPreview({ editor, isActive, anchor, overrideAnchor, tileSize, params, epsilon, ignoreIds, pageBounds, debug = false }: UseTilingPreviewOptions): TilingPreviewResult {
  const [candidate, setCandidate] = useState<TileCandidate | null>(null)
  const [anchorUsed, setAnchorUsed] = useState<AnchorInfo | null>(null)
  const [debugSamples, setDebugSamples] = useState<TilingPreviewResult['debugSamples']>(undefined)

  const resolvedIgnore = useMemo(() => ignoreIds ?? editor.getSelectedShapeIds(), [editor, ignoreIds])
  const effectiveAnchor = overrideAnchor ?? anchor
  const snappedAnchorAabb = useMemo(() => {
    if (!effectiveAnchor) return null
    return getSnappedAnchorAabb(effectiveAnchor, params.grid)
  }, [effectiveAnchor, params.grid])

  useEffect(() => {
    if (!isActive || !effectiveAnchor || !tileSize) {
      setCandidate((prev) => (prev === null ? prev : null))
      setAnchorUsed(null)
      setDebugSamples(undefined)
      return
    }
    const blocked: RectLike[] = []
    blocked.push(effectiveAnchor.aabb)
    if (snappedAnchorAabb && !rectEquals(snappedAnchorAabb, effectiveAnchor.aabb)) {
      blocked.push(snappedAnchorAabb)
    }
    const next = computePreviewCandidate({ editor, anchor: effectiveAnchor, tileSize, params, epsilon, ignoreIds: resolvedIgnore, pageBounds, blockedAabbs: blocked.length ? blocked : undefined, debug }) as any
    const nextCandidate: TileCandidate | null = debug ? (next?.candidate ?? null) : (next as TileCandidate | null)
    const nextSamples = debug ? (next?.samples ?? undefined) : undefined
    setCandidate((prev) => {
      if (prev === null && next === null) return prev
      if (prev && nextCandidate) {
        if (
          prev.x === nextCandidate.x &&
          prev.y === nextCandidate.y &&
          prev.w === nextCandidate.w &&
          prev.h === nextCandidate.h &&
          prev.source === nextCandidate.source
        ) {
          return prev
        }
      }
      return nextCandidate
    })
    setAnchorUsed(effectiveAnchor)
    setDebugSamples(nextSamples)
  }, [editor, isActive, effectiveAnchor, tileSize, params, epsilon, resolvedIgnore, pageBounds, debug, snappedAnchorAabb])

  return { candidate, anchorUsed, snappedAnchorAabb, debugSamples }
}

