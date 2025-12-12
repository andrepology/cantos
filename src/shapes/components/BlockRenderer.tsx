/**
 * BlockRenderer - Renders Arena block content with card styling.
 * 
 * Clean, minimal renderer for Tactile system. No event handlers (TactileCard handles interaction),
 * no data-* attributes (no DOM-based drag), just content rendering.
 * 
 * Zoom-aware: Text scales inversely with TLDraw zoom to remain readable at all zoom levels.
 */

import { memo, useMemo, useState, useEffect } from 'react'
import { motion, useMotionValue } from 'motion/react'
import { useEditor, useValue } from 'tldraw'
import type { Card } from '../../arena/types'
import { CARD_BACKGROUND, CARD_BORDER_RADIUS, CARD_SHADOW } from '../../arena/constants'
import { decodeHtmlEntities } from '../../arena/dom'
import { ScrollFade } from './ScrollFade'

export interface BlockRendererProps {
  card: Card
}



// Format block count (1234 -> "1.2k")
const formatCount = (n: number) => n < 1000 ? String(n) : n < 1000000 ? `${(n / 1000).toFixed(1)}k` : `${(n / 1000000).toFixed(1)}m`

export const BlockRenderer = memo(function BlockRenderer({ card }: BlockRendererProps) {
  const editor = useEditor()
  
  // Track zoom reactively and clamp to readable range (0.8–1.4)
  const zoomRaw = useValue('cameraZoom', () => editor.getCamera().z, [editor]) || 1
  const zoomClamped = Math.min(1.4, Math.max(0.8, zoomRaw))
  
  // Create inverse scale motion value for text zoom-awareness
  const textScale = useMotionValue(1 / zoomClamped)
  useEffect(() => {
    textScale.set(1 / zoomClamped)
  }, [textScale, zoomClamped])
  
  // Typography (stable to avoid morph flashes)
  const textFont = useMemo(() => ({ fontSize: 8, lineHeight: 1.7 }), [])
  const textPadding = useMemo(() => 16, [])
  const decodedContent = useMemo(() => {
    if (card.type !== 'text' || !(card as any).content) return null
    return decodeHtmlEntities((card as any).content)
  }, [card.type, card.type === 'text' ? (card as any).content : null])

  // Card wrapper with styling
  const cardStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    background: CARD_BACKGROUND,
    borderRadius: CARD_BORDER_RADIUS,
    boxShadow: CARD_SHADOW,
    overflow: 'hidden',
    display: 'flex',
    alignItems: card.type === 'text' ? 'flex-start' : 'center',
    justifyContent: card.type === 'text' ? 'flex-start' : 'center',
  }
  
  // Render based on type
  const renderContent = () => {
    switch (card.type) {
      case 'image':
        return (
          <img
            src={(card as any).url}
            alt={card.title}
            loading="lazy"
            decoding="async"
            draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        )
        
      case 'text':
        return (
          <motion.div
            style={{
              scale: textScale,
              transformOrigin: 'top left',
              width: '100%',
              height: '100%',
            }}
          >
            <ScrollFade
              style={{
                width: '100%',
                height: '100%',
                padding: textPadding,
                color: 'rgba(0,0,0,.7)',
                fontSize: textFont.fontSize,
                lineHeight: textFont.lineHeight,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                hyphens: 'auto',
                boxSizing: 'border-box',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start'
              }}
            >
              {decodedContent}
            </ScrollFade>
          </motion.div>
        )
        
      case 'link': {
        const thumb = (card as any).thumbnailUrl ?? (card as any).imageUrl
        return (
          <HoverContainer overlayUrl={(card as any).url} overlayTitle={card.title}>
            {thumb ? (
              <img
                src={thumb}
                alt={card.title}
                loading="lazy"
                decoding="async"
                draggable={false}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', background: 'rgba(0,0,0,.03)', display: 'grid', placeItems: 'center', color: 'rgba(0,0,0,.4)', fontSize: 12 }}>
                {(card as any).provider || 'Link'}
              </div>
            )}
          </HoverContainer>
        )
      }
        
      case 'media':
        return (
          <HoverContainer overlayUrl={(card as any).originalUrl} overlayTitle={card.title}>
            {(card as any).thumbnailUrl ? (
              <img
                src={(card as any).thumbnailUrl}
                alt={card.title}
                loading="lazy"
                decoding="async"
                draggable={false}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', background: 'rgba(0,0,0,.03)', display: 'grid', placeItems: 'center', color: 'rgba(0,0,0,.4)', fontSize: 12 }}>
                {(card as any).provider || 'Media'}
              </div>
            )}
          </HoverContainer>
        )
        
      case 'pdf':
        return (
          <HoverContainer overlayUrl={(card as any).url} overlayTitle={card.title} overlayIcon="pdf">
            {(card as any).thumbnailUrl ? (
              <img
                src={(card as any).thumbnailUrl}
                alt={card.title}
                loading="lazy"
                decoding="async"
                draggable={false}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', background: 'rgba(0,0,0,.03)', display: 'grid', placeItems: 'center', color: 'rgba(0,0,0,.4)', fontSize: 12, textAlign: 'center' }}>
                <div>📄 PDF</div>
              </div>
            )}
          </HoverContainer>
        )
        
      case 'channel':
        return <ChannelContent card={card} textScale={textScale} />
        
      default:
        return null
    }
  }
  
  return <div style={cardStyle}>{renderContent()}</div>
})


// Hover overlay for links/media/pdf
const LinkOverlay = memo(function LinkOverlay({ url, title, icon }: { url: string; title: string; icon?: 'pdf' }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      data-interactive="link-hover"
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); window.open(url, '_blank', 'noopener,noreferrer') }}
      onPointerDown={(e) => e.stopPropagation()}
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
        transition: 'opacity 0.2s ease',
        pointerEvents: 'auto',
        textDecoration: 'none'
      }}
    >
      {icon === 'pdf' ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14,2 14,8 20,8" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      )}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
    </a>
  )
})

// Container for link/media/pdf with hover behavior (simple state, no DOM queries)
const HoverContainer = memo(function HoverContainer({
  children,
  overlayUrl,
  overlayTitle,
  overlayIcon,
}: {
  children: React.ReactNode
  overlayUrl?: string
  overlayTitle?: string
  overlayIcon?: 'pdf'
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
      {overlayUrl && overlayTitle ? (
        <div style={{ position: 'absolute', inset: 0, opacity: hovered ? 1 : 0, transition: 'opacity 0.15s ease', pointerEvents: hovered ? 'auto' : 'none' }}>
          <LinkOverlay url={overlayUrl} title={overlayTitle} icon={overlayIcon} />
        </div>
      ) : null}
    </div>
  )
})

// Separate component for channel to handle hover state
const ChannelContent = memo(function ChannelContent({ card, textScale }: { card: Card; textScale: any }) {
  const [hovered, setHovered] = useState(false)
  const titleFont = useMemo(() => 10, [])
  const titleLineHeight = useMemo(() => 1.35, [])
  const metaFont = useMemo(() => 8, [])
  const metaPadding = useMemo(() => 20, [])
  const contentPadding = useMemo(() => 20, [])
  
  const authorName = (card as any).user?.fullName || (card as any).user?.full_name || (card as any).user?.username || ''
  const blocks = (card as any).length as number | undefined
  const updatedAt = (card as any).updatedAt as string | undefined
  
  const updatedAgo = useMemo(() => {
    if (!updatedAt) return null
    const diffMs = Date.now() - Date.parse(updatedAt)
    if (Number.isNaN(diffMs)) return null
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
    return `${Math.floor(days / 365)}y ago`
  }, [updatedAt])
  
  return (
    <div
      style={{ width: '100%', height: '100%', position: 'relative', display: 'grid', placeItems: 'center' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <motion.div
        style={{
          scale: textScale,
          transformOrigin: 'center center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          paddingLeft: contentPadding,
          paddingRight: contentPadding,
        }}
      >
        <div style={{ fontSize: titleFont, lineHeight: titleLineHeight, fontWeight: 700, color: 'rgba(0,0,0,.86)', overflowWrap: 'break-word' }}>
          {card.title}
        </div>
        {authorName && (
          <>
            <div style={{ fontSize: metaFont, color: 'rgba(0,0,0,.6)', marginTop: 4 }}>by</div>
            <div style={{ fontSize: metaFont, color: 'rgba(0,0,0,.6)', marginTop: 4 }}>{authorName}</div>
          </>
        )}
      </motion.div>
      
      {/* Hover metadata */}
      <>
        {updatedAgo && (
          <div style={{ position: 'absolute', bottom: metaPadding, left: metaPadding, fontSize: Math.max(9, metaFont - 2), color: 'rgba(0,0,0,.5)', opacity: hovered ? 1 : 0, transition: 'opacity 0.2s' }}>
            {updatedAgo}
          </div>
        )}
        {typeof blocks === 'number' && (
          <div style={{ position: 'absolute', bottom: metaPadding, right: metaPadding, fontSize: Math.max(9, metaFont - 2), fontWeight: 500, color: 'rgba(0,0,0,.7)', opacity: hovered ? 1 : 0, transition: 'opacity 0.2s' }}>
            {formatCount(blocks)}
          </div>
        )}
      </>
    </div>
  )
})
