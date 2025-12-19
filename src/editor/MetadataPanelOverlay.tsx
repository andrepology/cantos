import { useCallback, useState } from 'react'
import { motion } from 'motion/react'
import { track, useEditor, useValue } from 'tldraw'
import { AnimatePresence } from 'motion/react'
import { PortalMetadataPanel } from '../shapes/components/PortalMetadataPanel'
import type { TactilePortalShape } from '../shapes/TactilePortalShape'

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
 * Pattern from SlideLabelsOverlay: combine camera state to reduce subscriptions.
 */
export const MetadataPanelOverlay = track(function MetadataPanelOverlay() {
  const editor = useEditor()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const handleToggleCollapsed = useCallback(() => {
    setIsCollapsed(prev => !prev)
  }, [])

  // track() automatically subscribes to selection changes
  const singleTactilePortalId = useValue('singleTactilePortal', () => {
    const selectedIds = editor.getSelectedShapeIds()
    const tactilePortalIds = selectedIds.filter(id => {
      const shape = editor.getShape(id)
      return shape?.type === 'tactile-portal'
    })

    // Only show panel if exactly one tactile portal is selected
    return tactilePortalIds.length === 1 ? tactilePortalIds[0] : null
  }, [editor])

  const shape = singleTactilePortalId ? editor.getShape(singleTactilePortalId) as TactilePortalShape : null

  // Calculate position if we have a shape
  let positioning = null
  if (shape) {
      const pageBounds = editor.getShapePageBounds(shape)
      if (pageBounds) {
          const anchor = editor.pageToScreen({ x: pageBounds.maxX, y: pageBounds.minY })
          positioning = {
              left: anchor.x + GAP_SCREEN,
              top: anchor.y,
              width: PANEL_WIDTH,
              minHeight: MIN_PANEL_HEIGHT
          }
      }
  }

  // Always render AnimatePresence so exit animations can complete
  return (
    <AnimatePresence>
      {singleTactilePortalId && shape && positioning && (
        <motion.div
          key={singleTactilePortalId}
          initial={{ opacity: 0, y: 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98 }}
          transition={{
            duration: 0.300,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
          style={{ pointerEvents: 'none' }}
        >
          <PortalMetadataPanel
            shapeId={singleTactilePortalId}
            source={shape.props.source}
            focusedCardId={shape.props.focusedCardId}
            position={positioning}
            collapsed={isCollapsed}
            onToggleCollapsed={handleToggleCollapsed}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
})
