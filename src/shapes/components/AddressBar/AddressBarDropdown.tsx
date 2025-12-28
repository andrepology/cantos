import { memo } from 'react'
import { motion, type MotionValue } from 'motion/react'
import { stopEventPropagation } from 'tldraw'
import { Avatar } from '../../../arena/icons'
import {
  DESIGN_TOKENS,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  LABEL_FONT_FAMILY,
  SHAPE_SHADOW,
} from '../../../arena/constants'
import type { PortalSourceOption } from '../../../arena/search/portalSearchTypes'

export interface AddressBarDropdownProps {
  options: PortalSourceOption[]
  highlightedIndex: number
  onHighlight: (index: number) => void
  onSelect: (option: PortalSourceOption) => void
  fontSize: number
  iconSize: number
  dropdownGap: number
  textScale: MotionValue<number>
}

export const AddressBarDropdown = memo(function AddressBarDropdown({
  options,
  highlightedIndex,
  onHighlight,
  onSelect,
  fontSize,
  iconSize,
  dropdownGap,
  textScale,
}: AddressBarDropdownProps) {
  return (
    <motion.div
      style={{
        position: 'absolute',
        top: `calc(100% - 18px)`,
        left: 0,
        marginTop: dropdownGap,
        transformOrigin: 'top left',
        scale: textScale,
      }}
    >
      <div
        style={{
          width: 260,
          maxHeight: 460,
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
        onPointerDown={(e) => {
          e.preventDefault()
          stopEventPropagation(e as any)
        }}
      >
        {options.length === 0 ? (
          <div
            style={{
              padding: '10px 12px',
              fontSize: `${fontSize - 2}px`,
              color: TEXT_SECONDARY,
              fontFamily: LABEL_FONT_FAMILY,
            }}
          >
            No matches
          </div>
        ) : (
          options.map((option, index) => (
            <div
              key={option.kind === 'channel' ? option.channel.slug : `author-${option.author.id}`}
              data-interactive="result"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 8px',
                borderRadius: DESIGN_TOKENS.borderRadius.medium,
                cursor: 'pointer',
                background:
                  index === highlightedIndex ? DESIGN_TOKENS.colors.ghostBackground : 'transparent',
                transition: 'background 120ms ease, transform 120ms ease, box-shadow 120ms ease',
                boxShadow: index === highlightedIndex ? SHAPE_SHADOW : 'none',
                transform: index === highlightedIndex ? 'translateY(-1px)' : 'none',
              }}
              onPointerEnter={() => onHighlight(index)}
              onPointerUp={(e) => {
                stopEventPropagation(e as any)
                onSelect(option)
              }}
            >
              <Avatar
                src={option.kind === 'channel' ? option.channel.author?.avatarThumb : option.author.avatarThumb}
                size={iconSize}
              />
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span
                  style={{
                    fontSize: `${fontSize - 1}px`,
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    color: TEXT_PRIMARY,
                    fontFamily: LABEL_FONT_FAMILY,
                  }}
                >
                  {option.kind === 'channel' ? option.channel.title : option.author.fullName}
                </span>
                {option.kind === 'channel' && option.channel.author ? (
                  <span
                    style={{
                      fontSize: `${Math.max(fontSize - 3, 9)}px`,
                      color: TEXT_SECONDARY,
                      fontFamily: LABEL_FONT_FAMILY,
                    }}
                  >
                    by {option.channel.author.fullName}
                  </span>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  )
})

