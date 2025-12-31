import { memo, useRef, useEffect, useCallback } from 'react'
import { motion, type MotionValue } from 'motion/react'
import { stopEventPropagation } from 'tldraw'
import { TEXT_SECONDARY, LABEL_FONT_FAMILY } from '../../../arena/constants'
import type { PortalSourceOption, PortalSourceSelection } from '../../../arena/search/portalSearchTypes'
import { AddressBarDropdown } from './AddressBarDropdown'
import { useAddressBarSearch } from './useAddressBarSearch'

export interface AddressBarSearchProps {
  options: PortalSourceOption[]
  displayText: string
  initialCaret?: number
  onSourceChange: (next: PortalSourceSelection) => void
  onClose: () => void
  fontSize: number
  iconSize: number
  dropdownGap: number
  textScale: MotionValue<number>
  textAlign?: 'left' | 'center' | 'right'
  paddingLeft?: number
  applyTextScale?: boolean
}

export const AddressBarSearch = memo(function AddressBarSearch({
  options,
  displayText,
  initialCaret,
  onSourceChange,
  onClose,
  fontSize,
  iconSize,
  dropdownGap,
  textScale,
  textAlign = 'left',
  paddingLeft = 0,
  applyTextScale = true,
}: AddressBarSearchProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  
  const {
    query,
    setQuery,
    filteredOptions,
    highlightedIndex,
    setHighlightedIndex,
    loading,
  } = useAddressBarSearch(options, displayText)

  // Auto-focus and set caret position when search opens
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!inputRef.current) return
      const position = initialCaret ?? displayText.length
      inputRef.current.focus()
      inputRef.current.setSelectionRange(position, position)
    }, 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value)
      setHighlightedIndex(0)
    },
    [setQuery, setHighlightedIndex]
  )

  const selectOption = useCallback(
    (option: PortalSourceOption) => {
      if (option.kind === 'channel') {
        onSourceChange({ kind: 'channel', slug: option.channel.slug })
      } else {
        onSourceChange({
          kind: 'author',
          userId: option.author.id,
          fullName: option.author.fullName,
          avatarThumb: option.author.avatarThumb,
        })
      }
      onClose()
    },
    [onSourceChange, onClose]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (!filteredOptions.length) return
        setHighlightedIndex((prev) => {
          if (prev < 0) return 0
          return (prev + 1) % filteredOptions.length
        })
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (!filteredOptions.length) return
        setHighlightedIndex((prev) => {
          if (prev <= 0) return filteredOptions.length - 1
          return prev - 1
        })
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          selectOption(filteredOptions[highlightedIndex])
        } else {
          const slug = query.trim()
          if (slug) {
            onSourceChange({ kind: 'channel', slug })
            onClose()
          }
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [filteredOptions, highlightedIndex, onSourceChange, query, selectOption, setHighlightedIndex, onClose]
  )

  if (!options) return null

  return (
    <div
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
        data-interactive="search"
        style={{
          transformOrigin: 'top left',
          scale: applyTextScale ? textScale : 1,
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="search channels"
          onKeyDown={handleKeyDown}
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
            paddingLeft: `${paddingLeft}px`,
            margin: 0,
            width: '100%',
            textAlign,
          }}
        />
      </motion.div>
      <AddressBarDropdown
        options={filteredOptions}
        highlightedIndex={highlightedIndex}
        onHighlight={setHighlightedIndex}
        onSelect={selectOption}
        fontSize={fontSize}
        iconSize={iconSize}
        dropdownGap={dropdownGap}
        textScale={textScale}
        loading={loading}
      />
    </div>
  )
})
