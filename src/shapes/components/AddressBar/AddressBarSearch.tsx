import { memo, type RefObject } from 'react'
import { motion, type MotionValue } from 'motion/react'
import { stopEventPropagation } from 'tldraw'
import { TEXT_SECONDARY, LABEL_FONT_FAMILY } from '../../../arena/constants'
import type { PortalSourceOption } from '../../../arena/search/portalSearchTypes'
import { AddressBarDropdown } from './AddressBarDropdown'

export interface AddressBarSearchProps {
  open: boolean
  query: string
  onQueryChange: (value: string) => void
  onClose: () => void
  onSelect: (option: PortalSourceOption) => void
  options: PortalSourceOption[]
  highlightedIndex: number
  onHighlight: (index: number) => void
  fontSize: number
  iconSize: number
  inputRef: RefObject<HTMLInputElement | null>
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  dropdownGap: number
  textScale: MotionValue<number>
}

export const AddressBarSearch = memo(function AddressBarSearch({
  open,
  query,
  onQueryChange,
  onClose,
  onSelect,
  options,
  highlightedIndex,
  onHighlight,
  fontSize,
  iconSize,
  inputRef,
  onKeyDown,
  dropdownGap,
  textScale,
}: AddressBarSearchProps) {
  if (!open) return null

  return (
    <div
      data-interactive="search"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10002,
        paddingBottom: 40,
        background: 'transparent',
      }}
      onPointerDown={stopEventPropagation}
    >
      <motion.div
        style={{
          transformOrigin: 'top left',
          scale: textScale,
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="search channels"
          onKeyDown={onKeyDown}
          onBlur={onClose}
          style={{
            fontFamily: LABEL_FONT_FAMILY,
            fontSize: `${fontSize}px`,
            fontWeight: 600,
            letterSpacing: '-0.0125em',
            background: 'transparent',
            color: TEXT_SECONDARY,
            border: 'none',
            outline: 'none',
            borderRadius: 0,
            padding: 0,
            margin: 0,
            width: '100%',
          }}
        />
      </motion.div>
      <AddressBarDropdown
        options={options}
        highlightedIndex={highlightedIndex}
        onHighlight={onHighlight}
        onSelect={onSelect}
        fontSize={fontSize}
        iconSize={iconSize}
        dropdownGap={dropdownGap}
        textScale={textScale}
      />
    </div>
  )
})

