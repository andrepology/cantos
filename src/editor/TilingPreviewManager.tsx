import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import type { TLShapeId } from 'tldraw'
import { useEditor, useValue } from 'tldraw'
import { getOrientationFromSize, type AnchorInfo, type TileSize, type TilingParams, type RectLike } from '../arena/tiling/types'
import { useTilingPreview } from '../arena/hooks/useTilingPreview'
import { commitTile } from '../arena/tiling/commit'
import { TilingPreviewOverlay } from '../arena/TilingPreviewOverlay'
import { TilingDebugControls } from '../arena/TilingDebugControls'
import { getBlockingShapeIds } from '../arena/tiling/validateCandidate'
import { getSnappedAnchorAabb } from '../arena/tiling/generateCandidates'
import { TILING_CONSTANTS } from '../arena/layout'
import { useAspectRatioCache } from '../arena/hooks/useAspectRatioCache'
import { useSlides, SLIDE_SIZE, SLIDE_MARGIN } from './SlidesManager'

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
    const candidate = preview.candidate
    if (!candidate) return
    event.preventDefault()
    event.stopPropagation()
    // Inspect the DOM target to extract card/channel/user context
    const target = event.target as HTMLElement | null
    let spawnKind: 'channel' | 'user' | 'block' | null = null
    let channelSlug: string | null = null
    let userInfo: { id?: number; username?: string; full_name?: string; avatar?: string } | null = null
    let blockInfo: { kind: 'image' | 'text' | 'link' | 'media'; title?: string; imageUrl?: string; url?: string; embedHtml?: string; blockId?: string } | null = null

    // If clicking a channel card inside a deck layout or user channels index
    const cardEl = target?.closest?.('[data-interactive="card"], [data-interactive="button"]') as HTMLElement | null
    if (cardEl) {
      const type = cardEl.getAttribute('data-card-type')
      if (type === 'channel') {
        spawnKind = 'channel'
        channelSlug = cardEl.getAttribute('data-channel-slug') || ''
      } else if (type === 'image' || type === 'text' || type === 'link' || type === 'media') {
        spawnKind = 'block'
        const title = cardEl.getAttribute('data-card-title') || ''
        const blockId = cardEl.getAttribute('data-card-id') || undefined
        if (type === 'image') {
          blockInfo = { kind: 'image', title, imageUrl: cardEl.getAttribute('data-image-url') || undefined, url: cardEl.getAttribute('data-url') || undefined, blockId }
        } else if (type === 'text') {
          blockInfo = { kind: 'text', title: cardEl.getAttribute('data-content') || '', blockId }
        } else if (type === 'link') {
          blockInfo = { kind: 'link', title, imageUrl: cardEl.getAttribute('data-image-url') || undefined, url: cardEl.getAttribute('data-url') || undefined, blockId }
        } else if (type === 'media') {
          blockInfo = { kind: 'media', title, imageUrl: cardEl.getAttribute('data-thumbnail-url') || undefined, url: cardEl.getAttribute('data-original-url') || undefined, embedHtml: cardEl.getAttribute('data-embed-html') || undefined, blockId }
        }
      }
    }

    // If clicking an author row inside ConnectionsPanel
    if (!spawnKind) {
      const authorEl = target?.closest?.('[data-author-row]') as HTMLElement | null
      if (authorEl) {
        spawnKind = 'user'
        userInfo = {
          id: Number(authorEl.getAttribute('data-user-id') || '') || undefined,
          username: authorEl.getAttribute('data-user-username') || undefined,
          full_name: authorEl.getAttribute('data-user-fullname') || undefined,
          avatar: authorEl.getAttribute('data-user-avatar') || undefined,
        }
      }
    }

    // Debug logging
    try {
      const path = (event.composedPath?.() || []) as any[]
      // eslint-disable-next-line no-console
      // pointerdown meta - no logging
    } catch {}

    // Default: do nothing if we didn't click a recognized item
    if (!spawnKind) return
    commitTile({
      editor,
      candidate,
      params: { gap: DEFAULT_PARAMS.gap, pageGap: DEFAULT_PARAMS.gap },
      epsilon: 1,
      ignoreIds,
      pageBounds,
      createShape: (id, { x, y, w, h }) => {
        const grid = DEFAULT_PARAMS.grid
        const maxW = 184
        const maxH = 168
        const availableW = Math.min(w, maxW)
        const availableH = Math.min(h, maxH)
        
        if (spawnKind === 'channel') {
          const newW = snapToGrid(availableW, grid)
          const newH = snapToGrid(availableH, grid)
          return { id, type: '3d-box', x, y, props: { w: newW, h: newH, channel: channelSlug || '' } } as any
        }
        if (spawnKind === 'user') {
          const newW = snapToGrid(availableW, grid)
          const newH = snapToGrid(availableH, grid)
          return { id, type: '3d-box', x, y, props: { w: newW, h: newH, userId: userInfo?.id, userName: userInfo?.username || userInfo?.full_name || '', userAvatar: userInfo?.avatar } } as any
        }
        // spawnKind === 'block'
        const blockId = blockInfo?.blockId || String(Date.now())
        // Try to read a cached aspect ratio for this block id
        let cachedRatio = blockId ? getAspectRatio(blockId) : null
        // Try to extract an immediate ratio from the rendered img in the card
        if (!cachedRatio && cardEl) {
          try {
            const imgEl = cardEl.querySelector('img') as HTMLImageElement | null
            if (imgEl && imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
              cachedRatio = imgEl.naturalWidth / imgEl.naturalHeight
              if (Number.isFinite(cachedRatio) && cachedRatio > 0 && blockId) {
                setAspectRatio(blockId, cachedRatio)
              }
            }
          } catch {}
        }
        // Kick off ensure if not cached (non-blocking)
        try {
          if (!cachedRatio && blockId) {
            const srcGetter = () => {
              if (blockInfo?.kind === 'image') return blockInfo?.imageUrl || blockInfo?.url
              if (blockInfo?.kind === 'media') return blockInfo?.imageUrl || blockInfo?.url
              if (blockInfo?.kind === 'link') return blockInfo?.imageUrl
              return undefined
            }
            ensureAspectRatio(blockId, srcGetter)
          }
        } catch {}
        // Adjust initial w/h to respect ratio if available now
        let newW = availableW
        let newH = availableH
        if (cachedRatio && Number.isFinite(cachedRatio) && cachedRatio > 0) {
          // Calculate what the dimensions would be if we used the full width
          const widthBasedH = availableW / cachedRatio
          // Calculate what the dimensions would be if we used the full height  
          const heightBasedW = availableH * cachedRatio
          
          // Choose the approach that fits within both constraints
          if (widthBasedH <= availableH) {
            // Width-based calculation fits, use full width
            newW = snapToGrid(availableW, grid)
            newH = snapToGrid(Math.max(1, Math.round(widthBasedH)), grid)
          } else {
            // Height-based calculation fits, use full height
            newW = snapToGrid(Math.max(1, Math.round(heightBasedW)), grid)
            newH = snapToGrid(availableH, grid)
          }
        } else {
          // No aspect ratio, just apply max constraints
          newW = snapToGrid(availableW, grid)
          newH = snapToGrid(availableH, grid)
        }
        const p: any = { w: newW, h: newH, blockId, kind: blockInfo?.kind, title: blockInfo?.title }
        if (blockInfo?.kind === 'image') { p.imageUrl = blockInfo.imageUrl; p.url = blockInfo.url }
        if (blockInfo?.kind === 'text') { /* title already holds content */ }
        if (blockInfo?.kind === 'link') { p.imageUrl = blockInfo.imageUrl; p.url = blockInfo.url }
        if (blockInfo?.kind === 'media') { p.imageUrl = blockInfo.imageUrl; p.url = blockInfo.url; p.embedHtml = blockInfo.embedHtml }
        if (cachedRatio && Number.isFinite(cachedRatio) && cachedRatio > 0) { p.aspectRatio = cachedRatio }
        return { id, type: 'arena-block', x, y, props: p } as any
      },
    })
  }, [editor, metaKey, preview.candidate, ignoreIds, pageBounds])

  useEffect(() => {
    window.addEventListener('pointerdown', handlePointerDown, { capture: true })
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true })
    }
  }, [handlePointerDown])

  return (
    <>
      <TilingPreviewOverlay
        candidate={preview.candidate}
        debugSamples={preview.debugSamples}
        anchorAabb={preview.anchorUsed?.aabb ?? null}
        snappedAnchorAabb={preview.snappedAnchorAabb}
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

