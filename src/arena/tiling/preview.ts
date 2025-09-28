import type { Editor, TLShapeId } from 'tldraw'
import { generateTileCandidates } from './generateCandidates'
import { findFirstFreeCandidate } from './validateCandidate'
import type { AnchorInfo, TileCandidate, TileSize, TilingParams } from './types'

export interface PreviewState {
  anchorId: TLShapeId | null
  anchor: AnchorInfo | null
  tileSize: TileSize | null
  candidate: TileCandidate | null
}

export interface PreviewParams {
  editor: Editor
  anchor: AnchorInfo
  tileSize: TileSize
  params: TilingParams
  epsilon: number
  ignoreIds?: TLShapeId[]
}

export function computePreviewCandidate({ editor, anchor, tileSize, params, epsilon, ignoreIds }: PreviewParams): TileCandidate | null {
  const generator = generateTileCandidates({ anchor, tileSize, params })
  return findFirstFreeCandidate({ editor, candidates: generator, epsilon, ignoreIds })
}

