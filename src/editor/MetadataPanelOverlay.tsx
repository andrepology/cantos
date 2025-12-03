import { track, useEditor, useValue } from 'tldraw'
import { AnimatePresence } from 'motion/react'
import { PortalMetadataPanel } from '../shapes/components/PortalMetadataPanel'
import type { TactilePortalShape } from '../shapes/TactilePortalShape'

/**
 * Renders metadata panels for all selected tactile-portal shapes.
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
  const selectedTactilePortalIds = useValue('selectedTactilePortals', () =>
    editor.getSelectedShapeIds().filter(id => {
      const shape = editor.getShape(id)
      return shape?.type === 'tactile-portal'
    }), [editor]
  )

  // Always render AnimatePresence so exit animations can complete
  return (
    <AnimatePresence>
      {selectedTactilePortalIds.map(id => (
        <PortalMetadataPanel
          key={id}
          shapeId={id}
        />
      ))}
    </AnimatePresence>
  )
})

