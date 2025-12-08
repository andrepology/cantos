import { memo, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import type { PortalSpawnGhostState } from '../hooks/usePortalSpawnDrag'

type PortalSpawnGhostProps<T> = {
  ghost: PortalSpawnGhostState<T> | null
  renderContent: (item: T) => ReactNode
  /**
   * Optional style knobs to keep callers flexible without reimplementing the ghost.
   */
  padding?: number
  borderColor?: string
  background?: string
  borderRadius?: number
  borderWidth?: number
  boxShadow?: string
}

/**
 * Lightweight, presentational ghost used while dragging to spawn tactile portals.
 * Consumers supply the content renderer; positioning and lifecycle are handled here.
 */
export const PortalSpawnGhost = memo(function PortalSpawnGhost<T>({
  ghost,
  renderContent,
  padding = 8,
  borderColor = 'rgba(0,0,0,0.08)',
  background = 'rgba(255,255,255,0.94)',
  borderRadius = 4,
  borderWidth = 1,
  boxShadow = '0 6px 18px rgba(0,0,0,0.18)',
}: PortalSpawnGhostProps<T>) {
  if (!ghost || typeof document === 'undefined') return null

  const anchorRect = ghost.anchorRect ?? {
    x: ghost.pointer.x - ghost.pointerOffset.x,
    y: ghost.pointer.y - ghost.pointerOffset.y,
    width: 0,
    height: 0,
  }

  const width = anchorRect.width
  const height = anchorRect.height
  const left = ghost.pointer.x - ghost.pointerOffset.x
  const top = ghost.pointer.y - ghost.pointerOffset.y

  const element = (
    <motion.div
      initial={{ opacity: 0.8, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
      style={{
        position: 'fixed',
        left,
        top,
        width,
        height,
        pointerEvents: 'none',
        zIndex: 2000,
      }}
    >
      <div
        style={{
          padding,
          borderRadius,
          border: `${borderWidth}px solid ${borderColor}`,
          background,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          boxShadow,
        }}
      >
        {renderContent(ghost.item)}
      </div>
    </motion.div>
  )

  return createPortal(element, document.body)
})
