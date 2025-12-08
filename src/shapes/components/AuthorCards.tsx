import { useRef, useState, useCallback, useMemo } from 'react'
import { motion } from 'motion/react'
import { useEditor, type TLShapeId } from 'tldraw'
import { Profile3DCard } from '../../editor/Profile3DCard'
import { ArenaUserChannelsIndex } from '../../arena/ArenaUserChannelsIndex'
import type { CardAuthorBio, CardAuthorChannels } from '../../arena/types'
import { usePortalSpawnDrag } from '../../arena/hooks/usePortalSpawnDrag'
import { PortalSpawnGhost } from '../../arena/components/PortalSpawnGhost'

type AuthorProfileCardProps = {
  card: CardAuthorBio
  width: number
  height: number
  focused?: boolean
}

export function AuthorProfileCard({ card, width, height, focused = false }: AuthorProfileCardProps) {
  // Fixed avatar size to prevent jitter when parent layout animates.
  const avatarSize = useRef(Math.max(72, Math.min(110, Math.min(width, height) * 0.55))).current
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
        gap: 8,
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
          pointerEvents: 'auto', // allow hover tilt from Profile3DCard
        }}
        animate={{ scale: focused ? 1.05 : 1, y: focused ? -6 : 0 }}
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
            gap: 6,
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

export function AuthorChannelsCard({
  card,
  width,
  height,
  shapeId,
}: {
  card: CardAuthorChannels
  width: number
  height: number
  shapeId?: TLShapeId
}) {
  const editor = useEditor()
  const padding = 8
  const innerWidth = Math.max(140, width - padding * 2)
  const innerHeight = Math.max(140, height - padding * 2)

  // Favor a tall aspect ratio for the card content while staying within the layout slot.
  const desiredAspect = 1.4 // height / width
  let listWidth = Math.min(innerWidth, 340)
  let listHeight = Math.min(innerHeight, Math.max(160, listWidth * desiredAspect))
  if (listHeight > innerHeight) {
    listHeight = innerHeight
    listWidth = Math.max(140, Math.min(innerWidth, listHeight / desiredAspect))
  }

  const channels = card.channels.map((c, idx) => ({
    id: c.id ?? idx,
    title: c.title,
    slug: c.slug ?? c.title.toLowerCase().replace(/\s+/g, '-'),
    length: c.blockCount ?? 0,
  })) as any

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

  const portalSpawnDimensions = useMemo(() => ({ w: 180, h: 180 }), [])

  const getSpawnPayload = useCallback(
    (ch: { slug: string; title: string }) => {
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
  } = usePortalSpawnDrag<{ slug: string; title: string; id: number }>({
    thresholdPx: 12,
    screenToPagePoint,
    getSpawnPayload,
    defaultDimensions: portalSpawnDimensions,
    selectSpawnedShape: false,
  })

  const handleSelectChannel = useCallback(
    (slug: string) => {
      if (!shapeId) return
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

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding,
      }}
    >
      <ArenaUserChannelsIndex
        loading={false}
        error={null}
        channels={channels}
        width={listWidth}
        height={listHeight}
        padding={padding}
        compact
        showCheckbox={false}
        onSelectChannel={handleSelectChannel}
        onChannelPointerDown={(info, e) => handleChannelPointerDown(info, e)}
        onChannelPointerMove={(info, e) => handleChannelPointerMove(info, e)}
        onChannelPointerUp={(info, e) => handleChannelPointerUp(info, e)}
      />
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
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{channel.title}</span>
            <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.45)' }}>{channel.length ?? ''}</span>
          </div>
          )
        }}
      />
    </div>
  )
}
