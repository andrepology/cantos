import { memo } from 'react'
import { motion, useTransform, type MotionValue } from 'motion/react'
import { stopEventPropagation } from 'tldraw'
import { Avatar } from '../../../arena/icons'
import { OverflowCarouselText } from '../../../arena/OverflowCarouselText'
import {
  DESIGN_TOKENS,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_TERTIARY,
  LABEL_FONT_FAMILY,
  SHAPE_SHADOW,
} from '../../../arena/constants'
import type { PortalSourceOption } from '../../../arena/search/portalSearchTypes'
import { PressableListItem } from '../PressableListItem'
import { ScrollFade } from '../ScrollFade'

export interface AddressBarDropdownProps {
  options: PortalSourceOption[]
  highlightedIndex: number
  onHighlight: (index: number) => void
  onSelect: (option: PortalSourceOption) => void
  onPointerDown?: (option: PortalSourceOption, e: React.PointerEvent) => void
  onPointerMove?: (option: PortalSourceOption, e: React.PointerEvent) => void
  onPointerUp?: (option: PortalSourceOption, e: React.PointerEvent) => void
  fontSize: number
  iconSize: number
  dropdownGap: number
  textScale: MotionValue<number>
  loading?: boolean
  style?: React.CSSProperties
}

export const AddressBarDropdown = memo(function AddressBarDropdown({
  options,
  highlightedIndex,
  onHighlight,
  onSelect,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  fontSize,
  iconSize,
  dropdownGap,
  textScale,
  loading = false,
  style,
}: AddressBarDropdownProps) {
  const scaledFontSize = useTransform(
    textScale,
    (scale) => `${Math.round(fontSize * scale * 100) / 100}px`
  )
  const titleEm = '0.9em'
  const lengthEm = '0.8em'
  const authorEm = '0.75em'
  const helperEm = `${((fontSize - 2) / fontSize).toFixed(3)}em`

  return (
    <motion.div
      style={{
        position: 'absolute',
        top: `calc(100% - 18px)`,
        left: 0,
        width: '100%',
        marginTop: dropdownGap,
        transformOrigin: 'top left',
        fontSize: scaledFontSize,
        zIndex: 10003,
        ...style,
      }}
      onPointerDown={(e) => {
        e.preventDefault()
        stopEventPropagation(e as any)
      }}
      onWheelCapture={(e) => {
        if (e.ctrlKey) return
        e.stopPropagation()
      }}
    >
      <ScrollFade
        stopWheelPropagation
        fadePx={24}
        style={{
          width: '100%',
          maxHeight: '100%',
          overflowY: 'auto',
          background: DESIGN_TOKENS.colors.surfaceBackgroundDense,
          color: TEXT_PRIMARY,
          borderRadius: DESIGN_TOKENS.borderRadius.large,
          border: `1px solid ${DESIGN_TOKENS.colors.border}`,
          boxShadow: DESIGN_TOKENS.shadows.card,
          padding: '8px 6px',
          backdropFilter: `blur(${DESIGN_TOKENS.blur.subtle})`,
          WebkitBackdropFilter: `blur(${DESIGN_TOKENS.blur.subtle})`,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {loading ? (
          <div
            style={{
              padding: '10px 12px',
              fontSize: helperEm,
              color: TEXT_SECONDARY,
              fontFamily: LABEL_FONT_FAMILY,
            }}
          >
            Loading...
          </div>
        ) : options.length === 0 ? (
          <div
            style={{
              padding: '10px 12px',
              fontSize: helperEm,
              color: TEXT_SECONDARY,
              fontFamily: LABEL_FONT_FAMILY,
            }}
          >
            No matches
          </div>
        ) : (
          options.map((option, index) => {
            const isChannel = option.kind === 'channel'
            const title = isChannel ? option.channel.title : option.author.fullName
            const authorName = isChannel ? option.channel.author?.fullName : undefined
            const avatarSrc = isChannel
              ? option.channel.author?.avatarThumb
              : option.author.avatarThumb
            const length = isChannel ? option.channel.length : undefined
            const isHighlighted = index === highlightedIndex

            return (
              <PressableListItem
                key={isChannel ? option.channel.slug : `author-${option.author.id}`}
                data-interactive="result"
                pressScale={0.98}
                hoverScale={1.02}
                stiffness={400}
                damping={25}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 8px',
                  borderRadius: DESIGN_TOKENS.borderRadius.medium,
                  cursor: 'pointer',
                  background: isHighlighted ? DESIGN_TOKENS.colors.ghostBackground : 'transparent',
                  border: 'none',
                  transition: 'background 120ms ease, transform 120ms ease, box-shadow 120ms ease',
                  boxShadow: isHighlighted ? SHAPE_SHADOW : 'none',
                  transform: isHighlighted ? 'translateY(-1px)' : 'none',
                }}
                onPointerDown={(e) => {
                  onPointerDown?.(option, e)
                }}
                onPointerMove={(e) => {
                  onPointerMove?.(option, e)
                }}
                onPointerUp={(e) => {
                  if (onPointerUp) {
                    onPointerUp(option, e)
                  } else {
                    onSelect(option)
                  }
                  stopEventPropagation(e as any)
                }}
              >
                {!isChannel && <Avatar src={avatarSrc} size={iconSize} />}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                  <OverflowCarouselText
                    text={title || ''}
                    maxWidthPx={isChannel ? 144 : 120}
                    gapPx={32}
                    speedPxPerSec={50}
                    fadePx={16}
                    textStyle={{
                      fontSize: titleEm,
                      fontWeight: 700,
                      color: TEXT_PRIMARY,
                      lineHeight: 1.2,
                      fontFamily: LABEL_FONT_FAMILY,
                    }}
                  />
                  {length !== undefined && (
                    <div
                      style={{
                        color: TEXT_TERTIARY,
                        fontSize: lengthEm,
                        letterSpacing: '-0.01em',
                        fontWeight: 700,
                        lineHeight: 1.2,
                        flexShrink: 0,
                      }}
                    >
                      {length >= 1000
                        ? `${(length / 1000).toFixed(1)}k`.replace('.0k', 'k')
                        : length}
                    </div>
                  )}
                </div>
                {authorName && (
                  <div
                    title={authorName}
                    style={{
                      color: TEXT_TERTIARY,
                      fontSize: authorEm,
                      maxWidth: 80,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      lineHeight: 1.2,
                      marginLeft: 'auto',
                      fontFamily: LABEL_FONT_FAMILY,
                    }}
                  >
                    {authorName}
                  </div>
                )}
              </PressableListItem>
            )
          })
        )}
      </ScrollFade>
    </motion.div>
  )
})
