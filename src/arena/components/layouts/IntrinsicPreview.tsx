import { memo } from 'react'
import type { Card } from '../../types'
import { CARD_BORDER_RADIUS, CARD_SHADOW } from '../../constants'

export interface IntrinsicPreviewProps {
  card: Card
  mode: 'row' | 'column' | 'square'
}

const IntrinsicPreview = memo(function IntrinsicPreview({ card, mode }: IntrinsicPreviewProps) {
  const imgSrc = card.type === 'image' ? (card as any).url : card.type === 'link' ? (card as any).imageUrl : (card as any).thumbnailUrl
  if (!imgSrc) return null

  return (
    <img
      src={imgSrc}
      alt={card.title}
      loading="lazy"
      decoding="async"
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
