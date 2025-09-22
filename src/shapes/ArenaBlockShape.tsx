import { HTMLContainer, Rectangle2d, ShapeUtil, T, resizeBox, stopEventPropagation, useEditor } from 'tldraw'
import type { TLBaseShape, TLResizeInfo } from 'tldraw'
import { useEffect, useMemo, useRef } from 'react'
import { useArenaBlock } from '../arena/useArenaChannel'

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
    const panelW = panelPx / z
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
          border: '1px solid rgba(0,0,0,.08)',
          boxShadow: '0 4px 12px rgba(0,0,0,.06)',
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

        {isSelected && !isTransforming && Number.isFinite(numericId) ? (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: w + gapW,
              width: panelW,
              maxHeight: panelMaxHeightPx / z,
              overflow: 'auto',
              pointerEvents: 'auto',
              display: 'flex',
              flexDirection: 'column',
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch',
              zIndex: 1000,
            }}
            onPointerDown={stopEventPropagation}
            onPointerMove={stopEventPropagation}
            onPointerUp={stopEventPropagation}
            onWheel={(e) => {
              if ((e as any).ctrlKey) {
                // Pinch-zoom: prevent browser zoom, allow TLDraw to handle by not stopping propagation
                e.preventDefault()
                return
              }
              // Normal scroll: keep it local to the panel
              e.stopPropagation()
            }}
            onWheelCapture={(e) => {
              if ((e as any).ctrlKey) {
                e.preventDefault()
                return
              }
              e.stopPropagation()
            }}
          >
            <div style={{ padding: 8 / z }}>
              <div style={{ fontFamily: "'Alte Haas Grotesk', sans-serif", fontWeight: 700, fontSize: `${12 / z}px`, letterSpacing: '-0.0125em' }}>
                {details?.title || title || 'Untitled'}
              </div>
            </div>

            <div style={{ padding: 8 / z, display: 'grid', rowGap: 6 / z, color: 'rgba(0,0,0,.7)' }}>
              {detailsLoading ? (
                <div style={{ fontSize: `${12 / z}px`, opacity: 0.6 }}>loading…</div>
              ) : detailsError ? (
                <div style={{ fontSize: `${12 / z}px`, opacity: 0.6 }}>error: {detailsError}</div>
              ) : (
                <>
                  {details?.user ? (
                    <div style={{ display: 'flex', gap: 6 / z, alignItems: 'baseline' }}>
                      <span style={{ fontSize: `${11 / z}px`, opacity: 0.6 }}>By</span>
                      <span style={{ fontSize: `${12 / z}px` }}>{details.user.full_name || details.user.username}</span>
                    </div>
                  ) : null}
                  {details?.createdAt ? (
                    <div style={{ display: 'flex', gap: 6 / z }}>
                      <span style={{ fontSize: `${11 / z}px`, opacity: 0.6 }}>Added</span>
                      <span style={{ fontSize: `${12 / z}px` }}>{new Date(details.createdAt).toLocaleDateString()}</span>
                    </div>
                  ) : null}
                  {details?.updatedAt ? (
                    <div style={{ display: 'flex', gap: 6 / z }}>
                      <span style={{ fontSize: `${11 / z}px`, opacity: 0.6 }}>Modified</span>
                      <span style={{ fontSize: `${12 / z}px` }}>{new Date(details.updatedAt).toLocaleDateString()}</span>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div style={{ padding: `${8 / z}px ${8 / z}px` }}>
              <div style={{ fontSize: `${11 / z}px`, fontWeight: 700, opacity: 0.7, marginBottom: 6 / z }}>Connections{details?.connections ? ` (${details.connections.length})` : ''}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 / z }}>
                {details?.connections?.length ? (
                  details.connections.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        padding: 8 / z,
                        border: '1px solid rgba(0,0,0,.08)',
                        borderRadius: 4 / z,
                        background: 'rgba(0,0,0,.02)',
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 8 / z,
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'baseline', gap: 8 / z }}>
                        <div style={{ fontSize: `${12 / z}px`, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title || c.slug}</div>
                      </div>
                      <div style={{ fontSize: `${11.5 / z}px`, opacity: 0.7, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.user?.full_name || c.user?.username || ''}
                      </div>
                    </div>
                  ))
                ) : detailsLoading ? null : (
                  <div style={{ fontSize: `${12 / z}px`, opacity: 0.6 }}>No connections</div>
                )}
                {details?.hasMoreConnections ? (
                  <div style={{ fontSize: `${11 / z}px`, opacity: 0.6 }}>More connections exist…</div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </HTMLContainer>
    )
  }

  override indicator(shape: ArenaBlockShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />
  }
}


