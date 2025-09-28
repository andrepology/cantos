import type { Editor, TLShapeId } from 'tldraw'
import { createShapeId } from 'tldraw'
import { type TileCandidate, type RectLike, type TilingParams } from './types'

export interface CommitTileParams {
  editor: Editor
  candidate: TileCandidate
  params?: Pick<TilingParams, 'gap' | 'pageGap'>
  createShape: (id: TLShapeId, candidate: TileCandidate) => { id: TLShapeId; type: string; x: number; y: number; props: any }
}

function insetRect(bounds: RectLike | null | undefined, inset: number): RectLike | null {
  if (!bounds) return null
  if (inset <= 0) return bounds
  const w = bounds.w - inset * 2
  const h = bounds.h - inset * 2
  if (w <= 0 || h <= 0) return null
  return { x: bounds.x + inset, y: bounds.y + inset, w, h }
}

function clampToInset(c: TileCandidate, inset: RectLike | null): TileCandidate {
  if (!inset) return c
  const minX = inset.x
  const minY = inset.y
  const maxX = inset.x + inset.w - c.w
  const maxY = inset.y + inset.h - c.h
  return { ...c, x: Math.max(minX, Math.min(c.x, maxX)), y: Math.max(minY, Math.min(c.y, maxY)) }
}

export function commitTile({ editor, candidate, createShape, params }: CommitTileParams) {
  const page = editor.getCurrentPageBounds()
  const pageBounds: RectLike | null = page ? { x: page.minX, y: page.minY, w: page.width, h: page.height } : null
  const inset = insetRect(pageBounds, (params?.pageGap ?? params?.gap) ?? 0)
  const safeCandidate = clampToInset(candidate, inset)
  const id = createShapeId()
  const shape = createShape(id, safeCandidate)
  editor.createShapes([shape as any])
  editor.setSelectedShapes([id])
}

