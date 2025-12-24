import { stopEventPropagation } from 'tldraw'
import type { TLBaseShape } from 'tldraw'
import type { TactilePortalShape } from '../TactilePortalShape'
import type { MinimizeConfig } from '../types/minimizeTypes'
import {
  detectMinimizeRegion,
  calculateMinimizeTarget,
  calculateAnchoredPosition
} from './minimizeUtils'

/**
 * Creates a double-click handler for minimize/restore functionality
 */
export function createMinimizeHandler(
  shape: TactilePortalShape,
  editor: any, // Using any for editor to avoid complex TLDraw type imports
  animateTransition: (
    targetW: number,
    targetH: number,
    newX: number,
    newY: number,
    currentX: number,
    currentY: number
  ) => void,
  config: MinimizeConfig = {}
) {
  return (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const zoom = rect.width / shape.props.w
    const x = (e.clientX - rect.left) / zoom
    const y = (e.clientY - rect.top) / zoom

    // Detect which region was clicked
    const region = detectMinimizeRegion(x, y, shape.props.w, shape.props.h, config.threshold)

    try {
      // Calculate target state
      const { targetW, targetH, anchor } = calculateMinimizeTarget(
        region,
        shape.props.minimized || false,
        shape.props.w,
        shape.props.h,
        shape.props.restoredW,
        shape.props.restoredH,
        config
      )

      if (!shape.props.minimized) {
        editor.setSelectedShapes([])
      }

      // Calculate new position based on anchor
      const { newX, newY } = calculateAnchoredPosition(
        shape.x,
        shape.y,
        shape.props.w,
        shape.props.h,
        targetW,
        targetH,
        anchor
      )

      // Start animation
      animateTransition(targetW, targetH, newX, newY, shape.x, shape.y)

      // Commit changes after animation completes
      const animDuration = config.animDuration || 0.25
      setTimeout(() => {
        editor.updateShape({
          id: shape.id,
          type: 'tactile-portal',
          x: newX,
          y: newY,
          props: {
            w: targetW,
            h: targetH,
            minimized: !shape.props.minimized,
            restoredW: shape.props.minimized ? undefined : shape.props.w,
            restoredH: shape.props.minimized ? undefined : shape.props.h,
            minimizeAnchor: anchor
          }
        })
      }, animDuration * 1000)

    } catch (error) {
      // If region is center, do nothing (expected behavior)
      if (error instanceof Error && error.message.includes('Cannot minimize from center region')) {
        return
      }
      // Re-throw unexpected errors
      throw error
    }

    // Prevent event propagation
    stopEventPropagation(e as any)
    e.preventDefault()
  }
}
