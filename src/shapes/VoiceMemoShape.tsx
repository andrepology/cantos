import { HTMLContainer, Rectangle2d, ShapeUtil, T, resizeBox } from 'tldraw'
import type { TLBaseShape, TLResizeInfo } from 'tldraw'

export type VoiceMemoShape = TLBaseShape<
  'voice-memo',
  {
    w: number
    h: number
    title?: string
    audioId: string | null
    status: 'uploading' | 'ready' | 'error'
    durationMs?: number
  }
>

export class VoiceMemoShapeUtil extends ShapeUtil<VoiceMemoShape> {
  static override type = 'voice-memo' as const

  static override props = {
    w: T.number,
    h: T.number,
    title: T.string.optional(),
    audioId: T.string.nullable(),
    status: T.string, // use string; validate values at runtime if needed
    durationMs: T.number.optional(),
  }

  override getDefaultProps(): VoiceMemoShape['props'] {
    return {
      w: 320,
      h: 96,
      title: 'Voice memo',
      audioId: null,
      status: 'uploading',
    }
  }

  override getGeometry(shape: VoiceMemoShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
  }

  override onResize(shape: VoiceMemoShape, info: TLResizeInfo<VoiceMemoShape>) {
    return resizeBox(shape, info)
  }

  override component(shape: VoiceMemoShape) {
    const { w, h, title, status } = shape.props
    return (
      <HTMLContainer
        className="flex flex-col justify-center px-3 font-sans text-[14px] select-none"
        style={{ width: w, height: h, background: 'white', borderRadius: 8, gap: 8 }}
      >
        <div className="flex items-center justify-between">
          <span style={{ fontWeight: 600 }}>{title ?? 'Voice memo'}</span>
          <span style={{ color: '#888' }}>
            {status === 'uploading' ? 'Uploading…' : status === 'error' ? 'Error' : 'Ready'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: status === 'ready' ? '#16a34a' : status === 'error' ? '#dc2626' : '#d97706',
            }}
          />
          <div style={{ height: 4, background: '#eee', flex: 1, borderRadius: 4 }} />
          <button
            style={{ padding: '4px 8px', borderRadius: 6, background: '#f3f4f6' }}
            onPointerDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              // Playback UI will be added in later iteration when Jazz audio is wired
            }}
          >
            ▶︎
          </button>
        </div>
      </HTMLContainer>
    )
  }

  override indicator(shape: VoiceMemoShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />
  }
}


