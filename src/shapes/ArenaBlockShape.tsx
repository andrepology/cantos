import { HTMLContainer, Rectangle2d, ShapeUtil, T, resizeBox, stopEventPropagation, useEditor, createShapeId, transact } from 'tldraw'
import type { TLBaseShape, TLResizeInfo } from 'tldraw'
import { getGridSize, snapToGrid } from '../arena/layout'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WheelEvent as ReactWheelEvent } from 'react'
import { useArenaBlock } from '../arena/hooks/useArenaChannel'
import { computeResponsiveFont } from '../arena/typography'
import { ConnectionsPanel } from '../arena/ConnectionsPanel'
import type { ConnectedChannel } from '../arena/types'
import { CARD_BORDER_RADIUS } from '../arena/constants'
import { OverflowCarouselText } from '../arena/OverflowCarouselText'

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
    const resized = resizeBox(shape, info)
    const gridSize = getGridSize()
    return {
      ...resized,
      props: {
        ...resized.props,
        w: snapToGrid(resized.props.w, gridSize),
        h: snapToGrid(resized.props.h, gridSize),
      }
    }
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

    // Local panel state management
    const [panelOpen, setPanelOpen] = useState(false)

    // Close panel when shape is deselected or during transformations
    useEffect(() => {
      if (!isSelected || isTransforming) {
        setPanelOpen(false)
      }
    }, [isSelected, isTransforming])

    // Bring shape to front when panel opens
    useEffect(() => {
      if (panelOpen) {
        editor.bringToFront([shape.id])
      }
    }, [panelOpen, editor, shape.id])

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
      return (details?.connections ?? []).map((c: ConnectedChannel) => ({
        id: c.id,
        title: c.title || c.slug,
        slug: c.slug,
        author: c.author?.full_name || c.author?.username,
        blockCount: c.length,
      }))
    }, [details?.connections])

    const handleTextWheelCapture = useCallback((e: ReactWheelEvent<HTMLDivElement>) => {
      if (e.ctrlKey) return
      e.stopPropagation()
    }, [])

    const handleSelectChannel = useCallback(
      (slug: string) => {
        if (!slug) return
        const newId = createShapeId()
        const gridSize = getGridSize()
        const gap = snapToGrid(8, gridSize)
        const newW = snapToGrid(shape.props.w, gridSize)
        const newH = snapToGrid(shape.props.h, gridSize)
        const x0 = snapToGrid(shape.x + newW + gap, gridSize)
        const y0 = snapToGrid(shape.y, gridSize)
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

    const textTypography = useMemo(() => computeResponsiveFont({ width: w, height: h }), [w, h])

    return (
      <HTMLContainer
        style={{
          pointerEvents: 'all',
          width: w,
          height: h,
          background: '#fff',
          border: '1px solid rgba(0,0,0,.05)',
          boxShadow: isSelected ? '0 4px 12px rgba(0,0,0,.04)' : 'none',
          borderRadius: CARD_BORDER_RADIUS,
          transition: 'box-shadow 0.2s ease-in-out',
          overflow: 'visible',
          display: 'flex',
          flexDirection: 'column',
          visibility: hidden ? 'hidden' : 'visible',
        }}
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          // Set selection to this shape
          editor.setSelectedShapes([shape.id])
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          // Set selection to this shape
          editor.setSelectedShapes([shape.id])
          // Always open panel since this shape is now the only selected one
          setPanelOpen(true)
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            borderRadius: CARD_BORDER_RADIUS,
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
            <div
              style={{ padding: 12, color: 'rgba(0,0,0,.7)', fontSize: textTypography.fontSizePx, lineHeight: textTypography.lineHeight, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}
              onWheelCapture={handleTextWheelCapture}
            >
              {title ?? ''}
            </div>
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
                  onDragStart={(e) => e.preventDefault()}
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
            <div
              style={{ width: '100%', height: '100%', position: 'relative' }}
              onMouseEnter={(e) => {
                const hoverEl = e.currentTarget.querySelector('[data-interactive="media-hover"]') as HTMLElement
                if (hoverEl && url) {
                  hoverEl.style.opacity = '1'
                  hoverEl.style.background = 'rgba(255, 255, 255, 0.95)'
                  hoverEl.style.borderColor = 'rgba(229, 229, 229, 1)'
                }
              }}
              onMouseLeave={(e) => {
                const hoverEl = e.currentTarget.querySelector('[data-interactive="media-hover"]') as HTMLElement
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
                    objectFit: 'contain',
                    display: 'block'
                  }}
                  onDragStart={(e) => e.preventDefault()}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'rgba(0,0,0,.4)' }}>media</div>
              )}
              {url ? (
                <a
                  data-interactive="media-hover"
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
                  onDragStart={(e) => e.preventDefault()}
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
                    <polygon points="10,8 16,12 10,16 10,8"></polygon>
                  </svg>
                  <OverflowCarouselText
                    text={title ?? url ?? ''}
                    textStyle={{ flex: 1 }}
                  />
                </a>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Panel for shape selection */}
        {isSelected && !isTransforming && !isPointerPressed && Number.isFinite(numericId) && editor.getSelectedShapeIds().length === 1 ? (
          <ConnectionsPanel
            z={z}
            x={w + gapW + (12 / z)}
            y={(8 / z)}
            widthPx={panelPx}
            maxHeightPx={panelMaxHeightPx}
            title={details?.title || title}
            author={details?.user ? { id: (details.user as any).id, username: (details.user as any).username, full_name: (details.user as any).full_name, avatar: (details.user as any).avatar } : undefined}
            createdAt={details?.createdAt}
            updatedAt={details?.updatedAt}
            blockCount={undefined}
            loading={detailsLoading}
            error={detailsError}
            connections={memoizedConnections}
            hasMore={details?.hasMoreConnections}
            onSelectChannel={handleSelectChannel}
            editor={editor}
            defaultDimensions={{ w, h }}
            isOpen={panelOpen}
            setOpen={setPanelOpen}
          />
        ) : null}

      </HTMLContainer>
    )
  }

  override indicator(shape: ArenaBlockShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />
  }
}


