import { useRef, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useEditor, type TLShapeId } from 'tldraw'
import { Profile3DCard } from '../../editor/Profile3DCard'
import { usePortalSpawnDrag } from '../../arena/hooks/usePortalSpawnDrag'
import { PortalSpawnGhost } from '../../arena/components/PortalSpawnGhost'
import type { Card, CardAuthorBio, CardAuthorChannels } from '../../arena/types'
import type { PortalSource } from './PortalAddressBar'
import { usePressFeedback } from '../../hooks/usePressFeedback'
import { OverflowCarouselText } from '../../arena/OverflowCarouselText'
import { LABEL_FONT_FAMILY } from '../../arena/constants'

const SOURCE_TRANSITION = {
  duration: 0.18,
  ease: 'easeOut' as const,
  scale: 0.985,
}

const isAuthorBio = (card: Card): card is CardAuthorBio => card.type === 'author-bio'
const isAuthorChannels = (card: Card): card is CardAuthorChannels => card.type === 'author-channels'
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

type AuthorProfileCardProps = {
  card: CardAuthorBio
  width: number
  height: number
  focused?: boolean
}

export function AuthorProfileCard({ card, width, height, focused = false }: AuthorProfileCardProps) {
  const avatarSize = useRef(Math.max(52, Math.min(88, Math.min(width, height) * 0.38))).current
  const [tilt, setTilt] = useState<{ rotateX: number; rotateY: number }>({ rotateX: 0, rotateY: 0 })

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
      {focused && (
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
              color: 'rgba(0,0,0,0.55)',
              fontWeight: 600,
              letterSpacing: '-0.01em',
            }}
          >
            <span>⬜ {card.blockCount ?? '—'}</span>
            <span>↗ {card.followingCount ?? '—'}</span>
            <span>★ {card.followerCount ?? '—'}</span>
          </div>
          {card.bio && (
            <div
              style={{
                fontSize: 10,
                color: 'rgba(0,0,0,0.6)',
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
        overflow: 'hidden',
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
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
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
                color: 'rgba(0,0,0,0.8)',
              }}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 140,
                }}
              >
                {channel.title}
              </span>
              <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.45)' }}>
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
  const { pressScale, bind } = usePressFeedback({ scale: 0.985, hoverScale: 1.02, stiffness: 520, damping: 32 })
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
      bind.onPointerDown(e)
      onChannelPointerDown(channel as any, e)
    },
    [bind, channel, onChannelPointerDown]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      bind.onPointerUp(e)
      onChannelPointerUp(channel as any, e)
    },
    [bind, channel, onChannelPointerUp]
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
      onMouseEnter={(e) => bind.onMouseEnter(e)}
      onMouseLeave={(e) => bind.onMouseLeave(e)}
      whileHover={{ scale: 1.008 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 520, damping: 36, mass: 0.35 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        background: 'transparent',
        border: 'none',
        borderTop: index === 0 ? 'none' : '1px solid #e8e8e8',
        padding: '8px 0',
        cursor: 'pointer',
        textAlign: 'left',
        userSelect: 'none',
        touchAction: 'none',
        scale: pressScale,
        willChange: 'transform',
        borderRadius: 0,
        transformOrigin: 'left center',
        overflow: 'visible',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <OverflowCarouselText
          text={channel.title}
          maxWidthPx={Math.max(160, width - (showBlockCount ? 110 : 60))}
          gapPx={28}
          speedPxPerSec={50}
          fadePx={22}
          textStyle={{
            fontSize: 11,
            fontWeight: 700,
            color: 'rgba(0,0,0,.86)',
            letterSpacing: '-0.01em',
            fontFamily: LABEL_FONT_FAMILY,
          }}
        />
        {showBlockCount ? (
          <div style={{ fontSize: 10, color: 'rgba(0,0,0,.45)', fontWeight: 700, flexShrink: 0, paddingLeft: 4 }}>
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

  // Profile styling: keep mounted, blur/scale down as space shrinks
  const profileProgress = clamp01((headerMaxHeight - 90) / 120) // 0 around 90px, 1 around 210px
  const profileScale = 0.78 + 0.22 * profileProgress
  const profileBlur = 6 * (1 - profileProgress)
  const profileOpacity = 0.25 + 0.75 * profileProgress

  return (
    <AnimatePresence mode="wait">
      <motion.div
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
            display: isWideLayout ? 'grid' : 'flex',
            gridTemplateColumns: isWideLayout ? `${headerWidth}px 1fr` : undefined,
            gap: isWideLayout ? 16 : 12,
            flexDirection: isWideLayout ? undefined : 'column',
            alignItems: isWideLayout ? 'stretch' : 'flex-start',
            flex: 1,
            width: '100%',
            minHeight: 160,
            paddingTop: 6,
          }}
        >
          <AnimatePresence initial={false}>
            {bioCard ? (
              <motion.div
                key="author-profile"
                initial={isWideLayout ? { opacity: 0, x: -14, filter: 'blur(6px)', scale: 0.78 } : { opacity: 0, y: -10, filter: 'blur(6px)', scale: 0.78 }}
                animate={
                  isWideLayout
                    ? { opacity: profileOpacity, x: 0, scale: profileScale, filter: `blur(${profileBlur}px)` }
                    : { opacity: profileOpacity, y: 0, scale: profileScale, filter: `blur(${profileBlur}px)` }
                }
                exit={isWideLayout ? { opacity: 0, x: -12 } : { opacity: 0, y: -8 }}
                transition={{ type: 'spring', stiffness: 560, damping: 38, mass: 0.55 }}
                style={{
                  width: isWideLayout ? headerWidth : '100%',
                  height: isWideLayout ? channelPaneHeight : headerMaxHeight,
                  overflow: 'hidden',
                  display: 'flex',
                  justifyContent: 'center',
                  paddingTop: isWideLayout ? 8 : 8,
                }}
              >
                <div style={{ width: '100%', height: '100%' }}>
                  <AuthorProfileCard
                    card={bioCard}
                    width={isWideLayout ? headerWidth : headerWidth}
                    height={isWideLayout ? channelPaneHeight : headerMaxHeight}
                    focused
                  />
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div
            style={{
              minHeight: 160,
              width: '100%',
              overflow: 'hidden',
              display: 'flex',
            }}
          >
            {channelsCard ? (
              <AuthorChannelList
                channels={mappedChannels}
                width={isWideLayout ? Math.max(260, w - headerWidth - 36) : Math.max(220, w - 24)}
                height={channelPaneHeight}
                padding={12}
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
                  color: 'rgba(0,0,0,0.5)',
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
