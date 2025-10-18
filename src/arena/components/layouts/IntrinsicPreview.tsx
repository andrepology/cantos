import { memo } from 'react'
import type { Card } from '../../types'
import { CARD_BORDER_RADIUS, CARD_SHADOW } from '../../constants'

export interface IntrinsicPreviewProps {
  card: Card
  mode: 'row' | 'column' | 'square'
  // Optional interaction props for drag and drop
  dataInteractive?: string
  dataCardId?: string
  dataCardType?: string
  dataCardTitle?: string
  dataChannelSlug?: string
  dataChannelAuthor?: string
  dataChannelUpdatedAt?: string
  dataChannelBlockCount?: string
  dataImageUrl?: string
  dataUrl?: string
  dataContent?: string
  dataEmbedHtml?: string
  dataThumbnailUrl?: string
  dataOriginalUrl?: string
  onMouseEnter?: (e: React.MouseEvent) => void
  onMouseLeave?: (e: React.MouseEvent) => void
  onContextMenu?: (e: React.MouseEvent) => void
  onPointerDown?: (e: React.PointerEvent) => void
  onPointerMove?: (e: React.PointerEvent) => void
  onPointerUp?: (e: React.PointerEvent) => void
  onClick?: (e: React.MouseEvent | React.PointerEvent) => void
}

const IntrinsicPreview = memo(function IntrinsicPreview({
  card,
  mode,
  dataInteractive,
  dataCardId,
  dataCardType,
  dataCardTitle,
  dataChannelSlug,
  dataChannelAuthor,
  dataChannelUpdatedAt,
  dataChannelBlockCount,
  dataImageUrl,
  dataUrl,
  dataContent,
  dataEmbedHtml,
  dataThumbnailUrl,
  dataOriginalUrl,
  onMouseEnter,
  onMouseLeave,
  onContextMenu,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onClick
}: IntrinsicPreviewProps) {
  const imgSrc = card.type === 'image' ? (card as any).url : card.type === 'link' ? (card as any).imageUrl : (card as any).thumbnailUrl
  if (!imgSrc) return null

  return (
    <img
      src={imgSrc}
      alt={card.title}
      loading="lazy"
      decoding="async"
      data-interactive={dataInteractive}
      data-card-id={dataCardId}
      data-card-type={dataCardType}
      data-card-title={dataCardTitle}
      data-channel-slug={dataChannelSlug}
      data-channel-author={dataChannelAuthor}
      data-channel-updated-at={dataChannelUpdatedAt}
      data-channel-block-count={dataChannelBlockCount}
      data-image-url={dataImageUrl}
      data-url={dataUrl}
      data-content={dataContent}
      data-embed-html={dataEmbedHtml}
      data-thumbnail-url={dataThumbnailUrl}
      data-original-url={dataOriginalUrl}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={onClick}
      style={
        mode === 'square'
          ? {
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
              boxShadow: CARD_SHADOW,
              borderRadius: CARD_BORDER_RADIUS,
              background: 'transparent',
            }
          : mode === 'row'
          ? {
              height: '100%',
              width: 'auto',
              objectFit: 'contain',
              display: 'block',
              boxShadow: CARD_SHADOW,
              borderRadius: CARD_BORDER_RADIUS,
            }
          : {
              width: '100%',
              height: 'auto',
              objectFit: 'contain',
              display: 'block',
              boxShadow: CARD_SHADOW,
              borderRadius: CARD_BORDER_RADIUS,
            }
      }
    />
  )
})

export { IntrinsicPreview }
