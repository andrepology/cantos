import { HTMLContainer, Rectangle2d, ShapeUtil, T, resizeBox, stopEventPropagation, useEditor, createShapeId, transact } from 'tldraw'
import type { TLBaseShape, TLResizeInfo } from 'tldraw'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useArenaBlock } from '../arena/useArenaChannel'
import { ConnectionsPanel } from '../arena/ConnectionsPanel'
import { useGlobalPanelState } from '../jazz/usePanelState'

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
    const isPointerPressed = !!inputsAny?.isPressed || !!inputsAny?.isPointerDown
    const z = editor.getZoomLevel() || 1
    const panelPx = 260
    const panelMaxHeightPx = 320
    const gapPx = 1
    const gapW = gapPx / z

    // Panel state management
    const { setOpen } = useGlobalPanelState()

    // Lazily fetch block details when selected only
    const numericId = Number(blockId)
    const shouldFetchDetails = isSelected && !isTransforming && Number.isFinite(numericId)
    const { loading: detailsLoading, error: detailsError, details } = useArenaBlock(Number.isFinite(numericId) ? numericId : undefined, shouldFetchDetails)


    const MemoEmbed = useMemo(
      () =>
        memo(function MemoEmbedInner({ html }: { html: string }) {
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

              // Prevent default drag behavior
              fr.addEventListener('dragstart', (e) => e.preventDefault())

              const allowDirectives = [
                'accelerometer',
                'autoplay',
                'clipboard-write',
                'encrypted-media',
                'gyroscope',
                'picture-in-picture',
                'web-share',
              ]
              try {
                fr.setAttribute('allow', allowDirectives.join('; '))
                fr.setAttribute('allowfullscreen', '')
                if (!fr.getAttribute('referrerpolicy')) fr.setAttribute('referrerpolicy', 'origin-when-cross-origin')
              } catch {}

              fr.onerror = () => {
                console.warn('Failed to load iframe content:', fr.src)
              }
            })
          }, [html])
          return <div ref={ref} style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }} dangerouslySetInnerHTML={{ __html: html }} />
        }),
      []
    )

    const memoizedConnections = useMemo(() => {
      return (details?.connections ?? []).map((c) => ({
        id: c.id,
        title: c.title || c.slug,
        slug: c.slug,
        author: c.user?.full_name || c.user?.username,
      }))
    }, [details?.connections])

    const handleSelectChannel = useCallback(
      (slug: string) => {
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
      },
      [editor, shape]
    )

    return (
      <HTMLContainer
        style={{
          pointerEvents: 'all',
          width: w,
          height: h,
          background: '#fff',
          border: '1px solid rgba(0,0,0,.05)',
          boxShadow: isSelected ? '0 4px 12px rgba(0,0,0,.04)' : 'none',
          borderRadius: 8,
          transition: 'box-shadow 0.2s ease-in-out',
          overflow: 'visible',
          display: 'flex',
          flexDirection: 'column',
          visibility: hidden ? 'hidden' : 'visible',
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          setOpen(true)
        }}
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
            <img
              src={imageUrl}
              alt={title}
              loading="lazy"
              decoding="async"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              onDragStart={(e) => e.preventDefault()}
            />
          ) : kind === 'text' ? (
            <div style={{ padding: 12, color: 'rgba(0,0,0,.7)', fontSize: 14, lineHeight: 1.5, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}>{title ?? ''}</div>
          ) : kind === 'link' ? (
            <div
              style={{ width: '100%', height: '100%', position: 'relative' }}
              onMouseEnter={(e) => {
                const hoverEl = e.currentTarget.querySelector('[data-interactive="link-hover"]') as HTMLElement
                if (hoverEl && url) {
                  hoverEl.style.opacity = '1'
                  hoverEl.style.background = 'rgba(255, 255, 255, 0.95)'
                  hoverEl.style.borderColor = 'rgba(229, 229, 229, 1)'
                }
              }}
              onMouseLeave={(e) => {
                const hoverEl = e.currentTarget.querySelector('[data-interactive="link-hover"]') as HTMLElement
                if (hoverEl && url) {
                  hoverEl.style.opacity = '0'
                  hoverEl.style.background = 'rgba(255, 255, 255, 0.9)'
                  hoverEl.style.borderColor = '#e5e5e5'
                }
              }}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={title}
                  loading="lazy"
                  decoding="async"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block'
                  }}
                  onDragStart={(e) => e.preventDefault()}
                />
              ) : null}
              {url ? (
                <a
                  data-interactive="link-hover"
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    position: 'absolute',
                    bottom: 8,
                    left: 8,
                    right: 8,
                    height: 32,
                    background: 'rgba(255, 255, 255, 0.9)',
                    border: '1px solid #e5e5e5',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 8px',
                    cursor: 'pointer',
                    fontSize: 11,
                    color: 'rgba(0,0,0,.6)',
                    gap: 6,
                    opacity: 0,
                    transition: 'all 0.2s ease',
                    pointerEvents: 'auto',
                    textDecoration: 'none'
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    window.open(url, '_blank', 'noopener,noreferrer')
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation()
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                  </svg>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {title ?? url ?? ''}
                  </span>
                </a>
              ) : null}
            </div>
          ) : kind === 'media' ? (
            embedHtml ? (
              <MemoEmbed html={embedHtml} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'rgba(0,0,0,.4)' }}>media</div>
            )
          ) : null}
        </div>

        {/* Panel for shape selection */}
        {isSelected && !isTransforming && !isPointerPressed && Number.isFinite(numericId) ? (
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
            connections={memoizedConnections}
            hasMore={details?.hasMoreConnections}
            onSelectChannel={handleSelectChannel}
          />
        ) : null}

      </HTMLContainer>
    )
  }

  override indicator(shape: ArenaBlockShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />
  }
}


