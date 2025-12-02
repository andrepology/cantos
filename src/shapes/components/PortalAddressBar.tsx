import { useState, useMemo, useRef, useEffect, useCallback, type CSSProperties, type RefObject } from 'react'
import { stopEventPropagation } from 'tldraw'
import { Avatar } from '../../arena/icons'
import { TEXT_SECONDARY, TEXT_TERTIARY, SHAPE_SHADOW } from '../../arena/constants'
import { isInteractiveTarget } from '../../arena/dom'
import { getCaretPositionFromClick, LABEL_FONT_FAMILY } from './labelUtils'

export interface PortalAuthor {
  id: number
  name: string
  avatar?: string
}

export interface PortalChannel {
  slug: string
  title: string
  author?: PortalAuthor
}

export type PortalSourceOption =
  | { kind: 'channel'; channel: PortalChannel }
  | { kind: 'author'; author: PortalAuthor }

export type PortalSourceSelection =
  | { kind: 'channel'; slug: string }
  | { kind: 'author'; userId: number; name?: string; avatar?: string }

export const MOCK_PORTAL_SOURCES: PortalSourceOption[] = [
  {
    kind: 'channel',
    channel: {
      slug: 'spectrum-salon',
      title: 'Spectrum Salon',
      author: { id: 1, name: 'Opal Nadir', avatar: 'https://avatar.vercel.sh/opal' },
    },
  },
  {
    kind: 'channel',
    channel: {
      slug: 'astrograph-courier',
      title: 'Astrograph Courier',
      author: { id: 2, name: 'Celia Orbitz', avatar: 'https://avatar.vercel.sh/celia' },
    },
  },
  {
    kind: 'channel',
    channel: {
      slug: 'mycelium-commons',
      title: 'Mycelium Commons',
      author: { id: 3, name: 'Fable Dyad', avatar: 'https://avatar.vercel.sh/fable' },
    },
  },
  {
    kind: 'channel',
    channel: {
      slug: 'luminous-logs',
      title: 'Luminous Logs',
      author: { id: 4, name: 'Harper Sable', avatar: 'https://avatar.vercel.sh/harper' },
    },
  },
  {
    kind: 'author',
    author: {
      id: 42,
      name: 'Isolde Finch',
      avatar: 'https://avatar.vercel.sh/isolde',
    },
  },
]

export interface PortalAddressBarLayout {
  top: number
  width: number
  height: number
  paddingLeft: number
  fontSize: number
  iconSize: number
}

export interface PortalAddressBarProps {
  layout: PortalAddressBarLayout
  source: PortalSourceOption
  focusedBlock?: { id: number | string; title: string } | null
  isSelected: boolean
  options: PortalSourceOption[]
  onSourceChange: (next: PortalSourceSelection) => void
  editor: any
  shapeId: string
  zoom: number
}

export function PortalAddressBar({
  layout,
  source,
  focusedBlock,
  isSelected,
  options,
  onSourceChange,
  editor,
  shapeId,
  zoom,
}: PortalAddressBarProps) {
  const [isEditing, setIsEditing] = useState(false)
  const {
    query,
    setQuery,
    filteredOptions,
    highlightedIndex,
    setHighlightedIndex,
  } = usePortalSourceSearch(options)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const labelTextRef = useRef<HTMLSpanElement>(null)
  const dropdownGapPx = useMemo(() => {
    const safeZoom = Math.max(0.1, zoom)
    return 4 / safeZoom
  }, [zoom])

  const blockTitle = focusedBlock?.title ?? ''
  const showBlockTitle = Boolean(focusedBlock)
  const author = source.kind === 'channel' ? source.channel.author : null
  const displayText = useMemo(() => {
    if (source.kind === 'channel') {
      return source.channel.title || source.channel.slug || 'Channel'
    }
    return source.author.name || 'Author'
  }, [source])
  const showAuthorChip = Boolean(author) && isSelected && !isEditing

  const selectOption = useCallback(
    (option: PortalSourceOption) => {
      if (option.kind === 'channel') {
        onSourceChange({ kind: 'channel', slug: option.channel.slug })
      } else {
        onSourceChange({
          kind: 'author',
          userId: option.author.id,
          name: option.author.name,
          avatar: option.author.avatar,
        })
      }
      setIsEditing(false)
    },
    [onSourceChange]
  )

  useEffect(() => {
    if (!isSelected && isEditing) {
      setIsEditing(false)
    }
  }, [isSelected, isEditing])

  useEffect(() => {
    if (isEditing) {
      setQuery(displayText)
    }
  }, [isEditing, displayText, setQuery])

  const beginEditing = useCallback(
    (caret?: number) => {
      if (!isSelected) {
        editor.setSelectedShapes([shapeId])
      }
      setIsEditing(true)
      setQuery(displayText)
      requestAnimationFrame(() => {
        const position = caret ?? displayText.length
        inputRef.current?.focus()
        inputRef.current?.setSelectionRange(position, position)
      })
    },
    [isSelected, editor, shapeId, displayText, setQuery]
  )

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (showBlockTitle) return

    const interactive = isInteractiveTarget(e.target)
    if (!interactive && !(e.target as HTMLElement | null)?.closest('[data-label-text]')) {
      return
    }

    stopEventPropagation(e as any)

    if (!isSelected) {
      editor.setSelectedShapes([shapeId])
      return
    }

    if (interactive) return

    const labelEl = labelTextRef.current
    if (!labelEl) return
    const rect = labelEl.getBoundingClientRect()
    const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
    const caret = getCaretPositionFromClick(displayText, clickX, layout.fontSize, LABEL_FONT_FAMILY)
    beginEditing(caret)
  }

  const baseRowStyle: CSSProperties = {
    fontFamily: LABEL_FONT_FAMILY,
    fontSize: `${layout.fontSize}px`,
    fontWeight: 600,
    letterSpacing: '-0.0125em',
    color: TEXT_SECONDARY,
    padding: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minWidth: 0,
    height: '100%',
    pointerEvents: 'auto',
    userSelect: isSelected ? 'text' : 'none',
    gap: 6,
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setIsEditing(false)
    }
  }

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value)
      setHighlightedIndex(0)
    },
    [setQuery, setHighlightedIndex]
  )

  return (
    <div
      style={{
        position: 'absolute',
        top: layout.top,
        left: 0,
        width: layout.width,
        height: Math.max(layout.height, layout.fontSize + 8),
        pointerEvents: 'none',
        zIndex: 8,
      }}
    >
      <div
        style={{
          ...baseRowStyle,
          paddingLeft: layout.paddingLeft,
          paddingRight: 8,
          width: '100%',
          boxSizing: 'border-box',
          overflow: isEditing ? 'visible' : 'hidden',
        }}
        onPointerDown={handlePointerDown}
        onPointerUp={(e) => {
          if (isInteractiveTarget(e.target)) {
            stopEventPropagation(e as any)
          }
        }}
        onPointerMove={(e) => {
          if (e.buttons > 0 && isInteractiveTarget(e.target)) {
            stopEventPropagation(e as any)
          }
        }}
      >
        <div style={{ position: 'relative', flex: '1 1 auto', minWidth: 0 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: 0,
              minWidth: 0,
              maxWidth: '100%',
            }}
          >
            <span
              ref={labelTextRef}
              data-label-text
              style={{
                display: 'inline-block',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                pointerEvents: showBlockTitle ? 'none' : 'auto',
                opacity: isEditing ? 0 : 1,
                transition: 'opacity 120ms ease',
                marginRight: showAuthorChip ? 4 : 0,
              }}
            >
              {displayText || 'search arena'}
            </span>
            {author ? (
              <span
                data-interactive="author-chip"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  minWidth: 0,
                  opacity: showAuthorChip ? 1 : 0,
                  flex: showAuthorChip ? '0 1 auto' : '0 0 0px',
                  width: showAuthorChip ? 'auto' : 0,
                  transition: 'opacity 420ms ease',
                  pointerEvents: showAuthorChip ? 'auto' : 'none',
                  color: TEXT_TERTIARY,
                  overflow: 'hidden',
                }}
              >
                <span style={{ fontSize: `${layout.fontSize}px` }}>by</span>
                <span
                  style={{
                    width: layout.iconSize,
                    height: layout.iconSize,
                    flex: '0 0 auto',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Avatar src={author.avatar} size={layout.iconSize} />
                </span>
                <span
                  style={{
                    fontSize: `${layout.fontSize}px`,
                    color: TEXT_TERTIARY,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {author.name}
                </span>
              </span>
            ) : null}
          </div>

          {showBlockTitle ? (
            <span
              style={{
                position: 'absolute',
                inset: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                color: TEXT_TERTIARY,
                pointerEvents: 'auto',
                opacity: showBlockTitle ? 1 : 0,
                transition: 'opacity 120ms ease',
              }}
            >
              {blockTitle}
            </span>
          ) : null}

          <PortalSourceSearchOverlay
            open={isEditing}
            query={query}
            onQueryChange={handleQueryChange}
            onClose={() => setIsEditing(false)}
            onSelect={selectOption}
            options={filteredOptions}
            highlightedIndex={highlightedIndex}
            onHighlight={setHighlightedIndex}
            fontSize={layout.fontSize}
            iconSize={layout.iconSize}
            inputRef={inputRef}
            onKeyDown={handleKeyDown}
            dropdownGap={dropdownGapPx}
          />
        </div>
      </div>
    </div>
  )
}

function usePortalSourceSearch(options: PortalSourceOption[]) {
  const [query, setQuery] = useState('')
  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options
    const lower = query.trim().toLowerCase()
    return options.filter((option) => {
      const title =
        option.kind === 'channel'
          ? option.channel.title || option.channel.slug
          : option.author.name
      return title?.toLowerCase().includes(lower)
    })
  }, [options, query])

  const [highlightedIndex, setHighlightedIndex] = useState(() =>
    filteredOptions.length > 0 ? 0 : -1
  )

  useEffect(() => {
    setHighlightedIndex(filteredOptions.length > 0 ? 0 : -1)
  }, [filteredOptions])

  const updateQuery = useCallback((value: string) => {
    setQuery(value)
  }, [])

  return {
    query,
    setQuery: updateQuery,
    filteredOptions,
    highlightedIndex,
    setHighlightedIndex,
  }
}

interface PortalSourceSearchOverlayProps {
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
}

function PortalSourceSearchOverlay({
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
}: PortalSourceSearchOverlayProps) {
  if (!open) return null

  return (
    <div
      data-interactive="search"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10,
        paddingBottom: 40,
        background: 'transparent',
      }}
      onPointerDown={stopEventPropagation}
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
      <PortalSourceDropdown
        options={options}
        highlightedIndex={highlightedIndex}
        onHighlight={onHighlight}
        onSelect={onSelect}
        fontSize={fontSize}
        iconSize={iconSize}
        dropdownGap={dropdownGap}
      />
    </div>
  )
}

interface PortalSourceDropdownProps {
  options: PortalSourceOption[]
  highlightedIndex: number
  onHighlight: (index: number) => void
  onSelect: (option: PortalSourceOption) => void
  fontSize: number
  iconSize: number
  dropdownGap: number
}

function PortalSourceDropdown({
  options,
  highlightedIndex,
  onHighlight,
  onSelect,
  fontSize,
  iconSize,
  dropdownGap,
}: PortalSourceDropdownProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: `calc(100% - ${dropdownGap}px)`,
        left: 0,
        marginTop: dropdownGap,
        minWidth: 220,
        maxWidth: 320,
        maxHeight: 260,
        overflowY: 'auto',
        background: 'rgba(255,255,255,0.96)',
        color: '#111',
        borderRadius: 12,
        border: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 18px 45px rgba(15,15,20,0.18)',
        padding: 8,
        backdropFilter: 'blur(22px)',
      }}
      onPointerDown={(e) => {
        e.preventDefault()
        stopEventPropagation(e as any)
      }}
    >
      {options.length === 0 ? (
        <div
          style={{
            padding: '8px 10px',
            fontSize: `${fontSize - 2}px`,
            color: 'rgba(0,0,0,0.45)',
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
              padding: '6px 8px',
              borderRadius: 4,
              cursor: 'pointer',
              background: index === highlightedIndex ? 'rgba(0,0,0,0.05)' : 'transparent',
            }}
            onPointerEnter={() => onHighlight(index)}
            onPointerUp={(e) => {
              stopEventPropagation(e as any)
              onSelect(option)
            }}
          >
            <Avatar
              src={option.kind === 'channel' ? option.channel.author?.avatar : option.author.avatar}
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
                }}
              >
                {option.kind === 'channel' ? option.channel.title : option.author.name}
              </span>
              {option.kind === 'channel' && option.channel.author ? (
                <span
                  style={{
                    fontSize: `${Math.max(fontSize - 3, 9)}px`,
                    color: 'rgba(40,40,40,0.65)',
                  }}
                >
                  by {option.channel.author.name}
                </span>
              ) : null}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
