import { useCallback, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { track, useEditor, useValue } from 'tldraw'
import { AnimatePresence } from 'motion/react'
import { MetadataPanel } from '../shapes/components/MetadataPanel'
import type { TactilePortalShape } from '../shapes/TactilePortalShape'
import type { ArenaBlockShape } from '../shapes/ArenaBlockShape'

const GAP_SCREEN = 16 // Gap between portal and panel (screen px)
const PANEL_WIDTH = 220 // Panel width (screen px)
const MIN_PANEL_HEIGHT = 320 // Minimum panel height (screen px)

/**
 * Renders metadata panel for a single selected tactile-portal shape.
 * Only shows when exactly one tactile portal is selected.
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
  const [isCollapsed, setIsCollapsed] = useState(false)
  const handleToggleCollapsed = useCallback(() => {
    setIsCollapsed(prev => !prev)
  }, [])

  // track() automatically subscribes to selection changes
  const singleMetadataShape = useValue('singleMetadataShape', () => {
    const selectedIds = editor.getSelectedShapeIds()
    if (selectedIds.length !== 1) return null
    const shape = editor.getShape(selectedIds[0])
    if (!shape || (shape.type !== 'tactile-portal' && shape.type !== 'arena-block')) return null
    return { id: selectedIds[0], type: shape.type }
  }, [editor])

  const shape = singleMetadataShape?.type === 'tactile-portal'
    ? (editor.getShape(singleMetadataShape.id) as TactilePortalShape)
    : singleMetadataShape?.type === 'arena-block'
      ? (editor.getShape(singleMetadataShape.id) as ArenaBlockShape)
      : null

  const selection = useMemo(() => {
    if (!shape || !singleMetadataShape) return null
    if (singleMetadataShape.type === 'tactile-portal') {
      const portal = shape as TactilePortalShape
      return {
        shapeId: singleMetadataShape.id,
        source: portal.props.source,
        focusedCardId: portal.props.focusedCardId,
      }
    }
    const blockId = Number((shape as ArenaBlockShape).props.blockId)
    if (!Number.isFinite(blockId)) return null
    return { blockId }
  }, [shape, singleMetadataShape])

  // Only show panel in idle state - pointing_shape/translating/resizing all hide it
  const isIdle = editor.isIn('select.idle')

  // Calculate position if we have a shape
  let positioning = null
  if (shape) {
      const pageBounds = editor.getShapePageBounds(shape)
      if (pageBounds) {
          const anchor = editor.pageToScreen({ x: pageBounds.maxX, y: pageBounds.minY })
          
          // Compensate for shape visual overflow (borders/shadows) that scales with zoom
          // This keeps the panel from "seeping into" the shape at high zoom levels
          const zoom = editor.getZoomLevel()
          const visualOffset = 8 * zoom 

          positioning = {
              left: anchor.x + GAP_SCREEN + visualOffset,
              top: anchor.y,
              width: PANEL_WIDTH,
              minHeight: MIN_PANEL_HEIGHT
          }
      }
  }

  // Always render AnimatePresence so exit animations can complete
  return (
    <AnimatePresence>
      {singleMetadataShape && shape && positioning && selection && isIdle && (
        <motion.div
          key={singleMetadataShape.id}
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
            position={positioning}
            collapsed={isCollapsed}
            onToggleCollapsed={handleToggleCollapsed}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
})
