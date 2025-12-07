/**
 * High-fidelity preview overlay for tiling placement.
 * Renders visual replicas of shape HTML containers at the candidate position.
 */

import { memo, useMemo } from 'react'
import type { ComputedShapeProps } from '../arena/tiling/shapeSizing'
import { CARD_BORDER_RADIUS, SHAPE_BORDER_RADIUS, SHAPE_SHADOW, PORTAL_BACKGROUND, SHAPE_BACKGROUND, TEXT_SECONDARY, CARD_SHADOW, GHOST_BACKGROUND } from '../arena/constants'
import { computeResponsiveFont, computePackedFont, computeAsymmetricTextPadding } from '../arena/typography'

export interface PreviewTileOverlayProps {
  computedProps: ComputedShapeProps | null
  opacity?: number
}

const DEFAULT_OPACITY = 0.6

/**
 * Render channel content inside the preview box.
 */
function ChannelPreviewContent({ w, h, title, authorName, opacity }: { w: number; h: number; title: string; authorName?: string; opacity: number }) {
  // Use responsive font computation for title
  const titleTypo = useMemo(() => computeResponsiveFont({
    width: w,
    height: h,
    minPx: 7,
    maxPx: 28,
    slopeK: 0.050 // Slightly steeper slope for titles
  }), [w, h])

  // Use responsive font computation for meta (author)
  const metaTypo = useMemo(() => computeResponsiveFont({
    width: w,
    height: h,
    minPx: 8,
    maxPx: 16,
    slopeK: 0.030
  }), [w, h])

  const titleSize = titleTypo.fontSizePx

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        borderRadius: SHAPE_BORDER_RADIUS,
        display: 'grid',
        placeItems: 'center',
        opacity,
        zIndex: 2, // Above background but below ghost overlay
      }}
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        maxWidth: '100%',
        width: '100%',
        paddingLeft: Math.max(6, w * 0.05), // Responsive horizontal padding
        paddingRight: Math.max(6, w * 0.05),
      }}>
        <div style={{
          fontSize: titleSize,
          lineHeight: titleTypo.lineHeight,
          fontWeight: 700,
          color: 'rgba(0,0,0,.86)',
          overflow: 'hidden',
          overflowWrap: 'break-word'
        }}>
          {title || 'Channel'}
        </div>
        {authorName && h > 60 && ( // Only show author if there's enough height
          <div style={{
            fontSize: metaTypo.fontSizePx,
            lineHeight: metaTypo.lineHeight,
            color: 'rgba(0,0,0,.6)',
            marginTop: 4
          }}>
            by {authorName}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Render a high-fidelity preview of a 3D box shape (channel or user).
 */
function ThreeDBoxPreview({ x, y, w, h, props, opacity }: { x: number; y: number; w: number; h: number; props: any; opacity: number }) {
  const cornerRadius = SHAPE_BORDER_RADIUS
  const isUser = props?.source?.kind === 'author'
  const label = isUser
    ? (props?.source?.name || 'Profile')
    : (props?.source?.slug || 'search arena')

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      {/* Label above */}
      <div
        style={{
          position: 'absolute',
          top: -24,
          left: 0,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 8,
          fontFamily: "'Alte Haas Grotesk', system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '-0.0125em',
          color: TEXT_SECONDARY,
          opacity: opacity * 0.9,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: w,
        }}
      >
        {isUser && props.userAvatar ? (
          <img
            src={props.userAvatar}
            alt=""
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              marginRight: 4,
              objectFit: 'cover'
            }}
          />
        ) : null}
        {label}
      </div>

      {/* Shadow */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0,0,0,.35)',
          borderRadius: cornerRadius,
          filter: 'blur(2px)',
          opacity: 0,
        }}
      />

      {/* Face background */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: PORTAL_BACKGROUND,
          boxShadow: SHAPE_SHADOW,
          borderRadius: cornerRadius,
          opacity,
        }}
      />

      {/* Border */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          border: '1px solid rgba(0,0,0,0.08)',
          borderRadius: cornerRadius,
          boxSizing: 'border-box',
          opacity,
        }}
      />

      {/* Channel content */}
      {props.title && (
        <ChannelPreviewContent
          w={w}
          h={h}
          title={props.title}
          authorName={props.authorName}
          opacity={opacity}
        />
      )}

      {/* Ghost preview indicator */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          border: '1px solid rgba(0,0,0,.02)',
          background: GHOST_BACKGROUND,
          boxShadow: CARD_SHADOW,
          mixBlendMode: 'normal',
          borderRadius: cornerRadius,
          boxSizing: 'border-box',
          pointerEvents: 'none',
          zIndex: 1,
          opacity: 0.7,
        }}
      />
    </div>
  )
}

/**
 * Render a high-fidelity preview of an arena block shape (image, text, link, media, pdf).
 */
function ArenaBlockPreview({ x, y, w, h, props, opacity }: { x: number; y: number; w: number; h: number; props: any; opacity: number }) {
  const cornerRadius = CARD_BORDER_RADIUS
  const { kind, title, imageUrl } = props

  // Use shared responsive font utility
  const font = useMemo(() => {
    return computeResponsiveFont({ width: w, height: h })
  }, [w, h])

  // Compute asymmetric padding for text blocks (scales with card dimensions)
  const textPadding = useMemo(() => computeAsymmetricTextPadding(w, h), [w, h])

  // For text blocks with substantial content (20+ words), compute packed font to maximize density
  // Short text falls back to responsive font to avoid billboard effect
  const packedFont = useMemo(() => {
    if (kind !== 'text' || !title || title.trim().length === 0) return null
    return computePackedFont({
      text: title,
      width: w,
      height: h,
      minFontSize: 6,
      maxFontSize: 32,
      // padding auto-scales based on card dimensions
      // lineHeight now dynamically adjusts based on font size (typographic best practice)
    })
  }, [kind, title, w, h])

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        pointerEvents: 'none',
        borderRadius: cornerRadius,
        boxShadow: SHAPE_SHADOW,
        overflow: 'hidden',
        opacity,
      }}
    >
      {/* Content container - matches ArenaBlockShape structure */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          borderRadius: cornerRadius,
          overflow: 'hidden',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {kind === 'image' && imageUrl ? (
          <img
            src={imageUrl}
            alt={title || ''}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: cornerRadius,
              display: 'block',
            }}
          />
        ) : kind === 'text' ? (
          <div
            data-card-text="true"
            style={{
              padding: textPadding,
              background: SHAPE_BACKGROUND,
              color: 'rgba(0,0,0,.7)',
              fontSize: packedFont ? packedFont.fontSizePx : font.fontSizePx,
              lineHeight: packedFont ? packedFont.lineHeight : font.lineHeight,
              overflow: packedFont?.overflow ? 'auto' : 'hidden',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              hyphens: 'auto',
              flex: 1,
              borderRadius: CARD_BORDER_RADIUS
            }}
          >
            {title}
          </div>
        ) : kind === 'link' && imageUrl ? (
          <div style={{ width: '100%', height: '100%', position: 'relative', borderRadius: cornerRadius }}>
            <img
              src={imageUrl}
              alt={title || ''}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
                borderRadius: cornerRadius,
              }}
            />
          </div>
        ) : kind === 'media' && imageUrl ? (
          <div style={{ width: '100%', height: '100%', position: 'relative', borderRadius: cornerRadius }}>
            <img
              src={imageUrl}
              alt={title || ''}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
                borderRadius: cornerRadius,
              }}
            />
            {/* Play icon overlay for media */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '12px solid white',
                  borderTop: '8px solid transparent',
                  borderBottom: '8px solid transparent',
                  marginLeft: 3,
                }}
              />
            </div>
          </div>
        ) : kind === 'pdf' && imageUrl ? (
          <div style={{ width: '100%', height: '100%', position: 'relative', borderRadius: cornerRadius }}>
            <img
              src={imageUrl}
              alt={title || ''}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
                borderRadius: cornerRadius,
              }}
            />
          </div>
        ) : kind === 'pdf' ? (
          <div style={{
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,.05)',
            display: 'grid',
            placeItems: 'center',
            color: 'rgba(0,0,0,.4)',
            fontSize: 14,
            padding: 8,
            textAlign: 'center',
            borderRadius: cornerRadius
          }}>
            <div>📄</div>
            <div>PDF</div>
          </div>
        ) : (
          <div style={{
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,.05)',
            display: 'grid',
            placeItems: 'center',
            color: 'rgba(0,0,0,.4)',
            fontSize: 14,
            borderRadius: cornerRadius
          }}>
            {kind}
          </div>
        )}
      </div>

      {/* Border */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          border: '1px solid rgba(0,0,0,0.08)',
          borderRadius: cornerRadius,
          boxSizing: 'border-box',
        }}
      />

      {/* Ghost preview indicator */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          border: '1px solid rgba(0,0,0,.02)',
          background: GHOST_BACKGROUND,
          boxShadow: CARD_SHADOW,
          mixBlendMode: 'normal',
          borderRadius: cornerRadius,
          boxSizing: 'border-box',
          zIndex: 1,
          opacity: 0.7,
        }}
      />
    </div>
  )
}

export const PreviewTileOverlay = memo(function PreviewTileOverlay({
  computedProps,
  opacity = DEFAULT_OPACITY,
}: PreviewTileOverlayProps) {
  if (!computedProps) return null

  const { x, y, w, h, type, props } = computedProps

  if (type === 'portal') {
    return <ThreeDBoxPreview x={x} y={y} w={w} h={h} props={props} opacity={opacity} />
  }

  if (type === 'arena-block') {
    return <ArenaBlockPreview x={x} y={y} w={w} h={h} props={props} opacity={opacity} />
  }

  return null
})

