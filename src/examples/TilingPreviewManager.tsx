import { useEffect, useMemo, useState, useRef } from 'react'
import type { TLShapeId } from 'tldraw'
import { useEditor, useValue } from 'tldraw'
import { getOrientationFromSize, type AnchorInfo, type TileSize, type TilingParams } from '../arena/tiling/types'
import { useTilingPreview } from '../arena/useTilingPreview'
import { commitTile } from '../arena/tiling/commit'
import { TilingPreviewOverlay } from '../arena/TilingPreviewOverlay'
import { getBlockingShapeIds } from '../arena/tiling/validateCandidate'

const DEFAULT_PARAMS: TilingParams = {
  grid: 16,
  gap: 16,
}

const DEFAULT_TILE: TileSize = { w: 240, h: 160 }

function getAnchorInfo(editor: ReturnType<typeof useEditor>, anchorId: TLShapeId): AnchorInfo | null {
  const shape = editor.getShape(anchorId)
  if (!shape) return null
  const bounds = editor.getShapePageBounds(shape)
  if (!bounds) return null
  const orientation = getOrientationFromSize(bounds.w, bounds.h)
  return {
    aabb: { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h },
    orientation,
  }
}

export function TilingPreviewManager() {
  const editor = useEditor()
  const selectedIds = useValue('selection', () => editor.getSelectedShapeIds(), [editor])
  const [metaKey, setMetaKey] = useState(false)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey) setMetaKey(true)
    }
    const handleKeyUp = () => {
      setMetaKey(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleKeyUp)
    }
  }, [])
  const anchorId = selectedIds.length === 1 ? (selectedIds[0] as TLShapeId) : null

  const anchor = useMemo(() => {
    if (!anchorId) return null
    return getAnchorInfo(editor, anchorId)
  }, [editor, anchorId])

  const tileSize = useMemo((): TileSize | null => {
    if (!anchor) return null
    if (anchor.orientation === 'row') {
      return { w: DEFAULT_TILE.w, h: anchor.aabb.h }
    }
    return { w: anchor.aabb.w, h: DEFAULT_TILE.h }
  }, [anchor])

  const preview = useTilingPreview({
    editor,
    isActive: !!anchor && !!tileSize && !!metaKey,
    anchor: anchor ?? null,
    tileSize: tileSize ?? null,
    params: DEFAULT_PARAMS,
    epsilon: 1,
    ignoreIds: anchorId ? [anchorId] : undefined,
  })

  const lastSnapshotRef = useRef<{
    metaKey: boolean
    anchorId: TLShapeId | null
    candidateKey: string | null
  }>({ metaKey: false, anchorId: null, candidateKey: null })

  useEffect(() => {
    const candidate = preview.candidate
    const candidateKey = candidate ? `${candidate.x}:${candidate.y}:${candidate.w}:${candidate.h}:${candidate.source}` : null
    const last = lastSnapshotRef.current
    const shouldLog = metaKey || candidateKey !== last.candidateKey || anchorId !== last.anchorId
    if (shouldLog) {
      const blockers = candidate
        ? getBlockingShapeIds({ editor, candidate, epsilon: 1, ignoreIds: anchorId ? [anchorId] : undefined })
        : []
      console.debug('tiling snapshot', {
        metaKey,
        selectedIds,
        anchorId,
        anchor,
        tileSize,
        candidate,
        blockers,
      })
      lastSnapshotRef.current = { metaKey, anchorId, candidateKey }
    }
  }, [metaKey, selectedIds, anchorId, anchor, tileSize, preview.candidate, editor])

  useEffect(() => {
    const candidate = preview.candidate
    if (!candidate) return
    const handle = (event: PointerEvent) => {
      if (event.button !== 0) return
      if (!event.metaKey) return
      event.preventDefault()
      event.stopPropagation()
      console.debug('tiling commit firing', { candidate })
      commitTile({
        editor,
        candidate,
        createShape: (id, { x, y, w, h }) => ({
          id,
          type: '3d-box',
          x,
          y,
          props: { w, h, channel: '' },
        }),
      })
    }
    window.addEventListener('pointerdown', handle, { capture: true })
    return () => {
      window.removeEventListener('pointerdown', handle, { capture: true })
    }
  }, [editor, preview.candidate])

  return <TilingPreviewOverlay candidate={preview.candidate} />
}

