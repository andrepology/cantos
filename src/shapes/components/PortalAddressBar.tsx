import { useState, useMemo, useRef, useEffect, useCallback, memo, type CSSProperties, type RefObject } from 'react'
import { motion, AnimatePresence, useMotionValue, type MotionValue } from 'motion/react'
import { stopEventPropagation, useValue } from 'tldraw'
import { Avatar } from '../../arena/icons'
import {
  DESIGN_TOKENS,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_TERTIARY,
  SHAPE_SHADOW,
  LABEL_FONT_FAMILY,
} from '../../arena/constants'
import { isInteractiveTarget } from '../../arena/dom'
import { getCaretPositionFromClick } from './labelUtils'
import { usePressFeedback } from '../../hooks/usePressFeedback'

function getCaretPositionWithSpacing(
  text: string,
  clickX: number,
  fontSize: number,
  fontFamily: string,
  letterSpacingPx: number,
  fontWeight: number | string
): number {
  if (!text) return 0
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return text.length
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`
  let cumulativeWidth = 0
  for (let i = 0; i <= text.length; i++) {
    const charWidth = i < text.length ? ctx.measureText(text[i]).width : 0
    const spacedWidth = charWidth + (i < text.length ? letterSpacingPx : 0)
    const charCenter = cumulativeWidth + spacedWidth / 2
    if (clickX <= charCenter) {
      return i
    }
    cumulativeWidth += spacedWidth
    if (i === text.length - 1) {
      return text.length
    }
  }
  return text.length
}

function getCaretFromDOMWidth(labelEl: HTMLSpanElement, text: string, clickXScreen: number): number | null {
  const textNode = labelEl.firstChild
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return null
  const range = document.createRange()
  let prevWidth = 0
  range.setStart(textNode, 0)
  range.setEnd(textNode, 0)
  for (let i = 0; i <= text.length; i++) {
    range.setStart(textNode, 0)
    range.setEnd(textNode, i)
    const width = range.getBoundingClientRect().width
    const mid = (prevWidth + width) / 2 // bias slightly left to avoid off-by-one
    if (clickXScreen <= mid) {
      return i
    }
    prevWidth = width
  }
  return text.length
}

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

export type PortalSource =
  | { kind: 'channel'; slug: string; title?: string }
  | { kind: 'author'; id: number; name?: string; avatar?: string }

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
      slug: 'buddhism',
      title: 'Buddhism',
      author: { id: 11, name: 'Mara Ison', avatar: 'https://avatar.vercel.sh/mara-ison' },
    },
  },
  {
    kind: 'channel',
    channel: {
      slug: 'attempts-at-zen',
      title: 'Attempts At Zen',
      author: { id: 12, name: 'Kei Horizon', avatar: 'https://avatar.vercel.sh/kei-horizon' },
    },
  },
  {
    kind: 'channel',
    channel: {
      slug: 'layout-and-interface',
      title: 'Layout And Interface',
      author: { id: 13, name: 'Iris Grid', avatar: 'https://avatar.vercel.sh/iris-grid' },
    },
  },
  {
    kind: 'channel',
    channel: {
      slug: 'typecast',
      title: 'Typecast',
      author: { id: 14, name: 'Rafi Grotesk', avatar: 'https://avatar.vercel.sh/rafi-grotesk' },
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
}

export const PortalAddressBar = memo(function PortalAddressBar({
  layout,
  source,
  focusedBlock,
  isSelected,
  options,
  onSourceChange,
  editor,
  shapeId,
}: PortalAddressBarProps) {
  const [isEditing, setIsEditing] = useState(false)
  const zoomRaw = useValue('cameraZoom', () => (editor?.getCamera?.().z ?? 1), [editor]) || 1
  const zoomClamped = Math.min(1.4, Math.max(0.8, zoomRaw))
  const textScale = useMotionValue(1 / zoomClamped)
  useEffect(() => {
    textScale.set(1 / zoomClamped)
  }, [textScale, zoomClamped])
  const {
    query,
    setQuery,
    filteredOptions,
    highlightedIndex,
    setHighlightedIndex,
  } = usePortalSourceSearch(options)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const labelTextRef = useRef<HTMLSpanElement>(null)
  // Fixed dropdown gap for performance - no zoom dependency
  const dropdownGapPx = 4

  const blockTitle = focusedBlock?.title ?? ''
  const showBlockTitle = Boolean(focusedBlock)
  const showBackButton = showBlockTitle // When block title shows, back button is visible
  const author = source.kind === 'channel' ? source.channel.author : null
  const displayText = useMemo(() => {
    if (source.kind === 'channel') {
      return source.channel.title || source.channel.slug || 'Channel'
    }
    return source.author.name || 'Author'
  }, [source])
  const showAuthorChip = Boolean(author) && isSelected && !isEditing && !showBlockTitle

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

  const handleAuthorClick = useCallback(
    (e: React.PointerEvent) => {
      stopEventPropagation(e as any)

      if (!author) return

      // Add 150ms delay after mouse up before changing source
      setTimeout(() => {
        onSourceChange({
          kind: 'author',
          userId: author.id,
          name: author.name,
          avatar: author.avatar,
        })
      }, 300)
    },
    [author, onSourceChange]
  )

  const authorPressFeedback = usePressFeedback({
    scale: 0.96,
    hoverScale: 1.02,
    stiffness: 400,
    damping: 25,
    disabled: !showAuthorChip,
    onPointerUp: handleAuthorClick,
  })

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

    // Calculate caret position for text clicks
    const labelEl = labelTextRef.current
    const isTextClick = !interactive && labelEl && (e.target as HTMLElement | null)?.closest('[data-label-text]')
    let caret: number | undefined = undefined

    if (isTextClick) {
      const rect = labelEl.getBoundingClientRect()
      const clickXScreen = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
      caret =
        getCaretFromDOMWidth(labelEl, displayText, clickXScreen) ??
        (() => {
          const scale = (textScale as any)?.get?.() ?? 1
          const clickXUnscaled = clickXScreen / scale
          const letterSpacingPx = -0.0125 * layout.fontSize
          const fontWeight = 600
          return getCaretPositionWithSpacing(
            displayText,
            clickXUnscaled,
            layout.fontSize,
            LABEL_FONT_FAMILY,
            letterSpacingPx,
            fontWeight
          )
        })()
    }

    // If not selected, select shape first (but don't return early for text clicks)
    if (!isSelected) {
      editor.setSelectedShapes([shapeId])
      // For text clicks, continue to editing; for other interactive elements, stop here
      if (!isTextClick) return
    }

    if (interactive) return

    // Begin editing with calculated caret position
    if (isTextClick && caret !== undefined) {
      beginEditing(caret)
    }
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
      } else {
        const slug = query.trim()
        if (slug) {
          onSourceChange({ kind: 'channel', slug })
          setIsEditing(false)
        }
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
        zIndex: showBlockTitle ? 9999 : 8,
      }}
    >
      {/* Block Title - centered across full portal width */}
      {showBlockTitle ? (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            fontFamily: LABEL_FONT_FAMILY,
            fontSize: `${layout.fontSize}px`,
            fontWeight: 600,
            letterSpacing: '-0.0125em',
            color: TEXT_TERTIARY,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              maxWidth: '90%',
              transformOrigin: 'top center',
            }}
          >
            <motion.span
              style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                transformOrigin: 'top center',
                scale: textScale,
              }}
            >
              {blockTitle}
            </motion.span>
          </div>
        </div>
      ) : null}

      {/* Channel/Author Interactive Area - Hidden when block title shows */}
      <div
        style={{
          ...baseRowStyle,
          paddingLeft: layout.paddingLeft,
          paddingRight: 8,
          width: '100%',
          boxSizing: 'border-box',
          overflow: isEditing ? 'visible' : 'hidden',
          opacity: showBlockTitle ? 0 : 1,
          pointerEvents: showBlockTitle ? 'none' : 'auto',
          transition: 'opacity 150ms ease',
          clipPath: showBackButton ? 'inset(0 0 0 70px)' : undefined,
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
          <motion.div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 0,
              minWidth: 0,
              width: '100%',
              transformOrigin: 'top left',
              scale: textScale,
            }}
          >
            <span
              ref={labelTextRef}
              data-label-text
              style={{
                flex: '0 1 auto',
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                pointerEvents: 'auto',
                marginRight: 4,
                opacity: isEditing ? 0 : 1,
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
                    maxWidth: showAuthorChip ? '300px' : 0,
                    flex: '0 1 auto',
                    transition: showAuthorChip
                      ? 'opacity 200ms linear, max-width 120ms linear'
                      : 'opacity 200ms linear, max-width 120ms linear 200ms',
                    pointerEvents: showAuthorChip ? 'auto' : 'none',
                    color: TEXT_TERTIARY,
                    overflow: 'hidden',
                  }}
                >
                <span style={{ fontSize: `${layout.fontSize}px` }}>by</span>
                <motion.span
                  data-interactive="author-name"
                  {...authorPressFeedback.bind}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    scale: authorPressFeedback.pressScale,
                    willChange: 'transform',
                  }}
                >
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
                      cursor: showAuthorChip ? 'pointer' : 'default',
                    }}
                  >
                    {author.name}
                  </span>
                </motion.span>
              </span>
            ) : null}
          </motion.div>

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
            textScale={textScale}
          />
        </div>
      </div>
    </div>
  )
})

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
  textScale: MotionValue<number>
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
  textScale,
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
      <PortalSourceDropdown
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
}

interface PortalSourceDropdownProps {
  options: PortalSourceOption[]
  highlightedIndex: number
  onHighlight: (index: number) => void
  onSelect: (option: PortalSourceOption) => void
  fontSize: number
  iconSize: number
  dropdownGap: number
  textScale: MotionValue<number>
}

function PortalSourceDropdown({
  options,
  highlightedIndex,
  onHighlight,
  onSelect,
  fontSize,
  iconSize,
  dropdownGap,
  textScale,
}: PortalSourceDropdownProps) {
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
                    color: TEXT_PRIMARY,
                    fontFamily: LABEL_FONT_FAMILY,
                  }}
                >
                  {option.kind === 'channel' ? option.channel.title : option.author.name}
                </span>
                {option.kind === 'channel' && option.channel.author ? (
                  <span
                    style={{
                      fontSize: `${Math.max(fontSize - 3, 9)}px`,
                      color: TEXT_SECONDARY,
                      fontFamily: LABEL_FONT_FAMILY,
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
    </motion.div>
  )
}
