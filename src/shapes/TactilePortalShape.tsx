import { BaseBoxShapeUtil, HTMLContainer, T, resizeBox, stopEventPropagation } from 'tldraw'
import type { TLBaseShape } from 'tldraw'
import { TactileDeck } from './components/TactileDeck'
import type { LayoutMode } from '../arena/hooks/useTactileLayout'
import { useMemo, useRef, useState } from 'react'
import { isInteractiveTarget } from '../arena/dom'
import { SHAPE_BORDER_RADIUS, SHAPE_SHADOW, ELEVATED_SHADOW, PORTAL_BACKGROUND } from '../arena/constants'
import { MixBlendBorder } from './MixBlendBorder'

export interface TactilePortalShape extends TLBaseShape<
  'tactile-portal',
  {
    w: number
    h: number
  }
> {}

export class TactilePortalShapeUtil extends BaseBoxShapeUtil<TactilePortalShape> {
  static override type = 'tactile-portal' as const
  static override props = {
    w: T.number,
    h: T.number,
  }

  getDefaultProps(): TactilePortalShape['props'] {
    return {
      w: 320,
      h: 320,
    }
  }

  component(shape: TactilePortalShape) {
    const { w, h } = shape.props

    // Simple auto-mode logic for testing
    const mode: LayoutMode = useMemo(() => {
        const ar = w / h
        if (ar > 1.5) return 'row'
        if (ar < 0.6) return 'column'
        if (w > 400 && h > 400) return 'grid'
        return 'stack'
    }, [w, h])

    // Refs and state for visual effects (matching PortalShape structure)
    const faceBackgroundRef = useRef<HTMLDivElement>(null)
    const borderRef = useRef<HTMLDivElement>(null)
    const [isHovered, setIsHovered] = useState(false)

    return (
      <HTMLContainer
        style={{ pointerEvents: 'all' }}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => setIsHovered(false)}
      >
        {/* Visual wrapper to scale full content and border during spawn-drag */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            transition: 'box-shadow 0.2s ease, transform 0.15s ease',
            transform: 'scale(1.0)',
            transformOrigin: 'center',
            boxShadow: SHAPE_SHADOW,
            borderRadius: `${SHAPE_BORDER_RADIUS}px`,
            overflow: 'hidden',
          }}
        >
          {/* Border effect - ensure non-interactive and respects rounded corners */}
          <div style={{ pointerEvents: 'none', position: 'absolute', inset: 0 }}>
            <MixBlendBorder
              ref={borderRef}
              isHovered={isHovered}
              panelOpen={false}
              borderRadius={SHAPE_BORDER_RADIUS}
              transformOrigin="top center"
              zIndex={5}
              subtleNormal={true}
            />
          </div>
          {/* Face background */}
          <div
            ref={faceBackgroundRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              background: PORTAL_BACKGROUND,
              borderRadius: `${SHAPE_BORDER_RADIUS}px`,
              boxSizing: 'border-box',
              zIndex: 3,
            }}
          />
          {/* Content layer (interactive) */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              zIndex: 4,
            }}
            onPointerDown={(e) => {
              if (isInteractiveTarget(e.target)) {
                stopEventPropagation(e)
              }
            }}
            onWheel={(e) => {
              if (e.ctrlKey) return
              // Explicitly stop propagation at the shape container level too
              e.stopPropagation()
            }}
          >
            <TactileDeck w={w} h={h} mode={mode} />
          </div>
        </div>
      </HTMLContainer>
    )
  }

  indicator(shape: TactilePortalShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />
  }
}

