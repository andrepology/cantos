// React
import { useRef, useState, useCallback, useMemo } from 'react'

// Motion/Animation
import { AnimatePresence, motion } from 'motion/react'

// Editor
import { useEditor, type TLShapeId } from 'tldraw'

// Local Components
import { Avatar } from '../../arena/icons'
import { ScrollFade } from './ScrollFade'
import { PressableListItem } from './PressableListItem'

// Local Hooks
import { usePortalSpawnDrag } from '../../arena/hooks/usePortalSpawnDrag'
import { useScreenToPagePoint } from '../../arena/hooks/useScreenToPage'

// Local Types & Constants
import { PortalSpawnGhost } from '../../arena/components/PortalSpawnGhost'
import type { PortalSource } from '../../arena/search/portalSearchTypes'
import type { AuthorMetadata } from '../../arena/hooks/useAuthorMetadata'
import { OverflowCarouselText } from '../../arena/OverflowCarouselText'
import { DESIGN_TOKENS, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_TERTIARY } from '../../arena/constants'

const SOURCE_TRANSITION = {
  duration: 0.18,
  ease: 'easeOut' as const,
  scale: 0.985,
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const ROW_HEIGHT = 36
const ROW_OVERSCAN = 3
const ROW_GAP = 4
const ROW_STEP = ROW_HEIGHT + ROW_GAP
const LIST_PADDING_X = 10
const LIST_PADDING_BOTTOM = 24
const FONT_SIZE = 12

type ChannelItem = { id: number; title: string; slug?: string; length?: number }

type AuthorChannelListProps = {
  channels: ChannelItem[]
  totalCount: number
  width: number
  height: number
  shapeId?: TLShapeId
  paddingTop?: number
  onScrollOffsetChange?: (scrollTop: number) => void
}

export function AuthorChannelList({
  channels,
  totalCount,
  width,
  height,
  paddingTop = 0,
  shapeId,
  onScrollOffsetChange,
}: AuthorChannelListProps) {
  const editor = useEditor()
  const screenToPagePoint = useScreenToPagePoint()
  const [scrollTop, setScrollTop] = useState(0)

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const nextScrollTop = e.currentTarget.scrollTop
    setScrollTop(nextScrollTop)
    onScrollOffsetChange?.(nextScrollTop)
  }, [onScrollOffsetChange])

  const handleSelectChannel = useCallback(
    (slug?: string) => {
      if (!shapeId || !slug) return
      editor.updateShape({
        id: shapeId,
        type: 'tactile-portal',
        props: {
          source: { kind: 'channel', slug },
          scrollOffset: 0,
          focusedCardId: undefined,
        },
      })
    },
    [editor, shapeId]
  )

  const portalSpawnDimensions = useMemo(() => ({ w: 180, h: 180 }), [])

  const getSpawnPayload = useCallback(
    (ch: { slug?: string; title: string }) => {
      if (!ch?.slug) return null
      return { kind: 'channel' as const, slug: ch.slug, title: ch.title }
    },
    []
  )

  const {
    ghostState,
    handlePointerDown: handleChannelPointerDown,
    handlePointerMove: handleChannelPointerMove,
    handlePointerUp: handleChannelPointerUp,
  } = usePortalSpawnDrag<{ slug?: string; title: string; id: number }>({
    thresholdPx: 12,
    screenToPagePoint,
    getSpawnPayload,
    defaultDimensions: portalSpawnDimensions,
    selectSpawnedShape: false,
    onClick: (_, item) => handleSelectChannel(item.slug),
  })

  const virtualCount = Math.max(totalCount, channels.length)
  const contentScrollTop = Math.max(0, scrollTop - paddingTop)
  const startIndex = Math.max(0, Math.floor(contentScrollTop / ROW_STEP) - ROW_OVERSCAN)
  const endIndex = Math.min(virtualCount, Math.ceil((contentScrollTop + height) / ROW_STEP) + ROW_OVERSCAN)
  const totalHeight = virtualCount * ROW_STEP
  const offsetY = startIndex * ROW_STEP
  const textMaxWidth = Math.floor((width - 24) * 0.8)

  return (
    <div
      style={{
        width,
        height,
        position: 'relative',
        overflow: 'visible',
        boxSizing: 'border-box',
      }}
      data-interactive="carousel"
      onWheelCapture={(e) => {
        if (e.ctrlKey) return
        e.stopPropagation()
      }}
    >
      <ScrollFade
        onScroll={handleScroll}
        minTopFadeStrength={0.12}
        stopWheelPropagation
        style={{
          position: 'absolute',
          inset: 0,
          height: '100%',
          overflowY: 'scroll',
          overflowX: 'visible',
          paddingTop,
          paddingBottom: LIST_PADDING_BOTTOM,
          paddingLeft: LIST_PADDING_X,
          paddingRight: LIST_PADDING_X,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ height: totalHeight, position: 'relative', width: '100%' }}>
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            {Array.from({ length: Math.max(0, endIndex - startIndex) }).map((_, offset) => {
              const index = startIndex + offset
              const channel = channels[index]
              if (!channel) {
                return <div key={`channel-placeholder-${index}`} style={{ height: ROW_HEIGHT, marginBottom: ROW_GAP }} />
              }
              return (
                <PressableListItem
                  key={channel.id ?? index}
                  data-interactive="channel-item"
                  data-channel-slug={channel.slug}
                  data-channel-title={channel.title}
                  role="button"
                  tabIndex={0}
                  style={{
                    minHeight: ROW_HEIGHT,
                    marginBottom: ROW_GAP,
                    touchAction: 'none',
                    width: '100%',
                  }}
                  onPointerDown={(e) => {
                    handleChannelPointerDown(channel as any, e)
                    e.stopPropagation()
                  }}
                  onPointerMove={(e) => {
                    if (e.buttons > 0) handleChannelPointerMove(channel as any, e)
                    e.stopPropagation()
                  }}
                  onPointerUp={(e) => {
                    handleChannelPointerUp(channel as any, e)
                    e.stopPropagation()
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleSelectChannel(channel.slug)
                    }
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                      minWidth: 0,
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                      <OverflowCarouselText
                        text={channel.title}
                        maxWidthPx={textMaxWidth}
                        gapPx={32}
                        speedPxPerSec={50}
                        fadePx={16}
                        textStyle={{
                          fontSize: FONT_SIZE * 0.9,
                          fontWeight: 700,
                          color: TEXT_PRIMARY,
                          lineHeight: 1.2,
                        }}
                      />
                      {channel.length !== undefined && (
                        <div
                          style={{
                            color: TEXT_TERTIARY,
                            fontSize: FONT_SIZE * 0.8,
                            letterSpacing: '-0.01em',
                            fontWeight: 700,
                            lineHeight: 1.2,
                            flexShrink: 0,
                          }}
                        >
                          {channel.length >= 1000
                            ? `${(channel.length / 1000).toFixed(1)}k`.replace('.0k', 'k')
                            : channel.length
                          }
                        </div>
                      )}
                    </div>
                  </div>
                </PressableListItem>
              )
            })}
          </div>
        </div>
      </ScrollFade>


      <PortalSpawnGhost
        ghost={ghostState}
        renderContent={(ch) => {
          const channel = ch as { title: string; length?: number }
          return (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                justifyContent: 'space-between',
                fontSize: 12,
                fontWeight: 700,
                color: '#000',
              }}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 140,
                  color: TEXT_PRIMARY,
                }}
              >
                {channel.title}
              </span>
              <span style={{ fontSize: 10, color: TEXT_TERTIARY }}>
                {channel.length ?? ''}
              </span>
            </div>
          )
        }}
      />
    </div>
  )
}

type AuthorViewProps = {
  w: number
  h: number
  author: AuthorMetadata | null | undefined
  source: PortalSource
  shapeId?: TLShapeId
}

export function AuthorView({ w, h, author, source, shapeId }: AuthorViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)

  const fallbackAvatar = source.kind === 'author' ? source.avatarThumb : undefined
  const avatar = author?.avatarThumb || fallbackAvatar

  const mappedChannels = useMemo<ChannelItem[]>(() => {
    if (!author?.channels) return []
    const seen = new Set<string>()
    const deduped = author.channels.filter((c) => {
      if (!c) return false
      const key = typeof c.id === 'number' ? `id:${c.id}` : (c.slug ? `slug:${c.slug}` : null)
      if (!key) return true
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    return deduped.map((c, idx) => ({
      id: c.id ?? idx,
      title: c.title,
      slug: c.slug ?? c.title.toLowerCase().replace(/\s+/g, '-'),
      length: c.length ?? 0,
    }))
  }, [author?.channels])
  const totalChannelCount = Math.max(mappedChannels.length, author?.channelCount ?? 0)

  const paddingX = 12
  const paddingTop = 16
  const paddingBottom = 12
  const listHeight = Math.max(0, h - paddingBottom)

  const avatarSize = Math.max(32, Math.min(128, Math.floor(Math.min(w, h) * 0.50)))
  const avatarPadTop = 36
  const avatarPadBottom = 36
  const avatarSlotHeight = avatarSize + avatarPadTop + avatarPadBottom
  const listPaddingTop = avatarSlotHeight

  const fadeDistance = Math.max(1, avatarSlotHeight * 0.85)
  const fadeProgress = clamp01(scrollTop / fadeDistance)
  const avatarBlur = lerp(0, 16, fadeProgress)
  const avatarOpacity = lerp(1, 0.2, fadeProgress)
  const avatarScale = lerp(1, 0.9, fadeProgress)
  const avatarBaseOffsetY = avatarSlotHeight * 0.20
  const avatarOffsetY = avatarBaseOffsetY + lerp(0, 14, fadeProgress)



  return (
    <AnimatePresence mode="wait">
      <motion.div
        ref={containerRef}
        key={`author-view-${(source as any).id ?? 'author'}`}
        initial={{ opacity: 0, scale: SOURCE_TRANSITION.scale }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: SOURCE_TRANSITION.scale }}
        transition={{ duration: SOURCE_TRANSITION.duration, ease: SOURCE_TRANSITION.ease }}
        style={{
          width: w,
          height: h,
          position: 'relative',
          overflow: 'hidden',
          background: 'transparent',
          display: 'flex',
          flexDirection: 'column',
          padding: `${paddingTop}px ${paddingX}px ${paddingBottom}px`,
          boxSizing: 'border-box',
        }}
        data-interactive="carousel"
      >
        <div
          style={{
            position: 'relative',
            flex: 1,
            minHeight: 120,
          }}
        >
          <motion.div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: avatarSlotHeight,
              display: 'flex',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 2,
              opacity: avatarOpacity,
              filter: `blur(${avatarBlur}px)`,
              transform: `translateY(${avatarOffsetY}px) scale(${avatarScale})`,
            }}
          >
            <div
              style={{
                width: avatarSize,
                height: avatarSize,
                borderRadius: 6,
                border: `1px solid ${DESIGN_TOKENS.colors.border}`,
                background: DESIGN_TOKENS.colors.surfaceBackground,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
              }}
            >
              <Avatar src={avatar} size={avatarSize - 6} />
            </div>
          </motion.div>

          {mappedChannels.length > 0 ? (
            <AuthorChannelList
              channels={mappedChannels}
              totalCount={totalChannelCount}
              width={Math.max(0, w - paddingX * 2)}
              height={listHeight}
              paddingTop={listPaddingTop}
              shapeId={shapeId}
              onScrollOffsetChange={setScrollTop}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: TEXT_SECONDARY,
                fontSize: 12,
                paddingTop: listPaddingTop,
                boxSizing: 'border-box',
              }}
            >
              {author === undefined || author?.channelsLoading ? 'loading channels...' : 'no channels to show'}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
