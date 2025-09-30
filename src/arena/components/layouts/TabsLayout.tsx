import { memo } from 'react'
import { getTabsContainerStyle, getTabsChannelIconStyle, getTabsChannelTitleStyle } from '../../styles/deckStyles'

export interface TabsLayoutProps {
  channelTitle?: string
  tabHeight: number
  paddingTabsTB: number
  paddingTabsLR: number
  tabGap: number
  rowRef: React.RefObject<HTMLDivElement | null>
  lastUserActivityAtRef: React.RefObject<number>
  onWheelCapture: (e: React.WheelEvent<HTMLDivElement>) => void
}

const TabsLayout = memo(function TabsLayout({
  channelTitle,
  tabHeight,
  paddingTabsTB,
  paddingTabsLR,
  tabGap,
  rowRef,
  lastUserActivityAtRef,
  onWheelCapture,
}: TabsLayoutProps) {
  return (
    <div
      ref={rowRef}
      style={getTabsContainerStyle(tabGap, paddingTabsTB, paddingTabsLR)}
      onWheelCapture={(e) => {
        lastUserActivityAtRef.current = Date.now()
        onWheelCapture(e)
      }}
    >
      <div
        style={{
          // flex: '0 0 1',
          height: `${tabHeight}px`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          position: 'relative',
          top: -1,
        }}
      >
        {/* channel icon is always a neutral grey square in tabs */}
        <div style={getTabsChannelIconStyle()} />
        <div style={getTabsChannelTitleStyle()}>
            {channelTitle || '—'}
        </div>
      </div>
    </div>
  )
})

export { TabsLayout }
