import { memo } from 'react'

export interface HorizontalTabsLayoutProps {
  channelTitle?: string
  tabWidth: number
  paddingHTabsTB: number
  paddingHTabsLR: number
  tabGap: number
  rowRef: React.RefObject<HTMLDivElement | null>
  lastUserActivityAtRef: React.RefObject<number>
  onWheelCapture: (e: React.WheelEvent<HTMLDivElement>) => void
}

const HorizontalTabsLayout = memo(function HorizontalTabsLayout({
  channelTitle,
  tabWidth,
  paddingHTabsTB,
  paddingHTabsLR,
  tabGap,
  rowRef,
  lastUserActivityAtRef,
  onWheelCapture,
}: HorizontalTabsLayoutProps) {
  return (
    <div
      ref={rowRef}
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: tabWidth,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: `${paddingHTabsTB}px ${paddingHTabsLR}px`,
        gap: tabGap,
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(8px)',
        overflow: 'hidden',
      }}
      onWheelCapture={(e) => {
        lastUserActivityAtRef.current = Date.now()
        onWheelCapture(e)
      }}
    >
      <div
        style={{
          flex: '0 0 auto',
          width: tabWidth - paddingHTabsLR * 2,
          height: tabWidth - paddingHTabsTB * 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {/* channel icon at top */}
        <div
          style={{
            flex: '0 0 auto',
            height: 8,
            width: 8,
            background: '#ffffff',
            border: '1px solid #d4d4d4',
            borderRadius: 2,
          }}
        />

        {/* book-spine title: draw normally, rotate the whole label div, absolutely position */}
        <div
          style={{
            flex: '1',
            position: 'relative',
            width: tabWidth - paddingHTabsLR * 2,
            height: tabWidth - paddingHTabsTB * 2 - 8 /* leave a little gap under icon */,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '50%',
              bottom: paddingHTabsTB,
              transform: 'translateX(-50%) rotate(-90deg)',
              transformOrigin: 'center',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              fontSize: 9,
              fontWeight: 700,
              color: '#333',
              lineHeight: 1,
              maxWidth: tabWidth - paddingHTabsTB * 2 - 16,
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              textAlign: 'center',
            }}
          >
            {channelTitle || '—'}
          </div>
        </div>
      </div>
    </div>
  )
})

export { HorizontalTabsLayout }
