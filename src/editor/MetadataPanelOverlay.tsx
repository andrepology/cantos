import { track, useEditor, useValue } from 'tldraw'
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
  const selectedIds = editor.getSelectedShapeIds()
  
  // Filter to tactile-portal shapes only (exclude minimized)
  const tactilePortals = selectedIds
    .map(id => editor.getShape(id))
    .filter((shape): shape is TactilePortalShape => {
      if (!shape || shape.type !== 'tactile-portal') return false
      const tactileShape = shape as TactilePortalShape
      return !tactileShape.props.minimized
    })
  
  if (tactilePortals.length === 0) return null
  
  return (
    <>
      {tactilePortals.map(shape => (
        <PortalMetadataPanel 
          key={shape.id} 
          shapeId={shape.id}
        
        />
      ))}
    </>
  )
})

