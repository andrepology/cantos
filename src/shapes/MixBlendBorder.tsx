import { forwardRef } from 'react'

export interface MixBlendBorderProps {
  /** Whether the element is currently hovered */
  isHovered: boolean
  /** Whether a panel is currently open */
  panelOpen: boolean
  /** Border radius for the border overlay */
  borderRadius: number
  /** Transform origin for 3D effects (optional) */
  transformOrigin?: string
  /** Z-index for layering */
  zIndex?: number
  /** Whether to show subtle border normally, or only on hover */
  subtleNormal?: boolean
}

/**
 * A reusable mix-blend-mode border overlay component used by shape components
 * to create a subtle darkening effect around their borders.
 */
export const MixBlendBorder = forwardRef<HTMLDivElement, MixBlendBorderProps>(
  ({ isHovered, panelOpen, borderRadius, transformOrigin, zIndex = 10, subtleNormal = false }, ref) => {
    return (
      <div
        ref={ref}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          border: `${isHovered && !panelOpen ? 4 : subtleNormal ? 0.5 : 0}px solid rgba(0,0,0,.05)`,
          borderRadius,
          mixBlendMode: 'multiply',
          pointerEvents: 'none',
          zIndex,
          opacity: 1,
          transition: 'opacity 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94), border-width 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          transformOrigin,
        }}
      />
    )
  }
)

MixBlendBorder.displayName = 'MixBlendBorder'
