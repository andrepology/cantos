import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useTransform, type MotionValue } from 'motion/react'
import { List, type ListImperativeAPI, type RowComponentProps } from 'react-window'
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

type RowData = {
  options: PortalSourceOption[]
  highlightedIndex: number
  onSelect: (option: PortalSourceOption) => void
  onPointerDown?: (option: PortalSourceOption, e: React.PointerEvent) => void
  onPointerMove?: (option: PortalSourceOption, e: React.PointerEvent) => void
  onPointerUp?: (option: PortalSourceOption, e: React.PointerEvent) => void
  iconSize: number
  rowHeight: number
  rowGap: number
  rowStep: number
  titleEm: string
  lengthEm: string
  authorEm: string
}

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
  const listRef = useRef<ListImperativeAPI | null>(null)

  const [scrollState, setScrollState] = useState({
    canScrollUp: false,
    canScrollDown: false,
    scrollTop: 0,
    maxScroll: 0,
  })
  const titleEm = '0.9em'
  const lengthEm = '0.8em'
  const authorEm = '0.75em'
  const helperEm = `${((fontSize - 2) / fontSize).toFixed(3)}em`
  const rowHeight = Math.max(30, Math.round(fontSize * 2.4))
  const rowGap = 2
  const rowStep = rowHeight + rowGap
  const maxListHeight = 360
  const listPaddingY = 12
  const listHeight = Math.min(maxListHeight, Math.max(1, options.length) * rowStep + listPaddingY)
  const fadePx = 24

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const nextScrollTop = el.scrollTop
    const maxScroll = el.scrollHeight - el.clientHeight
    setScrollState({
      canScrollUp: nextScrollTop > 0,
      canScrollDown: nextScrollTop < maxScroll - 1,
      scrollTop: nextScrollTop,
      maxScroll,
    })
  }, [])


  useEffect(() => {
    const el = listRef.current?.element
    if (!el) return
    const nextScrollTop = el.scrollTop
    const maxScroll = el.scrollHeight - el.clientHeight
    setScrollState({
      canScrollUp: nextScrollTop > 0,
      canScrollDown: nextScrollTop < maxScroll - 1,
      scrollTop: nextScrollTop,
      maxScroll,
    })
  }, [listHeight, options.length])

  const maskImage = useMemo(() => {
    const topFadeStrength = scrollState.canScrollUp
      ? Math.min(1, Math.max(0, scrollState.scrollTop / fadePx))
      : 0

    const bottomFadeStrength = scrollState.canScrollDown
      ? Math.min(1, Math.max(0, (scrollState.maxScroll - scrollState.scrollTop) / fadePx))
      : 0

    const topStops =
      topFadeStrength > 0.01
        ? `transparent 0px, black ${fadePx * topFadeStrength}px`
        : `black 0px`

    const bottomStops =
      bottomFadeStrength > 0.01
        ? `black calc(100% - ${fadePx * bottomFadeStrength}px), transparent 100%`
        : `black 100%`

    return `linear-gradient(to bottom, ${topStops}, ${bottomStops})`
  }, [scrollState, fadePx])

  const getOptionKey = useCallback((option: PortalSourceOption) => {
    if (option.kind === 'channel') {
      return option.channel.slug ?? `channel-${option.channel.id}`
    }
    return `author-${option.author.id}`
  }, [])

  const itemData = useMemo(
    () => ({
      options,
      highlightedIndex,
      onSelect,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      iconSize,
      rowHeight,
      rowGap,
      rowStep,
      titleEm,
      lengthEm,
      authorEm,
    }),
    [
      options,
      highlightedIndex,
      onSelect,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      iconSize,
      rowHeight,
      rowGap,
      rowStep,
      titleEm,
      lengthEm,
      authorEm,
    ]
  )

  const Row = useCallback(
    ({
      index,
      style: rowStyle,
      ariaAttributes,
      ...data
    }: RowComponentProps<RowData>) => {
      const option = data.options[index]
      if (!option) return null
      const isChannel = option.kind === 'channel'
      const title = isChannel ? option.channel.title : option.author.fullName
      const authorName = isChannel ? option.channel.author?.fullName : undefined
      const avatarSrc = isChannel
        ? option.channel.author?.avatarThumb
        : option.author.avatarThumb
      const length = isChannel ? option.channel.length : undefined
      const isHighlighted = index === data.highlightedIndex

      return (
        <div
          style={{
            ...rowStyle,
            height: data.rowStep,
            paddingBottom: data.rowGap,
            boxSizing: 'border-box',
          }}
          {...ariaAttributes}
        >
          <PressableListItem
            data-interactive="result"
            pressScale={0.98}
            hoverScale={1.02}
            stiffness={400}
            damping={25}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 6px',
              borderRadius: DESIGN_TOKENS.borderRadius.medium,
              cursor: 'pointer',
              background: isHighlighted ? DESIGN_TOKENS.colors.ghostBackground : 'transparent',
              border: 'none',
              transition: 'background 120ms ease, transform 120ms ease, box-shadow 120ms ease',
              boxShadow: isHighlighted ? SHAPE_SHADOW : 'none',
              transform: isHighlighted ? 'translateY(-1px)' : 'none',
              height: data.rowHeight,
            }}
            onPointerDown={(e) => {
              data.onPointerDown?.(option, e)
            }}
            onPointerMove={(e) => {
              data.onPointerMove?.(option, e)
            }}
            onPointerUp={(e) => {
              if (data.onPointerUp) {
                data.onPointerUp(option, e)
              } else {
                data.onSelect(option)
              }
              stopEventPropagation(e as any)
            }}
          >
            {!isChannel && <Avatar src={avatarSrc} size={data.iconSize} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
              <OverflowCarouselText
                text={title || ''}
                maxWidthPx={isChannel ? 144 : 120}
                gapPx={32}
                speedPxPerSec={50}
                fadePx={16}
                textStyle={{
                  fontSize: data.titleEm,
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
                    fontSize: data.lengthEm,
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
                  fontSize: data.authorEm,
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
        </div>
      )
    },
    []
  )

  const listStyle = useMemo(
    () => ({
      height: listHeight,
      width: '100%',
      overflowY: 'auto',
      background: DESIGN_TOKENS.colors.surfaceBackground,
      color: TEXT_PRIMARY,
      borderRadius: DESIGN_TOKENS.borderRadius.large,
      border: `1px solid ${DESIGN_TOKENS.colors.border}`,
      boxShadow: DESIGN_TOKENS.shadows.surface,
      padding: '6px 4px',
      backdropFilter: `blur(${DESIGN_TOKENS.blur.subtle})`,
      WebkitBackdropFilter: `blur(${DESIGN_TOKENS.blur.subtle})`,
      maskImage,
      WebkitMaskImage: maskImage,
    }),
    [listHeight, maskImage]
  )

  const statusStyle = useMemo(
    () => ({
      width: '100%',
      maxHeight: maxListHeight,
      overflowY: 'auto',
      background: DESIGN_TOKENS.colors.surfaceBackground,
      color: TEXT_PRIMARY,
      borderRadius: DESIGN_TOKENS.borderRadius.large,
      border: `1px solid ${DESIGN_TOKENS.colors.border}`,
      boxShadow: DESIGN_TOKENS.shadows.surface,
      padding: '6px 4px',
      backdropFilter: `blur(${DESIGN_TOKENS.blur.subtle})`,
      WebkitBackdropFilter: `blur(${DESIGN_TOKENS.blur.subtle})`,
    }),
    [maxListHeight]
  )

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
      {options.length > 0 ? (
        <List
          className="hide-scrollbar"
          rowCount={options.length}
          rowHeight={rowStep}
          rowComponent={Row}
          rowProps={itemData}
          listRef={listRef}
          style={listStyle}
          onScroll={handleScroll}
        />
      ) : (
        <div style={statusStyle} className="hide-scrollbar">
          <div
            style={{
              padding: '10px 12px',
              fontSize: helperEm,
              color: TEXT_SECONDARY,
              fontFamily: LABEL_FONT_FAMILY,
            }}
          >
            {loading ? 'Searching...' : 'No matches'}
          </div>
        </div>
      )}
    </motion.div>
  )
})
