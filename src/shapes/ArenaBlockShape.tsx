import { HTMLContainer, Rectangle2d, ShapeUtil, T, resizeBox, stopEventPropagation, useEditor, createShapeId, transact } from 'tldraw'
import type { TLBaseShape, TLResizeInfo } from 'tldraw'
import { useEffect, useMemo, useRef } from 'react'
import { useArenaBlock } from '../arena/useArenaChannel'
import { ConnectionsPanel } from '../arena/ConnectionsPanel'

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
    const { w, h, kind, title, imageUrl, url, embedHtml, hidden, blockId } = shape.props

    const editor = useEditor()
    const isSelected = editor.getSelectedShapeIds().includes(shape.id)
    const inputsAny = (editor as any).inputs
    const isDragging = !!inputsAny?.isDragging
    const isResizing = !!inputsAny?.isResizing
    const isTransforming = isDragging || isResizing
    const z = editor.getZoomLevel() || 1
    const panelPx = 260
    const panelMaxHeightPx = 320
    const gapPx = 8
    const gapW = gapPx / z

    // Lazily fetch block details when selected only
    const numericId = Number(blockId)
    const { loading: detailsLoading, error: detailsError, details } = useArenaBlock(Number.isFinite(numericId) ? numericId : undefined, isSelected && !isTransforming)

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
          border: '1px solid rgba(0,0,0,.05)',
          boxShadow: '0 4px 12px rgba(0,0,0,.04)',
          borderRadius: 8,
          overflow: 'visible',
          display: 'flex',
          flexDirection: 'column',
          visibility: hidden ? 'hidden' : 'visible',
        }}
        onPointerDown={stopEventPropagation}
        onPointerMove={stopEventPropagation}
        onPointerUp={stopEventPropagation}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            borderRadius: 8,
            overflow: 'hidden',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {kind === 'image' ? (
            <img src={imageUrl} alt={title} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : kind === 'text' ? (
            <div style={{ padding: 12, color: 'rgba(0,0,0,.7)', fontSize: 14, lineHeight: 1.5, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}>{title ?? ''}</div>
          ) : kind === 'link' ? (
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
              {imageUrl ? <img src={imageUrl} alt={title} loading="lazy" decoding="async" style={{ width: '100%', height: '65%', objectFit: 'contain', flexShrink: 0 }} /> : null}
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
        </div>

        {isSelected && !isTransforming && Number.isFinite(numericId) ? (
          <ConnectionsPanel
            z={z}
            x={w + gapW + (12 / z)}
            y={(8 / z)}
            widthPx={panelPx}
            maxHeightPx={panelMaxHeightPx}
            title={details?.title || title}
            authorName={details?.user?.full_name || details?.user?.username}
            createdAt={details?.createdAt}
            updatedAt={details?.updatedAt}
            loading={detailsLoading}
            error={detailsError}
            connections={(details?.connections ?? []).map((c) => ({ id: c.id, title: c.title || c.slug, slug: c.slug, author: c.user?.full_name || c.user?.username }))}
            hasMore={details?.hasMoreConnections}
            onSelectChannel={(slug) => {
              if (!slug) return
              const newId = createShapeId()
              const gap = 8
              const newW = shape.props.w
              const newH = shape.props.h
              const x0 = shape.x + newW + gap
              const y0 = shape.y
              transact(() => {
                editor.createShapes([
                  {
                    id: newId,
                    type: '3d-box',
                    x: x0,
                    y: y0,
                    props: { w: newW, h: newH, channel: slug },
                  } as any,
                ])
                editor.setSelectedShapes([newId])
              })
            }}
          />
        ) : null}
      </HTMLContainer>
    )
  }

  override indicator(shape: ArenaBlockShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />
  }
}


