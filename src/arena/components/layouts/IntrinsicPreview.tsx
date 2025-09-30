import { memo } from 'react'
import type { Card } from '../../types'

export interface IntrinsicPreviewProps {
  card: Card
  mode: 'row' | 'column' | 'square'
  onLoad?: () => void
}

const IntrinsicPreview = memo(function IntrinsicPreview({ card, mode, onLoad }: IntrinsicPreviewProps) {
  const imgSrc = card.type === 'image' ? (card as any).url : card.type === 'link' ? (card as any).imageUrl : (card as any).thumbnailUrl
  if (!imgSrc) return null

  return (
    <img
      src={imgSrc}
      alt={card.title}
      loading="lazy"
      decoding="async"
      onLoad={onLoad}
      style={
        mode === 'square'
          ? {
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
              boxShadow: '0 6px 18px rgba(0,0,0,.08)',
              borderRadius: 8,
              background: 'transparent',
            }
          : mode === 'row'
          ? { height: '100%', width: 'auto', objectFit: 'contain', display: 'block' }
          : { width: '100%', height: 'auto', objectFit: 'contain', display: 'block' }
      }
    />
  )
})

export { IntrinsicPreview }
