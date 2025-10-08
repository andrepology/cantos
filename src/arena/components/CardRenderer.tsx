import { useMemo, memo, useRef, useEffect, useState } from 'react'
import { computeResponsiveFont, computePackedFont, computeScaledPadding } from '../typography'

// Reusable hover link overlay component
const HoverLinkOverlay = memo(function HoverLinkOverlay({ url, title, icon }: { url: string; title: string; icon?: 'globe' | 'pdf' }) {
  return (
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
      {icon === 'pdf' ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14,2 14,8 20,8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10,9 9,9 8,9"></polyline>
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
      )}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {title}
      </span>
    </a>
  )
})

export type CardRendererProps = {
  card: any // Using any to match existing card type union
  compact: boolean
  sizeHint?: { w: number; h: number }
}

// Utility function for formatting block counts
const formatCount = (num: number): string => {
  if (num < 1000) return String(num)
  if (num < 1000000) return `${(num / 1000).toFixed(1)}k`
  return `${(num / 1000000).toFixed(1)}m`
}

// Use shared responsive font utility
const CardView = memo(function CardView({ card, compact, sizeHint }: CardRendererProps) {
  const font = useMemo(() => {
    if (!sizeHint) return { fontSizePx: 14, lineHeight: 1.5 }
    return computeResponsiveFont({ width: sizeHint.w, height: sizeHint.h, compact })
  }, [sizeHint, compact])

  // For text blocks, compute packed font to maximize density
  const packedFont = useMemo(() => {
    if (card.type !== 'text' || !sizeHint || !card.content) return null
    return computePackedFont({
      text: card.content,
      width: sizeHint.w,
      height: sizeHint.h,
      minFontSize: 6,
      maxFontSize: 32,
      // padding auto-scales based on card dimensions (omit to use scaled padding)
      lineHeight: 1.2,
    })
  }, [card.type, card.type === 'text' ? (card as any).content : null, sizeHint])

  switch (card.type) {
    case 'image':
      return <img src={card.url} alt={card.title} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
    case 'text':
      return (
        <div
          data-card-text="true"
          style={{
            padding: packedFont ? packedFont.asymmetricPadding : 16,
            color: 'rgba(0,0,0,.7)',
            fontSize: packedFont ? packedFont.fontSizePx : font.fontSizePx,
            lineHeight: packedFont ? packedFont.lineHeight : font.lineHeight,
            overflow: packedFont?.overflow ? 'auto' : 'hidden',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            hyphens: 'auto',
            flex: 1
          }}
        >
          {card.content}
        </div>
      )
    case 'link':
      return (
        <div
          style={{ width: '100%', height: '100%', position: 'relative' }}
          onMouseEnter={(e) => {
            const hoverEl = e.currentTarget.querySelector('[data-interactive="link-hover"]') as HTMLElement
            if (hoverEl && card.url) {
              hoverEl.style.opacity = '1'
              hoverEl.style.background = 'rgba(255, 255, 255, 0.95)'
              hoverEl.style.borderColor = 'rgba(229, 229, 229, 1)'
            }
          }}
          onMouseLeave={(e) => {
            const hoverEl = e.currentTarget.querySelector('[data-interactive="link-hover"]') as HTMLElement
            if (hoverEl && card.url) {
              hoverEl.style.opacity = '0'
              hoverEl.style.background = 'rgba(255, 255, 255, 0.9)'
              hoverEl.style.borderColor = '#e5e5e5'
            }
          }}
        >
          {card.imageUrl ? (
            <img
              src={card.imageUrl}
              alt={card.title}
              loading="lazy"
              decoding="async"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block'
              }}
            />
          ) : null}
          {card.url ? <HoverLinkOverlay url={card.url} title={card.title} /> : null}
        </div>
      )
    case 'media':
      return (
        <div
          style={{ width: '100%', height: '100%', position: 'relative' }}
          onMouseEnter={(e) => {
            const hoverEl = e.currentTarget.querySelector('[data-interactive="link-hover"]') as HTMLElement
            if (hoverEl && card.originalUrl) {
              hoverEl.style.opacity = '1'
              hoverEl.style.background = 'rgba(255, 255, 255, 0.95)'
              hoverEl.style.borderColor = 'rgba(229, 229, 229, 1)'
            }
          }}
          onMouseLeave={(e) => {
            const hoverEl = e.currentTarget.querySelector('[data-interactive="link-hover"]') as HTMLElement
            if (hoverEl && card.originalUrl) {
              hoverEl.style.opacity = '0'
              hoverEl.style.background = 'rgba(255, 255, 255, 0.9)'
              hoverEl.style.borderColor = '#e5e5e5'
            }
          }}
        >
          {card.thumbnailUrl ? (
            <img
              src={card.thumbnailUrl}
              alt={card.title}
              loading="lazy"
              decoding="async"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block'
              }}
            />
          ) : (
            <div style={{
              width: '100%',
              height: '100%',
              background: 'rgba(0,0,0,.05)',
              display: 'grid',
              placeItems: 'center',
              color: 'rgba(0,0,0,.4)',
              fontSize: 14
            }}>
              {card.provider || 'Media'}
            </div>
          )}
          {card.originalUrl ? <HoverLinkOverlay url={card.originalUrl} title={card.title} /> : null}
        </div>
      )
    case 'pdf':
      return (
        <div
          style={{ width: '100%', height: '100%', position: 'relative' }}
          onMouseEnter={(e) => {
            const hoverEl = e.currentTarget.querySelector('[data-interactive="link-hover"]') as HTMLElement
            if (hoverEl && card.url) {
              hoverEl.style.opacity = '1'
              hoverEl.style.background = 'rgba(255, 255, 255, 0.95)'
              hoverEl.style.borderColor = 'rgba(229, 229, 229, 1)'
            }
          }}
          onMouseLeave={(e) => {
            const hoverEl = e.currentTarget.querySelector('[data-interactive="link-hover"]') as HTMLElement
            if (hoverEl && card.url) {
              hoverEl.style.opacity = '0'
              hoverEl.style.background = 'rgba(255, 255, 255, 0.9)'
              hoverEl.style.borderColor = '#e5e5e5'
            }
          }}
        >
          {card.thumbnailUrl ? (
            <img
              src={card.thumbnailUrl}
              alt={card.title}
              loading="lazy"
              decoding="async"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block'
              }}
            />
          ) : (
            <div style={{
              width: '100%',
              height: '100%',
              background: 'rgba(0,0,0,.05)',
              display: 'grid',
              placeItems: 'center',
              color: 'rgba(0,0,0,.4)',
              fontSize: 14,
              padding: 8,
              textAlign: 'center'
            }}>
              <div>📄</div>
              <div>PDF</div>
              {card.fileSize && <div style={{ fontSize: 11, marginTop: 4 }}>{card.fileSize}</div>}
            </div>
          )}
          {card.url ? <HoverLinkOverlay url={card.url} title={card.title} icon="pdf" /> : null}
        </div>
      )
    default: {
      // Fallback renderer. Also handles 'channel' cards not included in older unions.
      if (card?.type === 'channel') {
        const [hovered, setHovered] = useState(false)
        const baseTypo = useMemo(() => sizeHint ? computeResponsiveFont({ width: sizeHint.w, height: sizeHint.h, compact }) : { fontSizePx: 14, lineHeight: 1.45 }, [sizeHint, compact])
        // Use responsive font computation for title instead of simple multiplication
        const titleTypo = useMemo(() => sizeHint ? computeResponsiveFont({
          width: sizeHint.w,
          height: sizeHint.h,
          compact,
          minPx: 7,
          maxPx: 28,
          slopeK: 0.050 // Slightly steeper slope for titles
        }) : { fontSizePx: 18, lineHeight: 1.4 }, [sizeHint, compact])
        const titleSize = titleTypo.fontSizePx
        const metaTypo = useMemo(() => sizeHint ? computeResponsiveFont({ width: sizeHint.w, height: sizeHint.h, compact, minPx: 8, maxPx: 16, slopeK: 0.030 }) : { fontSizePx: 11, lineHeight: 1.35 }, [sizeHint, compact])
        const authorName = card?.user?.full_name || card?.user?.username || ''
        const blocks = card?.length as number | undefined
        const updatedAt = card?.updatedAt as string | undefined

        // Compute responsive padding for metadata positioning (not content centering)
        const metadataPadding = useMemo(() => sizeHint ? computeScaledPadding(sizeHint.w, sizeHint.h, 8, 16) : 12, [sizeHint])
        // Compute responsive horizontal padding for content to prevent tight edges
        const contentPadding = useMemo(() => sizeHint ? computeScaledPadding(sizeHint.w, sizeHint.h, 6, 20) : 12, [sizeHint])

        const updatedAgo = useMemo(() => {
          if (!updatedAt) return null
          const d = Date.parse(updatedAt)
          if (Number.isNaN(d)) return null
          const diffMs = Date.now() - d
          const mins = Math.floor(diffMs / 60000)
          if (mins < 60) return `${mins}m ago`
          const hours = Math.floor(mins / 60)
          if (hours < 24) return `${hours}h ago`
          const days = Math.floor(hours / 24)
          if (days < 7) return `${days}d ago`
          const weeks = Math.floor(days / 7)
          if (weeks < 4) return `${weeks}w ago`
          const months = Math.floor(days / 30)
          if (months < 12) return `${months}mo ago`
          const years = Math.floor(days / 365)
          return `${years}y ago`
        }, [updatedAt])

        return (
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 8,
              position: 'relative',
              display: 'grid',
              placeItems: 'center',
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', maxWidth: '100%', width: '100%', paddingLeft: contentPadding, paddingRight: contentPadding }}>
              <div style={{ fontSize: titleSize, lineHeight: titleTypo.lineHeight, fontWeight: 700, color: 'rgba(0,0,0,.86)', overflow: 'hidden', overflowWrap: 'break-word' }}>
                {card.title}
              </div>
              {!compact && authorName ? <div style={{ fontSize: metaTypo.fontSizePx, lineHeight: metaTypo.lineHeight, color: 'rgba(0,0,0,.6)', marginTop: 4 }}>by {authorName}</div> : null}
            </div>

            {/* Absolutely positioned metadata, time on left, count on right, visible on hover */}
            {!compact && (blocks !== undefined || updatedAgo) ? (
              <>
                {updatedAgo ? (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: metadataPadding,
                      left: metadataPadding,
                      fontSize: Math.max(9, metaTypo.fontSizePx - 2),
                      color: 'rgba(0,0,0,.5)',
                      lineHeight: 1.2,
                      opacity: hovered ? 1 : 0,
                      transition: 'opacity 0.2s ease',
                      pointerEvents: 'none'
                    }}
                  >
                    {updatedAgo}
                  </div>
                ) : null}
                {typeof blocks === 'number' ? (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: metadataPadding,
                      right: metadataPadding,
                      width: 20,
                      height: 20,
                      background: 'rgba(0,0,0,.08)',
                      color: 'rgba(0,0,0,.7)',
                      borderRadius: '50%',
                      fontSize: 8,
                      fontWeight: 500,
                      lineHeight: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                      opacity: hovered ? 1 : 0,
                      transition: 'opacity 0.2s ease',
                      pointerEvents: 'none'
                    }}
                  >
                    {formatCount(blocks)}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        )
      }
      return null
    }
  }
})


export { CardView }
