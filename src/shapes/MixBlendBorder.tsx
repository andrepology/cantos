import type { CSSProperties } from 'react'

export interface MixBlendBorderProps {
  /** The width of the border in pixels */
  width: number
  /** Border radius for the border overlay */
  borderRadius: number
  /** Transform origin for 3D effects (optional) */
  transformOrigin?: string
  /** Z-index for layering */
  zIndex?: number
  /** Opacity of the border (defaults to 1) */
  opacity?: number
}

/**
 * A reusable mix-blend-mode border overlay component used by shape components
 * to create a subtle darkening effect around their borders.
 * 
 * It uses multiply blend mode to naturally darken whatever is beneath it.
 * Width and opacity transitions are built-in for smooth animations.
 */
export const MixBlendBorder = ({
  width,
  borderRadius,
  transformOrigin,
  zIndex = 10,
  opacity = 1,
}: MixBlendBorderProps) => {
  const borderStyle: CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    borderStyle: 'solid',
    borderColor: 'rgba(0,0,0,.05)',
    borderWidth: width,
    borderRadius,
    mixBlendMode: 'multiply',
    pointerEvents: 'none',
    zIndex,
    opacity,
    transition: 'opacity 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94), border-width 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    transformOrigin,
  }

  return <div style={borderStyle} />
}
