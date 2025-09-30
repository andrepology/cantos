import { memo } from 'react'
import type { Card } from '../../types'

export interface IntrinsicPreviewProps {
  card: Card
  mode: 'row' | 'column'
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
        mode === 'row'
          ? { height: '100%', width: 'auto', objectFit: 'contain', display: 'block' }
          : { width: '100%', height: 'auto', objectFit: 'contain', display: 'block' }
      }
    />
  )
})

export { IntrinsicPreview }
