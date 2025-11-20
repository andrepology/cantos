import { BaseBoxShapeUtil, HTMLContainer, T, resizeBox, stopEventPropagation } from 'tldraw'
import type { TLBaseShape } from 'tldraw'
import { TactileDeck } from './components/TactileDeck'
import type { LayoutMode } from '../arena/hooks/useTactileLayout'
import { useMemo } from 'react'

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

    return (
      <HTMLContainer style={{ pointerEvents: 'all' }}>
        <div
            style={{
                width: '100%',
                height: '100%',
                borderRadius: 8,
                overflow: 'hidden',
                backgroundColor: '#fff',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.1), 0 4px 12px rgba(0,0,0,0.1)'
            }}
            onPointerDown={stopEventPropagation} // Allow interacting with deck without selecting shape? 
            // Actually we want to select the shape usually, but for internal scroll we need to stop prop?
            // Tldraw handles this usually if we don't stop prop, drag moves shape.
            // But TactileDeck handles wheel.
        >
            <TactileDeck w={w} h={h} mode={mode} />
        </div>
      </HTMLContainer>
    )
  }

  indicator(shape: TactilePortalShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />
  }
}

