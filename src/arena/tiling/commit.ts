import type { Editor, TLShapeId } from 'tldraw'
import { createShapeId } from 'tldraw'
import { clampCandidateToInset, insetRect, isInsideInset } from './bounds'
import { isCandidateFree } from './validateCandidate'
import { type TileCandidate, type RectLike, type TilingParams } from './types'

export interface CommitTileParams {
  editor: Editor
  candidate: TileCandidate
  params?: Pick<TilingParams, 'gap' | 'pageGap'>
  epsilon?: number
  ignoreIds?: TLShapeId[]
  pageBounds?: RectLike | null
  createShape: (id: TLShapeId, candidate: TileCandidate) => { id: TLShapeId; type: string; x: number; y: number; props: any }
}

export function commitTile({ editor, candidate, createShape, params, epsilon = 1, ignoreIds, pageBounds }: CommitTileParams) {
  const page = pageBounds
    ? pageBounds
    : (() => {
        const bounds = editor.getCurrentPageBounds()
        return bounds ? { x: bounds.minX, y: bounds.minY, w: bounds.width, h: bounds.height } : null
      })()

  const inset = insetRect(page, (params?.pageGap ?? params?.gap) ?? 0)
  if (!isInsideInset(candidate, inset)) {
    const reclamped = clampCandidateToInset(candidate, inset)
    if (!reclamped || !isInsideInset(reclamped, inset)) {
      console.warn('[tiling] commit aborted: candidate outside page inset', { candidate, inset })
      return
    }
    console.warn('[tiling] commit candidate adjusted to inset; consider recomputing preview sooner', { before: candidate, after: reclamped })
    candidate = reclamped
  }

  if (!isCandidateFree({ editor, candidate, epsilon, ignoreIds })) {
    console.warn('[tiling] commit aborted: candidate no longer collision-free', { candidate })
    return
  }

  const id = createShapeId()
  const shape = createShape(id, candidate)
  editor.createShapes([shape as any])
  editor.setSelectedShapes([id])
}

