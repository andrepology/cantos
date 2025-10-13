import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import type { TLShapeId } from 'tldraw'
import { useEditor, useValue } from 'tldraw'
import { getOrientationFromSize, type AnchorInfo, type TileSize, type TilingParams, type RectLike } from '../arena/tiling/types'
import { useTilingPreview } from '../arena/hooks/useTilingPreview'
import { commitTile } from '../arena/tiling/commit'
import { TilingDebugControls } from '../arena/TilingDebugControls'
import { getBlockingShapeIds } from '../arena/tiling/validateCandidate'
import { getSnappedAnchorAabb } from '../arena/tiling/generateCandidates'
import { TILING_CONSTANTS } from '../arena/layout'
import { useAspectRatioCache } from '../arena/hooks/useAspectRatioCache'
import { useSlides, SLIDE_SIZE, SLIDE_MARGIN } from './SlidesManager'
import { getSpawnIntentFromEventTarget } from '../arena/tiling/previewIntent'
import { computeSpawnedShapeProps } from '../arena/tiling/shapeSizing'
import type { SpawnIntent } from '../arena/tiling/previewIntent'
import type { ComputedShapeProps } from '../arena/tiling/shapeSizing'
import { PreviewTileOverlay } from './PreviewTileOverlay'

const DEFAULT_PARAMS: TilingParams = {
  grid: TILING_CONSTANTS.grid,
  gap: TILING_CONSTANTS.gap,
  pageGap: TILING_CONSTANTS.pageGap,
  minWidth: TILING_CONSTANTS.minWidth,
  minHeight: TILING_CONSTANTS.minHeight,
}


function snapToGrid(value: number, grid: number) {
  if (grid <= 0) return value
  return Math.max(grid, Math.ceil(value / grid) * grid)
}

const DEBUG_TILING = false

export function TilingPreviewManager() {
  const editor = useEditor()
  const slides = useSlides()
  const selectedIds = useValue('selection', () => editor.getSelectedShapeIds(), [editor])
  const hoveredId = useValue('hovered', () => editor.getHoveredShapeId(), [editor])
  const [metaKey, setMetaKey] = useState(false)
  const [showSpiralPath, setShowSpiralPath] = useState(false)
  const [showGridLines, setShowGridLines] = useState(false)
  const [showCollisionBoxes, setShowCollisionBoxes] = useState(false)
  const [pointerTarget, setPointerTarget] = useState<HTMLElement | null>(null)
  const { getAspectRatio, ensureAspectRatio, setAspectRatio } = useAspectRatioCache() as any

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

  // Track pointer target for intent detection
  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!metaKey) {
        if (pointerTarget) setPointerTarget(null)
        return
      }
      const target = event.target as HTMLElement | null
      setPointerTarget(target)
    }
    window.addEventListener('pointermove', handlePointerMove, { passive: true, capture: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove, { capture: true })
    }
  }, [metaKey, pointerTarget])
  const anchorId = selectedIds.length === 1 ? (selectedIds[0] as TLShapeId) : null
  const referenceId = metaKey && hoveredId ? (hoveredId as TLShapeId) : anchorId

  const anchor = useValue('anchor-bounds', () => {
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
  }, [anchorId, editor])

  const overrideAnchor = useValue('override-anchor-bounds', () => {
    if (!referenceId || referenceId === anchorId) return null
    const shape = editor.getShape(referenceId)
    if (!shape) return null
    const bounds = editor.getShapePageBounds(shape)
    if (!bounds) return null
    const orientation = getOrientationFromSize(bounds.width, bounds.height)
    return {
      aabb: { x: bounds.minX, y: bounds.minY, w: bounds.width, h: bounds.height },
      orientation,
    }
  }, [referenceId, anchorId, editor])

  const tileSize = useMemo((): TileSize | null => {
    const base = overrideAnchor ?? anchor
    if (!base) return null
    const grid = DEFAULT_PARAMS.grid
    // Use anchor dimensions exactly for both orientations
    return {
      w: snapToGrid(base.aabb.w, grid),
      h: snapToGrid(base.aabb.h, grid),
    }
  }, [anchor, overrideAnchor])

  const currentSlide = useValue('currentSlide', () => slides.getCurrentSlide(), [slides])

  const pageBounds = useMemo((): RectLike | null => {
    if (currentSlide) {
      const y = currentSlide.index * (SLIDE_SIZE.h + SLIDE_MARGIN)
      return { x: 0, y, w: SLIDE_SIZE.w, h: SLIDE_SIZE.h }
    }
    const bounds = editor.getCurrentPageBounds()
    if (!bounds) return null
    return { x: bounds.minX, y: bounds.minY, w: bounds.width, h: bounds.height }
  }, [editor, currentSlide])

  const ignoreIds = useMemo(() => {
    // Only ignore the anchor actually used for candidate generation.
    // This prevents ignoring the newly created shape on the next preview.
    if (referenceId) return [referenceId as TLShapeId]
    if (anchorId) return [anchorId as TLShapeId]
    return []
  }, [referenceId, anchorId])

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
    debug: DEBUG_TILING,
    showSpiralPath,
    showGridLines,
    showCollisionBoxes,
  })

  // Compute spawn intent from pointer target
  const intent = useMemo<SpawnIntent | null>(() => {
    if (!metaKey || !pointerTarget) return null
    return getSpawnIntentFromEventTarget(pointerTarget)
  }, [metaKey, pointerTarget])

  // Compute final shape props for preview and commit (ensures parity)
  const previewProps = useMemo<ComputedShapeProps | null>(() => {
    if (!preview.candidate || !intent) return null
    
    // Kick off async aspect ratio ensure for blocks (non-blocking)
    if (intent.type === 'arena-block' && intent.metadata.blockId) {
      const blockId = intent.metadata.blockId
      try {
        ensureAspectRatio(
          blockId,
          () => {
            if (intent.kind === 'image') return intent.metadata.imageUrl || intent.metadata.url
            if (intent.kind === 'media') return intent.metadata.imageUrl || intent.metadata.url
            if (intent.kind === 'link') return intent.metadata.imageUrl
            if (intent.kind === 'pdf') return intent.metadata.imageUrl
            return undefined
          },
          () => {
            if (intent.kind === 'media') return 16 / 9
            return null
          }
        )
      } catch {}
    }

    return computeSpawnedShapeProps({
      candidate: preview.candidate,
      intent,
      grid: DEFAULT_PARAMS.grid,
      maxW: 184,
      maxH: 168,
      getAspectRatio,
      setAspectRatio,
      cardEl: intent.cardEl
    })
  }, [preview.candidate, intent, getAspectRatio, setAspectRatio, ensureAspectRatio])

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
      const blockers = candidate ? getBlockingShapeIds({ editor, candidate, epsilon: 1, ignoreIds }) : []
      const samples = preview.debugSamples ?? []
      const accepted = samples.find((s) => s.accepted)
      const counts = {
        total: samples.length,
        accepted: samples.filter((s) => s.accepted).length,
        bySource: samples.reduce<Record<string, number>>((acc, s) => {
          acc[s.source] = (acc[s.source] ?? 0) + 1
          return acc
        }, {}),
        rejections: {
          bounds: samples.filter((s) => s.rejectedByBounds).length,
          duplicate: samples.filter((s) => s.rejectedAsDuplicate).length,
          blockedList: samples.filter((s) => s.rejectedByBlockedList).length,
        },
      }
      // tiling snapshot - no logging
      lastSnapshotRef.current = { metaKey, anchorId, referenceId, candidateKey }
    }
  }, [metaKey, selectedIds, anchorId, referenceId, anchor, overrideAnchor, tileSize, preview.candidate, editor, ignoreIds])

  const handlePointerDown = useCallback((event: PointerEvent) => {
    if (event.button !== 0) return
    if (!metaKey) return
    if (!preview.candidate || !previewProps) return
    
    event.preventDefault()
    event.stopPropagation()
    
    // Use precomputed props for commit (ensures parity with preview)
    commitTile({
      editor,
      candidate: preview.candidate,
      params: { gap: DEFAULT_PARAMS.gap, pageGap: DEFAULT_PARAMS.pageGap },
      epsilon: 1,
      ignoreIds,
      pageBounds,
      createShape: (id) => ({
        id,
        type: previewProps.type,
        x: previewProps.x,
        y: previewProps.y,
        props: previewProps.props
      } as any),
    })
  }, [editor, metaKey, preview.candidate, previewProps, ignoreIds, pageBounds])

  useEffect(() => {
    window.addEventListener('pointerdown', handlePointerDown, { capture: true })
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true })
    }
  }, [handlePointerDown])

  return (
    <>
      <PreviewTileOverlay
        computedProps={previewProps}
        opacity={0.65}
      />
      {DEBUG_TILING && (
        <TilingDebugControls
          showSpiralPath={showSpiralPath}
          showGridLines={showGridLines}
          showCollisionBoxes={showCollisionBoxes}
          showDebugSamples={DEBUG_TILING}
          onToggleSpiralPath={() => setShowSpiralPath(!showSpiralPath)}
          onToggleGridLines={() => setShowGridLines(!showGridLines)}
          onToggleCollisionBoxes={() => setShowCollisionBoxes(!showCollisionBoxes)}
          onToggleDebugSamples={() => {}} // Keep debug samples always on when DEBUG_TILING is true
        />
      )}
    </>
  )
}

