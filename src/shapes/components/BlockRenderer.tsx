/**
 * BlockRenderer - Renders Arena block content with card styling.
 * 
 * Clean, minimal renderer for Tactile system. No event handlers (TactileCard handles interaction),
 * no data-* attributes (no DOM-based drag), just content rendering.
 */

import { memo, useMemo, useState, useEffect } from 'react'
import { motion, useMotionValue, useTransform, type MotionValue } from 'motion/react'
import { 
  CARD_BACKGROUND, 
  CARD_BORDER_RADIUS, 
  CARD_SHADOW,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_TERTIARY,
  WASH,
  DESIGN_TOKENS
} from '../../arena/constants'
import { getFluidFontSize, getFluidPadding } from '../../arena/typography'
import { decodeHtmlEntities } from '../../arena/dom'
import { ScrollFade } from './ScrollFade'
import { recordRender } from '../../arena/renderCounts'
import { OverflowCarouselText } from '../../arena/OverflowCarouselText'
import type { LoadedArenaBlock } from '../../jazz/schema'

export interface BlockRendererProps {
  block: LoadedArenaBlock
  focusState?: 'deck' | 'card'
  ownerId?: string
  width?: number | MotionValue<number>
  height?: number | MotionValue<number>
}

const TEXT_BASE_STYLE: React.CSSProperties = {
  lineHeight: 1.5,
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
  whiteSpace: 'pre-wrap',
  
  fontFamily: 'ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, serif',
  letterSpacing: '-0.01em',
  fontWeight: 400,
  textRendering: 'optimizeLegibility',
  WebkitFontSmoothing: 'antialiased',
  fontFeatureSettings: '"kern", "liga", "clig", "calt"',
}
const TEXT_TRANSITION = 'padding 220ms ease, color 220ms ease, letter-spacing 220ms ease'

// Format block count (1234 -> "1.2k")
const formatCount = (n: number) => n < 1000 ? String(n) : n < 1000000 ? `${(n / 1000).toFixed(1)}k` : `${(n / 1000000).toFixed(1)}m`

export const BlockRenderer = memo(function BlockRenderer({ block, focusState, ownerId, width, height }: BlockRendererProps) {
  recordRender('BlockRenderer')
  recordRender(`BlockRenderer:${ownerId ?? 'unknown'}:${block.type}`)
  
  const isFocusedBlock = focusState === 'card'
  const isDeckFocusMode = Boolean(focusState)
  const isTextBlock = block.type === 'text'
  const shouldTypesetText = isTextBlock
  const textContent = block.type === 'text' ? block.content : null

  // Use fluid typography for cleaner scaling
  const fluidFontSize = useMemo(() => getFluidFontSize(8, 24, 120, 800), [])
  const fluidPadding = useMemo(() => getFluidPadding(16, 24, 120, 256), [])

  const decodedContent = useMemo(() => {
    if (!textContent) return null
    return decodeHtmlEntities(textContent)
  }, [textContent])

  // Card wrapper with styling
  const cardStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    background: isDeckFocusMode ? 'transparent' : CARD_BACKGROUND,
    borderRadius: CARD_BORDER_RADIUS,
    boxShadow: isDeckFocusMode ? 'none' : CARD_SHADOW,
    overflow: 'hidden',
    display: 'flex',
    alignItems: block.type === 'text' ? 'flex-start' : 'center',
    justifyContent: block.type === 'text' ? 'flex-start' : 'center',
    transition: 'background 220ms ease, box-shadow 220ms ease',
  }
  
  // Render based on type
  const renderContent = () => {
    switch (block.type) {
      case 'image': {
        const thumbSrc = block.thumbUrl ?? block.displayUrl ?? block.largeUrl ?? null
        return (
          <ProgressiveBlockImage
            title={block.title}
            thumbSrc={thumbSrc}
            largeSrc={block.largeUrl ?? null}
            isFocused={isFocusedBlock}
          />
        )
      }
        
      case 'text':
        return (
          <div
            style={{
              width: '100%',
              height: '100%',
              containerType: 'size'
            }}
          >
            <ScrollFade
              dataCardText
              stopWheelPropagation
              style={{
                width: '100%',
                height: '100%',
                padding: fluidPadding,
                color: TEXT_PRIMARY,
                transition: TEXT_TRANSITION,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                hyphens: 'auto',
                boxSizing: 'border-box',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                ...TEXT_BASE_STYLE,
                fontSize: fluidFontSize,
                containerType: 'size',
              }}
            >
              {decodedContent}
            </ScrollFade>
          </div>
        )
        
      case 'link': {
        // Use thumbUrl first to match measurement URL (avoids cache miss / white flash)
        const thumb = block.thumbUrl ?? block.displayUrl
        const linkUrl = block.originalFileUrl ?? block.displayUrl
        return (
          <HoverContainer overlayUrl={linkUrl} overlayTitle={block.title}>
            {thumb ? (
              <img
                src={thumb}
                alt={block.title}
                loading="lazy"
                decoding="async"
                draggable={false}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', background: WASH, display: 'grid', placeItems: 'center', color: TEXT_SECONDARY, fontSize: 12 }}>
                {block.provider || 'Link'}
              </div>
            )}
          </HoverContainer>
        )
      }
        
      case 'media': {
        // Use thumbUrl first to match measurement URL (avoids cache miss / white flash)
        const mediaThumb = block.thumbUrl ?? block.displayUrl
        return (
          <HoverContainer overlayUrl={block.originalFileUrl} overlayTitle={block.title}>
            {mediaThumb ? (
              <img
                src={mediaThumb}
                alt={block.title}
                loading="lazy"
                decoding="async"
                draggable={false}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', background: WASH, display: 'grid', placeItems: 'center', color: TEXT_SECONDARY, fontSize: 12 }}>
                {block.provider || 'Media'}
              </div>
            )}
          </HoverContainer>
        )
      }
        
      case 'pdf': {
        // Use thumbUrl first to match measurement URL (avoids cache miss / white flash)
        const pdfThumb = block.thumbUrl ?? block.displayUrl
        return (
          <HoverContainer overlayUrl={block.originalFileUrl} overlayTitle={block.title} overlayIcon="pdf">
            {pdfThumb ? (
              <img
                src={pdfThumb}
                alt={block.title}
                loading="lazy"
                decoding="async"
                draggable={false}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', background: WASH, display: 'grid', placeItems: 'center', color: TEXT_SECONDARY, fontSize: 12, textAlign: 'center' }}>
                {block.provider || 'PDF'}
                <div>📄 PDF</div>
              </div>
            )}
          </HoverContainer>
        )
      }
        
      case 'channel':
        return <ChannelContent block={block} width={width} height={height} />
        
      default:
        return null
    }
  }
  
  return <div style={cardStyle}>{renderContent()}</div>
})

const ProgressiveBlockImage = memo(function ProgressiveBlockImage({
  title,
  thumbSrc,
  largeSrc,
  isFocused,
}: {
  title?: string | null
  thumbSrc: string | null
  largeSrc: string | null
  isFocused: boolean
}) {
  const [largeReady, setLargeReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!isFocused || !largeSrc || largeSrc === thumbSrc) {
      setLargeReady(false)
      return
    }

    const img = new Image()
    const finish = () => {
      if (!cancelled) setLargeReady(true)
    }
    img.onload = finish
    img.onerror = finish
    img.src = largeSrc
    if (typeof img.decode === 'function') {
      img.decode().then(finish).catch(finish)
    }
    return () => {
      cancelled = true
    }
  }, [isFocused, thumbSrc, largeSrc])

  const showLarge = Boolean(isFocused && largeReady && largeSrc && largeSrc !== thumbSrc)
  const baseSrc = thumbSrc ?? largeSrc ?? ''
  
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: WASH }}>
      <img
        src={baseSrc}
        alt={title ?? undefined}
        loading="lazy"
        decoding="async"
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          position: 'absolute',
          inset: 0,
          opacity: 1,
        }}
      />
      {largeSrc && largeSrc !== thumbSrc ? (
        <img
          src={largeSrc}
          alt={title ?? undefined}
          loading="lazy"
          decoding="async"
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            position: 'absolute',
            inset: 0,
            opacity: showLarge ? 1 : 0,
            transition: 'opacity 160ms ease',
          }}
        />
      ) : null}
    </div>
  )
})

// Hover overlay for links/media/pdf
export const LinkOverlay = memo(function LinkOverlay({ url, title, icon }: { url: string; title: string; icon?: 'pdf' }) {
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
        background: CARD_BACKGROUND,
        border: `1px solid ${DESIGN_TOKENS.colors.border}`,
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        cursor: 'pointer',
        fontSize: 11,
        color: TEXT_PRIMARY,
        gap: 6,
        transition: 'opacity 0.2s ease',
        pointerEvents: 'auto',
        textDecoration: 'none'
      }}
    >
      {icon === 'pdf' ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14,2 14,8 20,8" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      )}
      <OverflowCarouselText
        text={title}
        maxWidthPx={500}
        speedPxPerSec={30}
        className="flex-1 min-w-0"
        textStyle={{ 
          fontSize: 11,
          color: TEXT_PRIMARY,
          fontWeight: 400
        }}
      />
    </a>
  )
})

// Container for link/media/pdf with hover behavior (simple state, no DOM queries)
export const HoverContainer = memo(function HoverContainer({
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
        <div style={{ position: 'absolute', inset: 0, opacity: hovered ? 1 : 0, transition: 'opacity 0.15s ease', pointerEvents: 'none' }}>
          <LinkOverlay url={overlayUrl} title={overlayTitle} icon={overlayIcon} />
        </div>
      ) : null}
    </div>
  )
})

// Separate component for channel to handle hover state
const ChannelContent = memo(function ChannelContent({ 
  block, 
  width, 
  height 
}: { 
  block: LoadedArenaBlock; 
  width?: number | MotionValue<number>; 
  height?: number | MotionValue<number>; 
}) {
  const [hovered, setHovered] = useState(false)
  
  // Design system for the "canonical" 200x200 card
  const REFERENCE_SIZE = 200

  // Normalize width/height to motion values
  const wMv = useMotionValue(200)
  const hMv = useMotionValue(200)

  useEffect(() => {
    if (typeof width === 'number') wMv.set(width)
    else if (width === undefined) wMv.set(200)
  }, [width, wMv])

  useEffect(() => {
    if (typeof height === 'number') hMv.set(height)
    else if (height === undefined) hMv.set(200)
  }, [height, hMv])

  const effectiveW = (width && typeof width !== 'number') ? width : wMv
  const effectiveH = (height && typeof height !== 'number') ? height : hMv

  // Compute scale: min(w, h) / 200
  const scale = useTransform([effectiveW, effectiveH], ([w, h]: any[]) => Math.min(Number(w), Number(h)) / REFERENCE_SIZE)

  // Explicitly center the content by calculating top-left offsets
  // We use top-left origin + translation to avoid grid/flex centering ambiguities with transforms
  const x = useTransform([effectiveW, effectiveH, scale], ([w, h, s]: any[]) => (Number(w) - REFERENCE_SIZE * Number(s)) / 2)
  const y = useTransform([effectiveW, effectiveH, scale], ([w, h, s]: any[]) => (Number(h) - REFERENCE_SIZE * Number(s)) / 2)

  // Fixed canonical sizes (no zoom multipliers!)
  const titleFont = 16
  const titleLineHeight = 1.3
  const metaFont = 11
  const metaPadding = 16
  const contentPadding = 24
  
  const authorName = block.user?.$isLoaded ? (block.user.fullName || block.user.username || '') : ''
  const blocks = block.length as number | undefined
  const updatedAt = block.updatedAt as string | undefined
  
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
    <motion.div
      style={{ 
        width: '100%', 
        height: '100%', 
        position: 'relative', 
        overflow: 'hidden'
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 
        The "Vector" Wrapper:
        Everything inside here is designed for a 200x200 canvas.
        The scale transform handles the visual size.
        We position it absolutely with calculated offsets to ensure perfect centering.
      */}
      <motion.div
        style={{
          width: REFERENCE_SIZE,
          height: REFERENCE_SIZE,
          position: 'absolute',
          top: 0,
          left: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          scale,
          x,
          y,
          transformOrigin: 'top left',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            padding: contentPadding,
          }}
        >
          <div style={{ 
            fontSize: titleFont, 
            lineHeight: titleLineHeight, 
            fontWeight: 700, 
            color: TEXT_PRIMARY, 
            overflowWrap: 'break-word',
            marginBottom: 8
          }}>
            {block.title}
          </div>
          {authorName && (
            <div style={{ 
              fontSize: 12, 
              color: TEXT_SECONDARY, 
              fontWeight: 400,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}>
              <span style={{ fontSize: 10, opacity: 0.8, marginBottom: 2 }}>by</span>
              <span>{authorName}</span>
            </div>
          )}
        </div>
        
        {/* Hover metadata - fixed canonical positions */}
        <>
          {updatedAgo && (
            <div style={{ 
              position: 'absolute', 
              bottom: metaPadding, 
              left: metaPadding, 
              fontSize: 10, 
              color: TEXT_SECONDARY, 
              opacity: hovered ? 1 : 0, 
              transition: 'opacity 0.2s',
              whiteSpace: 'nowrap'
            }}>
              {updatedAgo}
            </div>
          )}
          {typeof blocks === 'number' && (
            <div style={{ 
              position: 'absolute', 
              bottom: metaPadding, 
              right: metaPadding, 
              fontSize: 10, 
              fontWeight: 500, 
              color: TEXT_PRIMARY, 
              opacity: hovered ? 1 : 0, 
              transition: 'opacity 0.2s',
              background: WASH,
              padding: '2px 6px',
              borderRadius: 4
            }}>
              {formatCount(blocks)}
            </div>
          )}
        </>
      </motion.div>
    </motion.div>
  )
})
