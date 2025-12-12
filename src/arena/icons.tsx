import React from 'react'
import { PROFILE_CIRCLE_BORDER, PROFILE_CIRCLE_SHADOW } from './constants'

export function ProfileIcon({ size = 12, color = '#666', strokeWidth = 2 }: { size?: number; color?: string; strokeWidth?: number }) {
  const s = Math.max(1, Math.floor(size))
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      shapeRendering="geometricPrecision"
      preserveAspectRatio="xMidYMid meet"
   >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" vectorEffect="non-scaling-stroke" />
      <circle cx="12" cy="7" r="4" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function ChannelIcon({ size = 12, color = '#ccc' }: { size?: number; color?: string }) {
  return <div style={{ width: size, height: size, border: `1px solid ${color}`, borderRadius: 0, flex: '0 0 auto' }} />
}

function getProfileStrokeDataUrl(stroke: string, strokeWidth: number = 2) {
  const s = encodeURIComponent(stroke)
  const w = String(strokeWidth)
  const svg = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${s}' stroke-width='${w}' stroke-linecap='round' stroke-linejoin='round' preserveAspectRatio='xMidYMid meet'>\
  <path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'/><circle cx='12' cy='7' r='4'/>\
</svg>`
  return `data:image/svg+xml;utf8,${svg}`
}

export function Avatar({ src, size = 18, fallbackColor = '#666' }: { src?: string | null; size?: number; fallbackColor?: string }) {
  const borderRadius = 2 // use a rounded square; adjust as needed, or import a token
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius,
        background: 'transparent',
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius,
          }}
          draggable={false}
        />
      ) : (
        <img
          alt=""
          src={getProfileStrokeDataUrl(fallbackColor, 2)}
          loading="lazy"
          decoding="async"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            position: 'relative',
            borderRadius,
          }}
          draggable={false}
        />
      )}
    </div>
  )
}

export function ProfileCircle({ avatar, size = 22 }: { avatar?: string; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: PROFILE_CIRCLE_BORDER,
        boxShadow: PROFILE_CIRCLE_SHADOW,
        background: avatar
          ? `url(${avatar})`
          : 'rgba(0,0,0,.1)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        flexShrink: 0,
        pointerEvents: 'none',
      }}
    />
  )
}


