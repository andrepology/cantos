import { track, useEditor, useValue } from 'tldraw'
import { AnimatePresence } from 'motion/react'
import { PortalMetadataPanel } from '../shapes/components/PortalMetadataPanel'
import type { TactilePortalShape } from '../shapes/TactilePortalShape'

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

  // Always render AnimatePresence so exit animations can complete
  return (
    <AnimatePresence>
      {singleTactilePortalId && (
        <PortalMetadataPanel
          key={singleTactilePortalId}
          shapeId={singleTactilePortalId}
        />
      )}
    </AnimatePresence>
  )
})

