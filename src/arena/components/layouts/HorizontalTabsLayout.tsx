import { memo } from 'react'

export interface HorizontalTabsLayoutProps {
  channelTitle?: string
}

const HorizontalTabsLayout = memo(function HorizontalTabsLayout({
  channelTitle,
}: HorizontalTabsLayoutProps) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '100%',
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(8px)',
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
          fontSize: '12px',
          fontWeight: 700,
          color: '#333',
          letterSpacing: '0.0155em',
          textAlign: 'center',
          maxWidth: 'none',
          overflow: 'visible',
          pointerEvents: 'none',
        }}
      >
        {channelTitle || 'Untitled Channel'}
      </div>
    </div>
  )
})

export { HorizontalTabsLayout }
