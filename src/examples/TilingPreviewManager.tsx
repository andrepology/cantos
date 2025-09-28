import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import type { TLShapeId } from 'tldraw'
import { useEditor, useValue } from 'tldraw'
import { getOrientationFromSize, type AnchorInfo, type TileSize, type TilingParams, type RectLike } from '../arena/tiling/types'
import { useTilingPreview } from '../arena/useTilingPreview'
import { commitTile } from '../arena/tiling/commit'
import { TilingPreviewOverlay } from '../arena/TilingPreviewOverlay'
import { getBlockingShapeIds } from '../arena/tiling/validateCandidate'

const DEFAULT_PARAMS: TilingParams = {
  grid: 16,
  gap: 16,
}

const DEFAULT_TILE: TileSize = { w: 240, h: 160 }

function getAnchorInfo(editor: ReturnType<typeof useEditor>, anchorId: TLShapeId | null): AnchorInfo | null {
  if (!anchorId) return null
  const shape = editor.getShape(anchorId)
  if (!shape) return null
  const bounds = editor.getShapePageBounds(shape)
  if (!bounds) return null
  const orientation = getOrientationFromSize(bounds.width, bounds.height)
  return {
    aabb: { x: bounds.minX, y: bounds.minY, w: bounds.width, h: bounds.height },
    orientation,
  }
}

export function TilingPreviewManager() {
  const editor = useEditor()
  const selectedIds = useValue('selection', () => editor.getSelectedShapeIds(), [editor])
  const hoveredId = useValue('hovered', () => editor.getHoveredShapeId(), [editor])
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
  const referenceId = metaKey && hoveredId ? (hoveredId as TLShapeId) : anchorId

  const anchor = useMemo(() => getAnchorInfo(editor, anchorId), [editor, anchorId])

  const overrideAnchor = useMemo(() => {
    if (!referenceId || referenceId === anchorId) return null
    return getAnchorInfo(editor, referenceId)
  }, [editor, referenceId, anchorId])

  const tileSize = useMemo((): TileSize | null => {
    const base = overrideAnchor ?? anchor
    if (!base) return null
    if (base.orientation === 'row') {
      return { w: DEFAULT_TILE.w, h: base.aabb.h }
    }
    return { w: base.aabb.w, h: DEFAULT_TILE.h }
  }, [anchor, overrideAnchor])

  const pageBounds = useMemo((): RectLike | null => {
    const bounds = editor.getCurrentPageBounds()
    if (!bounds) return null
    return { x: bounds.minX, y: bounds.minY, w: bounds.width, h: bounds.height }
  }, [editor])

  const ignoreIds = useMemo(() => {
    const ids = new Set<TLShapeId>()
    if (anchorId) ids.add(anchorId)
    if (referenceId) ids.add(referenceId)
    return Array.from(ids)
  }, [anchorId, referenceId])

  const preview = useTilingPreview({
    editor,
    isActive: !!(anchor || overrideAnchor) && !!tileSize && !!metaKey,
    anchor: anchor ?? null,
    overrideAnchor,
    tileSize: tileSize ?? null,
    params: DEFAULT_PARAMS,
    epsilon: 1,
    ignoreIds,
    pageBounds,
  })

  const lastSnapshotRef = useRef<{
    metaKey: boolean
    anchorId: TLShapeId | null
    referenceId: TLShapeId | null
    candidateKey: string | null
  }>({ metaKey: false, anchorId: null, referenceId: null, candidateKey: null })

  useEffect(() => {
    const candidate = preview.candidate
    const candidateKey = candidate ? `${candidate.x}:${candidate.y}:${candidate.w}:${candidate.h}:${candidate.source}` : null
    const last = lastSnapshotRef.current
    const shouldLog = metaKey || candidateKey !== last.candidateKey || anchorId !== last.anchorId || referenceId !== last.referenceId
    if (shouldLog) {
      const blockers = candidate
        ? getBlockingShapeIds({ editor, candidate, epsilon: 1, ignoreIds })
        : []
      console.debug('tiling snapshot', {
        metaKey,
        selectedIds,
        anchorId,
        referenceId,
        anchor,
        overrideAnchor,
        tileSize,
        candidate,
        blockers,
      })
      lastSnapshotRef.current = { metaKey, anchorId, referenceId, candidateKey }
    }
  }, [metaKey, selectedIds, anchorId, referenceId, anchor, overrideAnchor, tileSize, preview.candidate, editor, ignoreIds])

  const handlePointerDown = useCallback((event: PointerEvent) => {
    if (event.button !== 0) return
    if (!metaKey) return
    const candidate = preview.candidate
    if (!candidate) return
    event.preventDefault()
    event.stopPropagation()
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
  }, [editor, metaKey, preview.candidate])

  useEffect(() => {
    window.addEventListener('pointerdown', handlePointerDown, { capture: true })
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true })
    }
  }, [handlePointerDown])

  return <TilingPreviewOverlay candidate={preview.candidate} />
}

