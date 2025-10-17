import { memo } from 'react'
import { OverflowCarouselText } from '../../OverflowCarouselText'

export interface VerticalTabsLayoutProps {
  channelTitle?: string
  userAvatar?: string
  userName?: string
  containerHeight?: number
  paddingHTabsLR?: number
}

const VerticalTabsLayout = memo(function VerticalTabsLayout({
  channelTitle,
  userAvatar,
  userName,
  containerHeight,
  paddingHTabsLR,
}: VerticalTabsLayoutProps) {
  // For users, show inline avatar + name rotated like in TabsLayout
  if (userAvatar || userName) {
    return (
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '100%',
          overflow: 'visible',
          zIndex: 10,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(-90deg)',
            transformOrigin: 'center',
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            pointerEvents: 'none',
          }}
        >
          {/* Avatar */}
          <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 0 }}>
            <div
              style={{
                width: '12px',
                height: '12px',
                overflow: 'hidden',
                background: 'rgba(0,0,0,.06)',
                flexShrink: 0,
              }}
            >
              {userAvatar ? (
                <img
                  src={userAvatar}
                  alt={userName || 'avatar'}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block'
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'grid',
                    placeItems: 'center',
                    background: 'rgba(0,0,0,.06)',
                  }}
                >
                  <span
                    style={{
                      fontSize: '6px',
                      fontWeight: 800,
                      color: 'rgba(0,0,0,.6)',
                    }}
                  >
                    {(userName || 'P').slice(0, 1).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          </span>

          {/* Name */}
          <span
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: '#333',
              letterSpacing: '0.0155em',
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {userName || 'Profile'}
          </span>
        </div>
      </div>
    )
  }

  // For channels, show rotated text only
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '100%',
        overflow: 'visible',
        zIndex: 10,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '45%',
          transform: 'translate(-50%, -50%) rotate(-90deg)',
          transformOrigin: 'center',
          pointerEvents: 'auto',
        }}
      >
        <OverflowCarouselText
          text={channelTitle || 'Untitled Channel'}
          maxWidthPx={containerHeight ? containerHeight - (paddingHTabsLR || 0) * 2 : 120}
          textStyle={{
            fontSize: '12px',
            fontWeight: 700,
            color: '#333',
            letterSpacing: '0.0155em',
          }}
        />
      </div>
    </div>
  )
})

export { VerticalTabsLayout }
