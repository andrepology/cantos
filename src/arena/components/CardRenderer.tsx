import { useMemo, memo, useRef, useEffect } from 'react'
import { computeResponsiveFont } from '../typography'

export type CardRendererProps = {
  card: any // Using any to match existing card type union
  compact: boolean
  sizeHint?: { w: number; h: number }
}

// Use shared responsive font utility
const CardView = memo(function CardView({ card, compact, sizeHint }: CardRendererProps) {
  const font = useMemo(() => {
    if (!sizeHint) return { fontSizePx: 14, lineHeight: 1.5 }
    return computeResponsiveFont({ width: sizeHint.w, height: sizeHint.h, compact })
  }, [sizeHint, compact])

  switch (card.type) {
    case 'image':
      return <img src={card.url} alt={card.title} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
    case 'text':
      return (
        <div data-card-text="true" style={{ padding: 16, color: 'rgba(0,0,0,.7)', fontSize: font.fontSizePx, lineHeight: font.lineHeight, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}>
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
          {card.url ? (
            <a
              data-interactive="link-hover"
              href={card.url}
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
                window.open(card.url, '_blank', 'noopener,noreferrer')
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
                {card.title}
              </span>
            </a>
          ) : null}
        </div>
      )
    case 'media':
      return card.embedHtml ? (
        <MemoEmbed html={card.embedHtml} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'rgba(0,0,0,.4)' }}>media</div>
      )
    default: {
      // Fallback renderer. Also handles 'channel' cards not included in older unions.
      if (card?.type === 'channel') {
        const baseTypo = sizeHint ? computeResponsiveFont({ width: sizeHint.w, height: sizeHint.h, compact }) : { fontSizePx: 14, lineHeight: 1.45 }
        const titleSize = Math.round(baseTypo.fontSizePx * 1.25)
        const metaSize = Math.max(11, Math.round(baseTypo.fontSizePx * 0.9))
        const authorName = card?.user?.full_name || card?.user?.username || ''
        const blocks = card?.length as number | undefined
        const updatedAt = card?.updatedAt as string | undefined

        const updatedAgo = (() => {
          if (!updatedAt) return null
          const d = Date.parse(updatedAt)
          if (Number.isNaN(d)) return null
          const diffMs = Date.now() - d
          const mins = Math.floor(diffMs / 60000)
          if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`
          const hours = Math.floor(mins / 60)
          if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
          const days = Math.floor(hours / 24)
          return `about ${days} day${days === 1 ? '' : 's'} ago`
        })()

        return (
          <div style={{ width: '100%', height: '100%', borderRadius: 8, display: 'grid', placeItems: 'center', padding: 12 }}>
            <div style={{ textAlign: 'center', maxWidth: '100%', width: '100%' }}>
              <div style={{ fontSize: titleSize, lineHeight: baseTypo.lineHeight, fontWeight: 700, color: 'rgba(0,0,0,.86)', marginBottom: compact ? 0 : 4, overflow: 'hidden', wordBreak: 'break-word' }}>
                {card.title}
              </div>
              {!compact && authorName ? <div style={{ fontSize: metaSize, lineHeight: 1.35, color: 'rgba(0,0,0,.6)', marginBottom: 6 }}>by {authorName}</div> : null}
              {!compact ? (
                <div style={{ fontSize: metaSize, lineHeight: 1.35, color: 'rgba(0,0,0,.55)' }}>
                  {typeof blocks === 'number' ? `${blocks} block${blocks === 1 ? '' : 's'}` : '—'}
                  {updatedAgo ? <span> • {updatedAgo}</span> : null}
                </div>
              ) : null}
            </div>
          </div>
        )
      }
      return null
    }
  }
})

// Memoized embed component for media cards
const MemoEmbed = memo(function MemoEmbedInner({ html }: { html: string }) {
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

      // Allow common features used by providers like YouTube/Vimeo to avoid
      // noisy "Potential permissions policy violation" warnings in devtools.
      // Note: Top-level HTTP headers can still override this. This just grants
      // permission from our embedding document to the iframe.
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
        // Reduce referrer leakage; optional but good hygiene for embeds
        if (!fr.getAttribute('referrerpolicy')) fr.setAttribute('referrerpolicy', 'origin-when-cross-origin')
      } catch {}
    })
  }, [html])
  return <div ref={ref} style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }} dangerouslySetInnerHTML={{ __html: html }} />
})

export { CardView }
