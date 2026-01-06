// React
import React, { useRef, useState, useCallback, useMemo } from 'react'

// Motion/Animation
import { AnimatePresence, motion } from 'motion/react'

// Editor
import { useEditor, type TLShapeId } from 'tldraw'

// Local Components
import { Profile3DCard } from '../../editor/Profile3DCard'
import { ScrollFade } from './ScrollFade'
import { PressableListItem } from './PressableListItem'

// Local Hooks
import { usePortalSpawnDrag } from '../../arena/hooks/usePortalSpawnDrag'
import { useScreenToPagePoint } from '../../arena/hooks/useScreenToPage'

// Local Types & Constants
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

/**
 * SUB-COMPONENT: AuthorProfileHeader
 * Encapsulates the 3D card and scroll-reactive animations.
 */
const AuthorProfileHeader = React.memo(({ 
  avatar, 
  name,
  size, 
  slotHeight, 
  scrollTop,
  tilt,
  layoutId
}: { 
  avatar?: string, 
  name?: string,
  size: number, 
  slotHeight: number, 
  scrollTop: number,
  tilt: { rotateX: number; rotateY: number },
  layoutId?: string
}) => {
  const fadeDistance = Math.max(1, slotHeight * 0.85)
  const progress = clamp01(scrollTop / fadeDistance)
  
  return (
    <motion.div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: slotHeight,
        display: 'flex',
        justifyContent: 'center',
        zIndex: 2,
        opacity: lerp(1, 0.2, progress),
        filter: `blur(${lerp(0, 16, progress)}px)`,
        transform: `translateY(${lerp(0, 14, progress)}px) scale(${lerp(1, 0.9, progress)})`,
        pointerEvents: 'none', // Events now handled by parent container
      }}
    >
      <Profile3DCard avatar={avatar} name={name} size={size} tilt={tilt} layoutId={layoutId} />
    </motion.div>
  )
})

/**
 * SUB-COMPONENT: AuthorChannelList
 * A virtualized list of channels owned by the author.
 */
export const AuthorChannelList = React.memo(({
  channels,
  totalCount,
  width,
  height,
  paddingTop = 0,
  shapeId,
  onScrollOffsetChange,
}: AuthorChannelListProps) => {
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
      style={{ width, height, position: 'relative', overflow: 'visible' }}
      onWheelCapture={(e) => !e.ctrlKey && e.stopPropagation()}
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
              if (!channel) return <div key={`ph-${index}`} style={{ height: ROW_HEIGHT, marginBottom: ROW_GAP }} />
              
              return (
                <PressableListItem
                  key={channel.id ?? index}
                  style={{ minHeight: ROW_HEIGHT, marginBottom: ROW_GAP, width: '100%' }}
                  onPointerDown={(e) => { handleChannelPointerDown(channel as any, e); e.stopPropagation(); }}
                  onPointerMove={(e) => { if (e.buttons > 0) handleChannelPointerMove(channel as any, e); e.stopPropagation(); }}
                  onPointerUp={(e) => { handleChannelPointerUp(channel as any, e); e.stopPropagation(); }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                    <OverflowCarouselText
                      text={channel.title}
                      maxWidthPx={textMaxWidth}
                      gapPx={32}
                      speedPxPerSec={50}
                      fadePx={16}
                      textStyle={{ fontSize: FONT_SIZE * 0.9, fontWeight: 700, color: TEXT_PRIMARY, lineHeight: 1.2 }}
                    />
                    {channel.length !== undefined && (
                      <div style={{ color: TEXT_TERTIARY, fontSize: FONT_SIZE * 0.8, fontWeight: 700, flexShrink: 0 }}>
                        {channel.length >= 1000 ? `${(channel.length / 1000).toFixed(1)}k`.replace('.0k', 'k') : channel.length}
                      </div>
                    )}
                  </div>
                </PressableListItem>
              )
            })}
          </div>
        </div>
      </ScrollFade>
    </div>
  )
})

type AuthorViewProps = {
  w: number
  h: number
  author: AuthorMetadata | null | undefined
  source: PortalSource
  shapeId?: TLShapeId
  isMini?: boolean
}

export function AuthorView({ w, h, author, source, shapeId, isMini = false }: AuthorViewProps) {
  const [scrollTop, setScrollTop] = useState(0)
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0 })

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const nx = Math.max(-1, Math.min(1, (x / rect.width) * 2 - 1))
    const ny = Math.max(-1, Math.min(1, (y / rect.height) * 2 - 1))
    setTilt({ rotateX: -ny * 20, rotateY: nx * 20 })
  }, [])

  const handleMouseLeave = useCallback(() => setTilt({ rotateX: 0, rotateY: 0 }), [])

  const avatar = author?.avatarDisplay ?? author?.avatarThumb ?? (source.kind === 'author' ? source.avatarThumb : undefined)
  const name = author?.fullName ?? author?.username ?? (source.kind === 'author' ? (source as any).title : undefined)
  const profileLayoutId = `author-profile-${(source as any).id ?? 'author'}`

  const mappedChannels = useMemo<ChannelItem[]>(() => {
    if (!author?.channels) return []
    const seen = new Set<string>()
    return (author.channels as any[])
      .filter((c: any) => {
        if (!c) return false
        const key = c.id ? `id:${c.id}` : (c.slug ? `slug:${c.slug}` : null)
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map((c: any, idx: number) => ({
        id: c.id ?? idx,
        title: c.title,
        slug: c.slug ?? c.title.toLowerCase().replace(/\s+/g, '-'),
        length: c.length ?? 0,
      }))
  }, [author?.channels])

  if (isMini) {
    const avatarSize = Math.max(32, Math.min(128, Math.floor(Math.min(w, h) * 0.50)))

    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={`author-view-${(source as any).id ?? 'author'}`}
          initial={{ opacity: 0, scale: SOURCE_TRANSITION.scale }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: SOURCE_TRANSITION.scale }}
          transition={{ duration: SOURCE_TRANSITION.duration, ease: SOURCE_TRANSITION.ease }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{
            width: w,
            height: h,
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            boxSizing: 'border-box',
          }}
        >
          <Profile3DCard avatar={avatar} name={name} size={avatarSize} tilt={tilt} layoutId={profileLayoutId} />
        </motion.div>
      </AnimatePresence>
    )
  }

  const avatarSize = Math.max(32, Math.min(128, Math.floor(Math.min(w, h) * 0.50)))
  const avatarSlotHeight = avatarSize + (isMini ? 40 : 72) // 36 top + 36 bottom padding
  const paddingTop = isMini ? 0 : 16
  const paddingBottom = isMini ? 0 : 12
  const listHeight = Math.max(0, h - (paddingTop + paddingBottom))

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`author-view-${(source as any).id ?? 'author'}`}
        initial={{ opacity: 0, scale: SOURCE_TRANSITION.scale }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: SOURCE_TRANSITION.scale }}
        transition={{ duration: SOURCE_TRANSITION.duration, ease: SOURCE_TRANSITION.ease }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          width: w,
          height: h,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          padding: `${paddingTop}px 12px ${paddingBottom}px`,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ position: 'relative', flex: 1, minHeight: 120 }}>
          <AuthorProfileHeader 
            avatar={avatar} 
            name={name}
            size={avatarSize} 
            slotHeight={avatarSlotHeight} 
            scrollTop={scrollTop} 
            tilt={tilt}
            layoutId={profileLayoutId}
          />

          {!isMini && mappedChannels.length > 0 ? (
            <AuthorChannelList
              channels={mappedChannels}
              totalCount={Math.max(mappedChannels.length, author?.channelCount ?? 0)}
              width={Math.max(0, w - 24)}
              height={listHeight}
              paddingTop={avatarSlotHeight}
              shapeId={shapeId}
              onScrollOffsetChange={setScrollTop}
            />
          ) : !isMini ? (
            <div style={{
              width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: TEXT_SECONDARY, fontSize: 12, paddingTop: avatarSlotHeight, boxSizing: 'border-box'
            }}>
              {author?.channelsLoading ? 'loading channels...' : 'no channels to show'}
            </div>
          ) : null}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
