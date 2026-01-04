import { memo, type ReactNode, type CSSProperties } from 'react'
import { SHADOWS, type ShadowState } from '../../arena/constants'

interface ShadowContainerProps {
  state: ShadowState
  borderRadius: number
  children: ReactNode
  className?: string
  style?: CSSProperties
  isFocused?: boolean
  shapeId?: string
}

/**
 * ShadowContainer provides GPU-composited shadow transitions between three elevation states:
 * - surface: resting on the canvas (default)
 * - lifted: hover or selected (slight elevation)
 * - floating: focused (full "picked up" effect with scale)
 *
 * Shadow transitions use opacity cross-fade between static shadow layers,
 * which is fully GPU-composited and doesn't trigger repaints.
 *
 * The data attributes enable CSS-based deemphasis for non-focused shapes
 * without triggering React re-renders (see index.css).
 */
export const ShadowContainer = memo(function ShadowContainer({
  state,
  borderRadius,
  children,
  className,
  style,
  isFocused = false,
  shapeId,
}: ShadowContainerProps) {
  // Common layer style for shadow divs
  const layerBase: CSSProperties = {
    position: 'absolute',
    inset: 0,
    borderRadius,
    pointerEvents: 'none',
    transition: 'opacity 200ms ease-out',
  }

  // Scale transform for floating state
  const isFloating = state === 'floating'

  return (
    <div
      data-shape-container
      data-is-focused={isFocused || undefined}
      data-shape-id={shapeId}
      className={className}
      style={{
        position: 'relative',
        transform: isFloating ? 'scale(1.04)' : 'scale(1)',
        willChange: 'transform',
        transition: 'transform 200ms ease-out',
        ...style,
      }}
    >
      {/* Shadow Layer: Surface - tight contact shadow */}
      <div
        style={{
          ...layerBase,
          boxShadow: SHADOWS.surface,
          opacity: state === 'surface' ? 1 : 0,
        }}
      />
      {/* Shadow Layer: Lifted - medium spread, grounded */}
      <div
        style={{
          ...layerBase,
          boxShadow: SHADOWS.lifted,
          opacity: state === 'lifted' ? 1 : 0,
        }}
      />
      {/* Shadow Layer: Floating - large diffuse, "picked up" */}
      <div
        style={{
          ...layerBase,
          boxShadow: SHADOWS.floating,
          opacity: state === 'floating' ? 1 : 0,
        }}
      />

      {/* Content layer - needs explicit dimensions for absolute-positioned children */}
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
})

export type { ShadowState }
