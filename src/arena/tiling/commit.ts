import type { Editor, TLShapeId } from 'tldraw'
import { createShapeId } from 'tldraw'
import { type TileCandidate } from './types'

export interface CommitTileParams {
  editor: Editor
  candidate: TileCandidate
  createShape: (id: TLShapeId, candidate: TileCandidate) => { id: TLShapeId; type: string; x: number; y: number; props: any }
}

export function commitTile({ editor, candidate, createShape }: CommitTileParams) {
  const id = createShapeId()
  const shape = createShape(id, candidate)
  editor.createShapes([shape as any])
  editor.setSelectedShapes([id])
}

