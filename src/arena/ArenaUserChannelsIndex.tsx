import { stopEventPropagation } from 'tldraw'
import { memo, useMemo, useRef, useState } from 'react'
import { List } from 'react-window'
import { OverflowCarouselText } from './OverflowCarouselText'
import { LoadingPulse } from '../shapes/LoadingPulse'
import { getTactileScales } from './constants'
import type { UserChannelListItem } from './types'

export type ArenaUserChannelsIndexProps = {
  loading: boolean
  error: string | null
  channels: UserChannelListItem[]
  width: number
  height: number
  padding?: number
  compact?: boolean
  showCheckbox?: boolean
  selectedChannelIds?: Set<number>
  onSelectChannel?: (slug: string) => void
  onChannelToggle?: (channelId: number) => void
  onChannelPointerDown?: (info: { slug: string; id: number; title: string }, e: React.PointerEvent) => void
  onChannelPointerMove?: (info: { slug: string; id: number; title: string }, e: React.PointerEvent) => void
  onChannelPointerUp?: (info: { slug: string; id: number; title: string }, e: React.PointerEvent) => void
}

const ChannelRow = memo((props: any) => {
  const { index, style, sorted, showAuthor, showBlockCount, showCheckbox, selectedChannelIds, onSelectChannel, onChannelToggle, onChannelPointerDown, onChannelPointerMove, onChannelPointerUp, padding = 20, compact = true } = props
  const c = sorted[index]
  const dragStartedRef = useRef(false)
  const [isHovered, setIsHovered] = useState(false)
  const isSelected = showCheckbox && selectedChannelIds?.has(c.id)

  return (
    <div style={{
      ...style,
      paddingLeft: padding,
      paddingRight: padding,
      paddingTop: 0
    }}>
      <button
        type="button"
        data-interactive="button"
        data-tactile
        data-card-type="channel"
        data-channel-slug={c.slug}
        data-channel-title={c.title}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          // Don't select channel if meta key is pressed (used for tiling spawn) or if drag occurred
          if (!e.metaKey && !dragStartedRef.current) {
            if (showCheckbox) {
              onChannelToggle?.(c.id)
            } else {
              onSelectChannel?.(c.slug)
            }
          }
          // Reset drag flag after click
          dragStartedRef.current = false
        }}
        onPointerDown={(e) => {
          stopEventPropagation(e)
          dragStartedRef.current = false // Reset drag flag on new interaction
          onChannelPointerDown?.({ slug: c.slug, id: c.id, title: c.title }, e)
        }}
        onPointerMove={(e) => {
          // Only process pointer move during active drag (buttons down)
          if (e.buttons > 0) {
            dragStartedRef.current = true
            onChannelPointerMove?.({ slug: c.slug, id: c.id, title: c.title }, e)
          }
        }}
        onPointerUp={(e) => {
          stopEventPropagation(e)
          onChannelPointerUp?.({ slug: c.slug, id: c.id, title: c.title }, e)
        }}
        onMouseDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onMouseUp={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        draggable={false}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          width: '100%',
          background: 'transparent',
          border: 'none',
          boxShadow: 'none',
          borderRadius: 0,
          borderTop: index === 0 ? 'none' : '1px solid #eee',
          padding: '4px 0px 18px 0px',
          cursor: 'pointer',
          textAlign: 'left',
          userSelect: 'none',
          touchAction: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0, gap: 8 }}>
          {/* Checkbox */}
          {showCheckbox && (
            <div style={{
              width: 12,
              position: 'relative',
              height: 12,
              border: `1px solid ${isSelected ? 'rgba(0,0,0,.3)' : 'rgba(0,0,0,.2)'}`,
              borderRadius: 2,
              background: isSelected ? 'rgba(0,0,0,.1)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              {isSelected && (
                <svg width={8} height={8} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20,6 9,17 4,12"></polyline>
                </svg>
              )}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flex: 1, minWidth: 0 }}>
            <OverflowCarouselText
              text={c.title}
              maxWidthPx={160}
              gapPx={32}
              speedPxPerSec={50}
              fadePx={24}
              textStyle={{
                fontSize: compact ? 10 : 14,
                fontWeight: 700,
                color: (c as any).open ? 'rgba(0,128,0,.86)' : 'rgba(0,0,0,.86)',
              }}
            />
            {showBlockCount && typeof (c as any).length === 'number' ? (
              <div style={{
                color: 'rgba(0,0,0,.4)',
                fontSize: 8,
                letterSpacing: '-0.01em',
                fontWeight: 700,
                lineHeight: 1,
                flexShrink: 0
              }}>
                {(c as any).length >= 1000
                  ? `${((c as any).length / 1000).toFixed(1)}k`.replace('.0k', 'k')
                  : (c as any).length
                }
              </div>
            ) : null}
          </div>
          {/* Right-side metadata: author pinned to right */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0, marginLeft: 'auto', height: '100%', position: 'relative', top: 3 }}>
            {(showAuthor) && (c as any).author?.username ? (
              <div
                title={(c as any).author.full_name || (c as any).author.username}
                style={{ color: 'rgba(0,0,0,.5)', fontSize: 9, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {(c as any).author.username}
              </div>
            ) : null}
          </div>
        </div>
      </button>
    </div>
  )
})

function ArenaUserChannelsIndexComponent({ loading, error, channels, width, height, padding = 20, compact = true, showCheckbox = false, selectedChannelIds, onSelectChannel, onChannelToggle, onChannelPointerDown, onChannelPointerMove, onChannelPointerUp }: ArenaUserChannelsIndexProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<any>(null)


  const sorted = useMemo(() => {
    if (!channels.length) return channels
    return channels
      .map((channel) => {
        const updatedAtMs = typeof (channel as any).updatedAt === 'string' ? Date.parse((channel as any).updatedAt) : 0
        return { channel, updatedAtMs }
      })
      .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
      .map(({ channel }) => channel)
  }, [channels])

  // Show author when not compact mode, or when width allows in compact mode
  const showAuthor = !compact || width >= 280
  const showBlockCount = width >= 240

  // While loading, render a clean full-size centered spinner so it's visually
  // centered relative to the ThreeDBox face, not offset by list paddings.
  if (loading) {
    return (
      <div
        ref={containerRef}
        style={{ position: 'relative', width, height, overflow: 'hidden', padding: padding === 0 ? '4px 0' : 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <LoadingPulse size={24} color="rgba(0,0,0,0.3)" />
      </div>
    )
  }

  // Calculate dimensions for the virtualized list
  const listHeight = height - 8 - padding - 4 - 36 // height - topPadding - bottomPadding - topChannelPadding - bottomChannelPadding
  const listWidth = width // full width, rows handle their own padding

  // For error/empty states, render without virtualization
  if (error || (!loading && channels.length === 0)) {
    return (
      <div
        ref={containerRef}
        style={{ position: 'relative', width, height, overflow: 'hidden', padding: padding === 0 ? '4px 0' : '8px 0' }}
      >
        {error ? <div style={{ color: 'rgba(0,0,0,.6)', fontSize: 12, padding: `0 ${padding}px` }}>error: {error}</div> : null}
        {!loading && !error && channels.length === 0 ? <div style={{ color: 'rgba(0,0,0,.4)', fontSize: 12, padding: `0 ${padding}px` }}>no channels</div> : null}
      </div>
    )
  }

  return (
    <List
      {...{
        listRef,
        height,
        width: listWidth,
        rowCount: sorted.length,
        rowHeight: 37, // 30px button height + 1px border + 4px padding
        overscanCount: 5,
        rowComponent: ChannelRow,
        rowProps: {
          sorted,
          showAuthor,
          showBlockCount,
          showCheckbox,
          selectedChannelIds,
          padding,
          compact,
          onSelectChannel,
          onChannelToggle,
          onChannelPointerDown,
          onChannelPointerMove,
          onChannelPointerUp
        },
        style: {
          padding: padding === 0 ? '4px 0 4px 0' : '12px 0 44px 0', // Tighter padding for popover usage
        },
      }}
      onWheelCapture={(e) => {
        // Allow native scrolling but prevent the event from bubbling to the canvas.
        // If ctrlKey is pressed, we let the event bubble up to be handled for zooming.
        if (e.ctrlKey) return
        e.stopPropagation()
      }}
    />
  )
}

export const ArenaUserChannelsIndex = memo(ArenaUserChannelsIndexComponent)
