/**
 * High-fidelity preview overlay for tiling placement.
 * Renders visual replicas of shape HTML containers at the candidate position.
 */

import { memo, useMemo } from 'react'
import type { ComputedShapeProps } from '../arena/tiling/shapeSizing'
import { SHAPE_BORDER_RADIUS, SHAPE_SHADOW, PORTAL_BACKGROUND, TEXT_SECONDARY, CARD_SHADOW, GHOST_BACKGROUND } from '../arena/constants'
import { BlockRenderer } from '../shapes/components/BlockRenderer'
import type { LoadedArenaBlock } from '../jazz/schema'

export interface PreviewTileOverlayProps {
  computedProps: ComputedShapeProps | null
  opacity?: number
}

const DEFAULT_OPACITY = 0.6

/**
 * Render channel content inside the preview box.
 */
function ChannelPreviewContent({ w, h, title, authorName, opacity }: { w: number; h: number; title: string; authorName?: string; opacity: number }) {
  // Use fluid font sizing for title
  const titleSize = useMemo(() => getFluidFontSize(7, 28, 80, 400), [])

  // Use fluid font sizing for meta (author)
  const metaSize = useMemo(() => getFluidFontSize(8, 16, 80, 400), [])

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
          lineHeight: 1.2,
          fontWeight: 700,
          color: 'rgba(0,0,0,.86)',
          overflow: 'hidden',
          overflowWrap: 'break-word'
        }}>
          {title || 'Channel'}
        </div>
        {authorName && h > 60 && ( // Only show author if there's enough height
          <div style={{
            fontSize: metaSize,
            lineHeight: 1.4,
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
  const source = props?.source
  const isUser = source?.kind === 'author'
  const label = isUser
    ? (source?.fullName || 'Profile')
    : (source?.title || source?.slug || 'search arena')
  const userAvatar = isUser ? source?.avatarThumb : undefined

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
        {isUser && userAvatar ? (
          <img
            src={userAvatar}
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
      {!isUser && source?.title && (
        <ChannelPreviewContent
          w={w}
          h={h}
          title={source.title}
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

export const PreviewTileOverlay = memo(function PreviewTileOverlay({
  computedProps,
  opacity = DEFAULT_OPACITY,
}: PreviewTileOverlayProps) {
  if (!computedProps) return null

  const { x, y, w, h, type, props } = computedProps
  const previewBlock = useMemo(() => {
    if (type !== 'arena-block') return null
    const preview = computedProps.preview
    const kind = preview?.kind ?? 'text'
    const title = preview?.title ?? ''
    const imageUrl = preview?.imageUrl ?? ''
    const url = preview?.url ?? imageUrl

    return {
      id: 'preview',
      type: kind,
      title,
      content: kind === 'text' ? title : '',
      thumbUrl: imageUrl,
      displayUrl: imageUrl,
      largeUrl: imageUrl,
      originalFileUrl: url,
      provider: kind,
      aspect: w > 0 && h > 0 ? w / h : 1,
    } as LoadedArenaBlock
  }, [computedProps, h, type, w])

  if (type === 'tactile-portal') {
    return <ThreeDBoxPreview x={x} y={y} w={w} h={h} props={props} opacity={opacity} />
  }

  if (type === 'arena-block') {
    if (!previewBlock) return null
    return (
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: w,
          height: h,
          pointerEvents: 'none',
          opacity,
        }}
      >
        <BlockRenderer block={previewBlock} width={w} height={h} />
      </div>
    )
  }

  return null
})
