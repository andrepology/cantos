import { HTMLContainer, Rectangle2d, ShapeUtil, T, resizeBox, stopEventPropagation } from 'tldraw'
import type { TLBaseShape, TLResizeInfo } from 'tldraw'
import { useEffect, useMemo, useRef } from 'react'

export type ArenaBlockShape = TLBaseShape<
  'arena-block',
  {
    w: number
    h: number
    blockId: string
    kind: 'image' | 'text' | 'link' | 'media'
    title?: string
    imageUrl?: string
    url?: string
    embedHtml?: string
    hidden?: boolean
  }
>

export class ArenaBlockShapeUtil extends ShapeUtil<ArenaBlockShape> {
  static override type = 'arena-block' as const

  static override props = {
    w: T.number,
    h: T.number,
    blockId: T.string,
    kind: T.string,
    title: T.string.optional(),
    imageUrl: T.string.optional(),
    url: T.string.optional(),
    embedHtml: T.string.optional(),
    hidden: T.boolean.optional(),
  }

  override getDefaultProps(): ArenaBlockShape['props'] {
    return {
      w: 240,
      h: 240,
      blockId: '',
      kind: 'text',
      title: '',
    }
  }

  override getGeometry(shape: ArenaBlockShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
  }

  override onResize(shape: ArenaBlockShape, info: TLResizeInfo<ArenaBlockShape>) {
    return resizeBox(shape, info)
  }

  override component(shape: ArenaBlockShape) {
    const { w, h, kind, title, imageUrl, url, embedHtml, hidden } = shape.props

    const MemoEmbed = useMemo(
      () =>
        function MemoEmbedInner({ html }: { html: string }) {
          const ref = useRef<HTMLDivElement>(null)
          useEffect(() => {
            const el = ref.current
            if (!el) return
            const iframes = el.querySelectorAll('iframe')
            iframes.forEach((f) => {
              const fr = f as HTMLIFrameElement
              fr.style.width = '100%'
              fr.style.height = '100%'
              try {
                ;(fr as any).loading = 'lazy'
              } catch {}
            })
          }, [html])
          return <div ref={ref} style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }} dangerouslySetInnerHTML={{ __html: html }} />
        },
      []
    )

    return (
      <HTMLContainer
        style={{
          width: w,
          height: h,
          background: '#fff',
          border: '1px solid rgba(0,0,0,.08)',
          boxShadow: '0 4px 12px rgba(0,0,0,.06)',
          borderRadius: 8,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          visibility: hidden ? 'hidden' : 'visible',
        }}
        onPointerDown={stopEventPropagation}
        onPointerMove={stopEventPropagation}
        onPointerUp={stopEventPropagation}
        onWheel={stopEventPropagation}
      >
        {kind === 'image' ? (
          <img src={imageUrl} alt={title} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : kind === 'text' ? (
          <div style={{ padding: 12, color: 'rgba(0,0,0,.7)', fontSize: 14, lineHeight: 1.5, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}>{title ?? ''}</div>
        ) : kind === 'link' ? (
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden' }}>
            {imageUrl ? <img src={imageUrl} alt={title} loading="lazy" decoding="async" style={{ width: '100%', height: '65%', objectFit: 'cover', flexShrink: 0 }} /> : null}
            <div style={{ padding: 12, color: 'rgba(0,0,0,.7)', overflow: 'hidden' }}>
              <div style={{ fontSize: 14 }}>{title ?? url ?? ''}</div>
            </div>
          </div>
        ) : kind === 'media' ? (
          embedHtml ? (
            <MemoEmbed html={embedHtml} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'rgba(0,0,0,.4)' }}>media</div>
          )
        ) : null}
      </HTMLContainer>
    )
  }

  override indicator(shape: ArenaBlockShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />
  }
}


