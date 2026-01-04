import { useMemo, memo, useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { track, useEditor, type TLShapeId } from 'tldraw'
import { AnimatePresence } from 'motion/react'
import { MetadataPanel } from '../shapes/components/MetadataPanel'
import { HoverIndicator } from '../shapes/components/HoverIndicator'
import type { TactilePortalShape } from '../shapes/TactilePortalShape'
import type { ArenaBlockShape } from '../shapes/ArenaBlockShape'
import { useShapeFocusState, setFocusedShape } from '../shapes/focusState'
import { useChannelMetadata } from '../arena/hooks/useChannelMetadata'
import { useBlockMetadata } from '../arena/hooks/useBlockMetadata'

export const METADATA_PANEL_GAP_SCREEN = 16 // Gap between portal and panel (screen px)
export const METADATA_PANEL_WIDTH_SCREEN = 256 // Panel width (screen px)
export const METADATA_PANEL_MIN_HEIGHT_SCREEN = 320 // Minimum panel height (screen px)
export const METADATA_PANEL_HEADER_HEIGHT_SCREEN = 42 // Header height (screen px)
export const METADATA_PANEL_HEADER_GAP_SCREEN = 12// Gap between shape and header (screen px)

/**
 * Renders an interactive indicator for hovered/selected shapes that triggers focus mode.
 */
const CandidateIndicator = memo(track(function CandidateIndicator({ 
  shapeId 
}: { 
  shapeId: TLShapeId 
}) {
  const editor = useEditor()
  const shape = editor.getShape(shapeId)
  if (!shape) return null

  const isPortal = shape.type === 'tactile-portal'
  const isBlock = shape.type === 'arena-block'
  if (!isPortal && !isBlock) return null

  const slug = useMemo(() => {
    if (!isPortal) return undefined
    const source = (shape as TactilePortalShape).props.source
    return source?.kind === 'channel' ? source.slug : undefined
  }, [isPortal, shape])

  const blockId = isBlock ? Number((shape as ArenaBlockShape).props.blockId) : undefined

  const channelMetadata = useChannelMetadata(slug)
  const blockMetadata = useBlockMetadata(blockId)
  const connectionsCount = isPortal ? channelMetadata?.connections?.length ?? 0 : blockMetadata?.connections?.length ?? 0

  const pageBounds = editor.getShapePageBounds(shape)
  if (!pageBounds) return null

  const topRight = editor.pageToScreen({ x: pageBounds.maxX, y: pageBounds.minY })
  const zoom = editor.getZoomLevel()
  const visualOffset = 1 * zoom

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.15 }}
      style={{
        position: 'fixed',
        left: topRight.x + METADATA_PANEL_GAP_SCREEN + visualOffset,
        top: topRight.y + 28, // Lowered
        pointerEvents: 'none',
        zIndex: 1000,
        transformOrigin: 'center',
      }}
    >
      <HoverIndicator
        connectionsCount={connectionsCount}
        position={{ x: 0, y: 0 }} 
        interactive
        onClick={() => setFocusedShape(shapeId, editor.getCamera())}
      />
    </motion.div>
  )
}))

/**
 * Renders metadata panel for a focused tactile-portal or arena-block shape.
 * Only shows when focus mode is active for a single shape.
 *
 * Performance optimizations:
 * - track() HOC provides Proxy-based reactivity
 * - SINGLE combined camera subscription (not separate zoom/viewport)
 * - Batched updates via TLDraw's signal system
 *
 * Pattern: combine camera state to reduce subscriptions.
 */
export const MetadataPanelOverlay = track(function MetadataPanelOverlay() {
  
  const editor = useEditor()
  const focusState = useShapeFocusState()
  const focusedShapeId = focusState.activeShapeId
  
  // 1. Determine candidate shape for indicator if not focused
  const hoveredId = editor.getHoveredShapeId()
  const selectedIds = editor.getSelectedShapeIds()
  
  // 1. Debounce hover state to allow "reaching" for the indicator
  const [hoveredCandidate, setHoveredCandidate] = useState<TLShapeId | null>(null)

  useEffect(() => {
    if (hoveredId) {
      setHoveredCandidate(hoveredId as TLShapeId)
    } else {
      const timer = setTimeout(() => {
        setHoveredCandidate(null)
      }, 1500) // 1.5s grace period
      return () => clearTimeout(timer)
    }
  }, [hoveredId])

  // Only hide during actual transformation or marquee selection
  const isBusy = editor.isIn('select.translating') || 
                 editor.isIn('select.resizing') || 
                 editor.isIn('select.rotating') ||
                 editor.isIn('select.brushing')
  
  const candidateId = focusedShapeId 
    ? null 
    : isBusy ? null : (hoveredCandidate || (selectedIds.length === 1 ? selectedIds[0] : null))

  // 2. Focused panel logic
  const shape = focusedShapeId ? editor.getShape(focusedShapeId as TLShapeId) : null
  const portalShape = shape?.type === 'tactile-portal' ? (shape as TactilePortalShape) : null
  const blockShape = shape?.type === 'arena-block' ? (shape as ArenaBlockShape) : null

  const selection = useMemo(() => {
    if (portalShape) {
      return {
        shapeId: portalShape.id,
        source: portalShape.props.source,
        focusedCardId: portalShape.props.focusedCardId,
      }
    }
    if (!blockShape) return null
    const blockId = Number(blockShape.props.blockId)
    if (!Number.isFinite(blockId)) return null
    return { blockId }
  }, [portalShape, blockShape])

  // Calculate position if we have a focused shape
  let headerPosition = null
  let connectionsPosition = null
  if (shape) {
    const pageBounds = editor.getShapePageBounds(shape)
    if (pageBounds) {
      const topLeft = editor.pageToScreen({ x: pageBounds.minX, y: pageBounds.minY })
      const topRight = editor.pageToScreen({ x: pageBounds.maxX, y: pageBounds.minY })

      // Compensate for shape visual overflow (borders/shadows) that scales with zoom
      // This keeps the panel from "seeping into" the shape at high zoom levels
      const zoom = editor.getZoomLevel()
      const visualOffset = 8 * zoom
      const headerOffset = 2 * zoom

      connectionsPosition = {
        left: topRight.x + METADATA_PANEL_GAP_SCREEN + visualOffset,
        top: topLeft.y,
        width: METADATA_PANEL_WIDTH_SCREEN,
        minHeight: METADATA_PANEL_MIN_HEIGHT_SCREEN,
      }

      const headerWidth = Math.max(24, topRight.x - topLeft.x + 12)
      headerPosition = {
        left: topLeft.x - 6,
        top: topLeft.y - METADATA_PANEL_HEADER_HEIGHT_SCREEN - headerOffset,
        width: headerWidth,
        height: METADATA_PANEL_HEADER_HEIGHT_SCREEN,
      }
    }
  }

  return (
    <>
      {/* 1. Show indicator for hovered/selected shapes when idle and not focused */}
      <AnimatePresence>
        {candidateId && (
          <CandidateIndicator 
            key={`indicator-${candidateId}`}
            shapeId={candidateId as TLShapeId} 
          />
        )}
      </AnimatePresence>

      {/* 2. Show full metadata panel when focused */}
      <AnimatePresence>
        {focusedShapeId && shape && headerPosition && connectionsPosition && selection && (
          <motion.div
            key={focusedShapeId}
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{
              duration: 0.300,
              ease: [0.25, 0.46, 0.45, 0.94],
            }}
            style={{ pointerEvents: 'none' }}
          >
            <MetadataPanel
              selection={selection}
              headerPosition={headerPosition}
              connectionsPosition={connectionsPosition}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
})
