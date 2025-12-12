import { useRef, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useEditor, type TLShapeId } from 'tldraw'
import { Profile3DCard } from '../../editor/Profile3DCard'
import { usePortalSpawnDrag } from '../../arena/hooks/usePortalSpawnDrag'
import { PortalSpawnGhost } from '../../arena/components/PortalSpawnGhost'
import type { Card, CardAuthorBio, CardAuthorChannels } from '../../arena/types'
import type { PortalSource } from './PortalAddressBar'
import { OverflowCarouselText } from '../../arena/OverflowCarouselText'
import { DESIGN_TOKENS, LABEL_FONT_FAMILY, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_TERTIARY } from '../../arena/constants'
import { useWheelControl } from '../../hooks/useWheelControl'

const SOURCE_TRANSITION = {
  duration: 0.18,
  ease: 'easeOut' as const,
  scale: 0.985,
}

const isAuthorBio = (card: Card): card is CardAuthorBio => card.type === 'author-bio'
const isAuthorChannels = (card: Card): card is CardAuthorChannels => card.type === 'author-channels'
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

type AuthorProfileCardProps = {
  card: CardAuthorBio
  width: number
  height: number
  focused?: boolean
}

export function AuthorProfileCard({ card, width, height, focused = false }: AuthorProfileCardProps) {
  const avatarSize = 64
  const [tilt, setTilt] = useState<{ rotateX: number; rotateY: number }>({ rotateX: 0, rotateY: 0 })
  const statIconStroke = TEXT_TERTIARY

  const handleHoverMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const nx = Math.max(-1, Math.min(1, (x / rect.width) * 2 - 1))
    const ny = Math.max(-1, Math.min(1, (y / rect.height) * 2 - 1))
    const maxTilt = 18
    setTilt({ rotateX: -ny * maxTilt, rotateY: nx * maxTilt })
  }, [])

  const handleHoverLeave = useCallback(() => {
    setTilt({ rotateX: 0, rotateY: 0 })
  }, [])

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 6,
        position: 'relative',
        overflow: 'visible',
      }}
      onMouseMove={handleHoverMove}
      onMouseLeave={handleHoverLeave}
    >
      <motion.div
        style={{
          width: avatarSize,
          height: avatarSize,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'auto',
        }}
        animate={{ scale: focused ? 1.04 : 1, y: focused ? -4 : 0 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
      >
        <Profile3DCard avatar={card.avatar} size={avatarSize} tilt={tilt} />
      </motion.div>
      {false && (
        <motion.div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            width: '100%',
            padding: '0 12px',
            pointerEvents: 'auto',
            marginTop: 4,
          }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.14, ease: 'easeOut' }}
        >
          <div
            style={{
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              fontSize: 10,
              color: TEXT_SECONDARY,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              lineHeight: 1.4,
              fontFamily: LABEL_FONT_FAMILY,
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 12 12"
                style={{ flexShrink: 0 }}
              >
                <rect x="2.5" y="2.5" width="7" height="7" rx="1.3" stroke={statIconStroke} fill="none" strokeWidth="1.1" />
              </svg>
              <span style={{ color: TEXT_SECONDARY }}>{card.length ?? '—'}</span>
            </span>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 12 12"
                style={{ flexShrink: 0 }}
              >
                <path d="M2.5 6h7" stroke={statIconStroke} strokeWidth="1.1" strokeLinecap="round" />
                <path d="M6.5 3.5 9 6l-2.5 2.5" stroke={statIconStroke} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ color: TEXT_SECONDARY }}>{card.followingCount ?? '—'}</span>
            </span>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 12 12"
                style={{ flexShrink: 0 }}
              >
                <path
                  d="m6 2.4 1.2 2.44 2.7.32-2 1.88.52 2.76L6 8.9 3.58 9.8l.52-2.76-2-1.88 2.7-.32z"
                  stroke={statIconStroke}
                  fill="none"
                  strokeWidth="1.1"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
              <span style={{ color: TEXT_SECONDARY }}>{card.followerCount ?? '—'}</span>
            </span>
          </div>
          {card.bio && (
            <div
              style={{
                fontSize: 10,
                color: TEXT_SECONDARY,
                textAlign: 'center',
                lineHeight: 1.4,
                maxWidth: '90%',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {card.bio}
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}

type AuthorChannelListProps = {
  channels: { id: number; title: string; slug?: string; length?: number }[]
  width: number
  height: number
  padding?: number
  shapeId?: TLShapeId
  paddingTop?: number
  paddingBottom?: number
}

type ChannelRowProps = {
  channel: { id: number; title: string; slug?: string; length?: number }
  index: number
  width: number
  onSelectChannel: (slug?: string) => void
  onChannelPointerDown: (info: { slug?: string; title: string; id: number }, e: React.PointerEvent) => void
  onChannelPointerMove: (info: { slug?: string; title: string; id: number }, e: React.PointerEvent) => void
  onChannelPointerUp: (info: { slug?: string; title: string; id: number }, e: React.PointerEvent) => void
}

export function AuthorChannelList({
  channels,
  width,
  height,
  padding = 10,
  paddingTop = 0,
  paddingBottom = 0,
  shapeId,
}: AuthorChannelListProps) {
  const editor = useEditor()

  const screenToPagePoint = useCallback(
    (clientX: number, clientY: number) => {
      const anyEditor = editor as any
      return (
        anyEditor?.screenToPage?.({ x: clientX, y: clientY }) ||
        anyEditor?.viewportScreenToPage?.({ x: clientX, y: clientY }) || {
          x: editor.getViewportPageBounds().midX,
          y: editor.getViewportPageBounds().midY,
        }
      )
    },
    [editor]
  )

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

  return (
    <div
      style={{
        width,
        height,
        overflow: 'visible',
        position: 'relative',
        padding: `0 ${padding}px`,
        boxSizing: 'border-box',
      }}
      data-interactive="carousel"
      onWheelCapture={(e) => {
        if (e.ctrlKey) return
        e.stopPropagation()
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          overflowY: 'scroll',
          overflowX: 'visible',
          display: 'flex',
          flexDirection: 'column',
          paddingTop,
          paddingBottom,
        }}
      >
        {channels.map((c, idx) => (
          <ChannelRow
            key={c.id ?? idx}
            channel={c}
            index={idx}
            width={width - padding * 2}
            onSelectChannel={handleSelectChannel}
            onChannelPointerDown={handleChannelPointerDown}
            onChannelPointerMove={handleChannelPointerMove}
            onChannelPointerUp={handleChannelPointerUp}
          />
        ))}
      </div>

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

function ChannelRow({
  channel,
  index,
  width,
  onSelectChannel,
  onChannelPointerDown,
  onChannelPointerMove,
  onChannelPointerUp,
}: ChannelRowProps) {
  const showBlockCount = width >= 200

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      // Allow keyboard activation (detail === 0) while pointer clicks route through the drag hook
      if (e.detail !== 0) return
      onSelectChannel(channel.slug)
    },
    [channel.slug, onSelectChannel]
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      onChannelPointerDown(channel as any, e)
    },
    [channel, onChannelPointerDown]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      onChannelPointerUp(channel as any, e)
    },
    [channel, onChannelPointerUp]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      if (e.buttons > 0) onChannelPointerMove(channel as any, e)
    },
    [channel, onChannelPointerMove]
  )

  return (
    <motion.button
      type="button"
      data-interactive="button"
      data-tactile
      data-card-type="channel"
      data-channel-slug={channel.slug}
      data-channel-title={channel.title}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 900, damping: 30, mass: 0.24 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        background: 'transparent',
        border: 'none',
        borderTop: index === 0 ? 'none' : `1px solid ${DESIGN_TOKENS.colors.border}`,
        padding: '8px 0',
        cursor: 'pointer',
        textAlign: 'left',
        userSelect: 'none',
        touchAction: 'none',
        willChange: 'transform',
        borderRadius: 0,
        transformOrigin: 'left center',
        overflow: 'visible',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, overflow: 'visible' }}>
        <OverflowCarouselText
          text={channel.title}
          maxWidthPx={Math.max(160, width - (showBlockCount ? 110 : 60))}
          gapPx={28}
          speedPxPerSec={50}
          fadePx={22}
          textStyle={{
            fontSize: 11,
            fontWeight: 700,
            color: TEXT_PRIMARY,
            letterSpacing: '-0.01em',
            fontFamily: LABEL_FONT_FAMILY,
          }}
        />
        {showBlockCount ? (
          <div style={{ fontSize: 10, color: TEXT_TERTIARY, fontWeight: 700, flexShrink: 0, paddingLeft: 4 }}>
            {typeof channel.length === 'number'
              ? channel.length >= 1000
                ? `${(channel.length / 1000).toFixed(1).replace('.0', '')}k`
                : channel.length
              : ''}
          </div>
        ) : null}
      </div>
    </motion.button>
  )
}

type AuthorViewProps = {
  w: number
  h: number
  cards: Card[]
  source: PortalSource
  shapeId?: TLShapeId
}

export function AuthorView({ w, h, cards, source, shapeId }: AuthorViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const bioCard = cards.find(isAuthorBio) as CardAuthorBio | undefined
  const channelsCard = cards.find(isAuthorChannels) as CardAuthorChannels | undefined

  const mappedChannels =
    channelsCard?.channels.map((c, idx) => ({
      id: c.id ?? idx,
      title: c.title,
      slug: c.slug ?? c.title.toLowerCase().replace(/\s+/g, '-'),
      length: c.blockCount ?? 0,
    })) ?? []

  const isWideLayout = w >= 660 && h >= 360

  // Responsive sizing
  const headerWidth = isWideLayout ? Math.max(220, Math.min(320, w * 0.32)) : Math.max(200, Math.min(360, w - 40))
  const headerMaxHeight = isWideLayout ? Math.min(220, Math.max(120, h * 0.34)) : Math.min(220, Math.max(110, h * 0.22))
  const channelPaneHeight = Math.max(200, h - 88)
  const availableWidth = Math.max(0, w - 24)
  const channelListWidth = isWideLayout
    ? Math.max(0, Math.min(availableWidth, w - headerWidth - 36))
    : availableWidth

  // Profile styling: keep mounted, blur/scale down as space shrinks
  const compactHeight = isWideLayout ? 240 : 190
  const spaciousHeight = isWideLayout ? 430 : 340
  const heightProgress = clamp01((h - compactHeight) / (spaciousHeight - compactHeight))
  const profileProgress = heightProgress
  const profileSlotHeight = isWideLayout ? Math.min(channelPaneHeight, headerMaxHeight) : headerMaxHeight
  const profileScale = 0.65 + 0.55 * (1 - profileProgress)
  const profileBlur = 86 * (1 - profileProgress)
  const profileOpacity = 0.2 + 0.8 * profileProgress
  const profileOffsetY = lerp(-56, 0, profileProgress)
  const listOffset = profileSlotHeight * profileProgress

  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey) return
    e.stopPropagation()
  }, [])

  useWheelControl(containerRef, {
    capture: true,
    passive: false,
    condition: () => false,
    onWheel: handleWheel,
  })

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
          borderRadius: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          padding: '28px 12px 12px 12px',
          boxSizing: 'border-box',
        }}
        data-interactive="carousel"
      >
        <div
          style={{
            position: 'relative',
            flex: 1,
            width: '100%',
            minHeight: 160,
            paddingTop: 6,
          }}
        >
          {bioCard ? (
            <motion.div
              key="author-profile"
              initial={{ opacity: 0, y: -8, filter: 'blur(12px)', scale: 0.68 }}
              animate={{
                opacity: profileOpacity,
                y: profileOffsetY,
                scale: profileScale,
                filter: `blur(${profileBlur}px)`,
              }}
              exit={{ opacity: 0, y: -6, filter: 'blur(10px)', scale: 0.68 }}
              transition={{ type: 'spring', stiffness: 280, damping: 38, mass: 0.7 }}
              style={{
                position: 'absolute',
                top: 8,
                left: 0,
                width: '100%',
                height: profileSlotHeight,
                overflow: 'hidden',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                pointerEvents: 'none',
                zIndex: 0,
              }}
            >
              <div style={{ width: '100%', height: '100%' }}>
                <AuthorProfileCard
                  card={bioCard}
                  width={isWideLayout ? Math.max(260, w - headerWidth - 36) : Math.max(220, w - 24)}
                  height={profileSlotHeight}
                  focused
                />
              </div>
            </motion.div>
          ) : null}

          <div
            style={{
              position: 'relative',
              minHeight: 160,
              width: '100%',
              height: channelPaneHeight,
              overflow: 'hidden',
              display: 'flex',
              zIndex: 1,
            }}
          >
            {channelsCard ? (
              <AuthorChannelList
                channels={mappedChannels}
                width={channelListWidth}
                height={channelPaneHeight}
                padding={12}
                paddingTop={Math.max(12, listOffset)}
                paddingBottom={Math.max(28, listOffset * 0.25)}
                shapeId={shapeId}
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
                }}
              >
                no channels to show
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
