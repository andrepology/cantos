import { memo } from 'react'
import { getTabsContainerStyle, getTabsChannelTitleStyle, TEXT_COLOR, TEXT_OPACITY_SUBTLE } from '../../styles/deckStyles'
import { OverflowCarouselText } from '../../OverflowCarouselText'

export interface TabsLayoutProps {
  channelTitle?: string
  children?: React.ReactNode // For custom content like user labels
  tabHeight: number
  paddingTabsTB: number
  paddingTabsLR: number
  tabGap: number
  containerWidth: number
  rowRef: React.RefObject<HTMLDivElement | null>
  lastUserActivityAtRef: React.RefObject<number>
  onWheelCapture: (e: React.WheelEvent<HTMLDivElement>) => void
  isUserContent?: boolean // Whether this contains user labels (affects centering)
}

const TabsLayout = memo(function TabsLayout({
  channelTitle,
  children,
  tabHeight,
  paddingTabsTB,
  paddingTabsLR,
  tabGap,
  containerWidth,
  rowRef,
  lastUserActivityAtRef,
  onWheelCapture,
  isUserContent = false,
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
          transform: isUserContent ? undefined : 'translateY(-2.5px)',
        }}
      >
        <div style={{
          flex: 1,
          minWidth: 0,
          paddingLeft: 6,
          paddingTop: 0,
          display: 'flex',
          alignItems: 'center',
          position: 'relative',
          overflow: 'hidden',
          width: '100%',
        }}>
          {children ? children : (
            <OverflowCarouselText
              text={channelTitle || '—'}
              maxWidthPx={Math.max(50, containerWidth * 0.9)}
              fadePx={12}
              gapPx={16}
              textStyle={{
                fontFamily: "'Alte Haas Grotesk', system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif",
                fontSize: 10,
                fontWeight: 700,
                color: TEXT_COLOR,
                lineHeight: '12px',
                opacity: TEXT_OPACITY_SUBTLE,
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
})

export { TabsLayout }
