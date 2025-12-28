import { useState, useMemo, useRef, useEffect, useCallback, memo, type CSSProperties } from 'react'
import { AnimatePresence, motion, useTransform, type MotionValue } from 'motion/react'
import { stopEventPropagation, useEditor } from 'tldraw'
import type { TLShapeId } from 'tldraw'
import { Avatar } from '../../../arena/icons'
import { OverflowCarouselText } from '../../../arena/OverflowCarouselText'
import {
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_TERTIARY,
  SHAPE_SHADOW,
  LABEL_FONT_FAMILY,
  SHAPE_BORDER_RADIUS,
  GHOST_BACKGROUND,
} from '../../../arena/constants'
import { isInteractiveTarget } from '../../../arena/dom'
import {
  getCaretPositionWithSpacing,
  getCaretFromDOMWidth,
} from '../../../utils/textMeasurement'
import { usePortalSourceSearch } from '../../../arena/hooks/usePortalSourceSearch'
import {
  type PortalAuthor,
  type PortalSourceOption,
  type PortalSourceSelection,
} from '../../../arena/search/portalSearchTypes'
import { usePressFeedback } from '../../../hooks/usePressFeedback'
import { recordRender } from '../../../arena/renderCounts'
import { usePortalSpawnDrag } from '../../../arena/hooks/usePortalSpawnDrag'
import { PortalSpawnGhost } from '../../../arena/components/PortalSpawnGhost'
import { useScreenToPagePoint } from '../../../arena/hooks/useScreenToPage'
import { AddressBarSearch } from './AddressBarSearch'

const LABEL_FONT_SIZE = 14
const LABEL_ICON_SIZE = Math.max(12, Math.min(20, Math.round(LABEL_FONT_SIZE)))
const LETTER_SPACING_EM = -0.0125
const LABEL_PADDING_LEFT = 16
const LABEL_HEIGHT = Math.max(LABEL_FONT_SIZE + 6, 20)
const LABEL_TOP = 10
const LABEL_MIN_HEIGHT = Math.max(LABEL_HEIGHT, LABEL_FONT_SIZE + 8)
const LETTER_SPACING = `${LETTER_SPACING_EM}em`
const FONT_SIZE_PX = `${LABEL_FONT_SIZE}px`
const DROPDOWN_GAP = 4
const BACK_COLLAPSED_SIZE = 22

export interface AddressBarProps {
  sourceKind: PortalSourceOption['kind']
  displayText: string
  authorId?: number
  authorFullName?: string
  authorAvatarThumb?: string
  focusedBlock?: { id: number | string; title: string } | null
  isSelected: boolean
  isHovered: boolean
  options: PortalSourceOption[]
  onSourceChange: (next: PortalSourceSelection) => void
  onBack?: () => void
  shapeId: TLShapeId
  textScale: MotionValue<number>
}

export const AddressBar = memo(function AddressBar({
  sourceKind,
  displayText,
  authorId,
  authorFullName,
  authorAvatarThumb,
  focusedBlock,
  isSelected,
  isHovered,
  options,
  onSourceChange,
  onBack,
  shapeId,
  textScale,
}: AddressBarProps) {
  recordRender('AddressBar')
  recordRender(`AddressBar:${shapeId}`)

  const editor = useEditor()
  const [isEditing, setIsEditing] = useState(false)
  const [{ isTopHovered, isTopLeftHovered }, setHoverZone] = useState({
    isTopHovered: false,
    isTopLeftHovered: false,
  })
  const containerRef = useRef<HTMLDivElement | null>(null)

  const scaledRowWidth = useTransform(textScale, (scale) => `${100 / Math.max(0.01, scale)}%`)

  const {
    query,
    setQuery,
    filteredOptions,
    highlightedIndex,
    setHighlightedIndex,
  } = usePortalSourceSearch(options)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const labelTextRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const host = containerRef.current?.parentElement
    if (!isHovered || !host) {
      setHoverZone({ isTopHovered: false, isTopLeftHovered: false })
      return
    }

    const handlePointerMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      const nextTop = y <= rect.height / 3
      const nextTopLeft = nextTop && x <= rect.width / 3

      setHoverZone((prev) => {
        if (prev.isTopHovered === nextTop && prev.isTopLeftHovered === nextTopLeft) return prev
        return { isTopHovered: nextTop, isTopLeftHovered: nextTopLeft }
      })
    }

    host.addEventListener('pointermove', handlePointerMove, { passive: true })
    return () => host.removeEventListener('pointermove', handlePointerMove)
  }, [isHovered])

  const blockTitle = focusedBlock?.title ?? ''
  const showBlockTitle = Boolean(focusedBlock)
  const isLabelDarkened = isEditing || (isTopHovered && !showBlockTitle)
  const activeColor = isLabelDarkened ? TEXT_TERTIARY : TEXT_SECONDARY
  const showBlockTitleActive = showBlockTitle && isTopHovered
  const showBackButtonActive = showBlockTitle && isTopLeftHovered
  const showBackButton = showBlockTitle && (isHovered || isSelected)
  const hasAuthorChip = sourceKind === 'channel' && typeof authorId === 'number'
  const showAuthorChip = hasAuthorChip && isSelected && !isEditing && !showBlockTitle

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
      setIsEditing(false)
    },
    [onSourceChange]
  )

  const authorPressFeedback = usePressFeedback({
    scale: 0.96,
    hoverScale: 1.02,
    stiffness: 400,
    damping: 25,
    disabled: !showAuthorChip,
  })

  const backPressFeedback = usePressFeedback({
    scale: 0.95,
    hoverScale: 1.08,
    onPointerDown: (e) => {
      stopEventPropagation(e as any)
    },
    onPointerUp: (e) => {
      stopEventPropagation(e as any)
      onBack?.()
    },
  })
  const backButtonScale = useTransform(
    [backPressFeedback.pressScale, textScale],
    ([press, text]) => (press as number) * (text as number)
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

  const screenToPagePoint = useScreenToPagePoint()

  const getAuthorSpawnPayload = useCallback((author: PortalAuthor) => {
    return { 
      kind: 'author' as const, 
      userId: author.id, 
      userName: author.fullName || '', 
      userAvatar: author.avatarThumb 
    }
  }, [])

  const portalSpawnDimensions = useMemo(() => ({ w: 180, h: 180 }), [])

  const handleAuthorSelect = useCallback((_: any, author: PortalAuthor) => {
    if (!hasAuthorChip || typeof authorId !== 'number') return
    
    setTimeout(() => {
      onSourceChange({
        kind: 'author',
        userId: author.id,
        fullName: author.fullName,
        avatarThumb: author.avatarThumb,
      })
    }, 300)
  }, [hasAuthorChip, authorId, onSourceChange])

  const {
    ghostState: authorGhostState,
    handlePointerDown: handleAuthorPointerDown,
    handlePointerMove: handleAuthorPointerMove,
    handlePointerUp: handleAuthorPointerUp,
  } = usePortalSpawnDrag<PortalAuthor>({
    thresholdPx: 12,
    screenToPagePoint,
    getSpawnPayload: getAuthorSpawnPayload,
    defaultDimensions: portalSpawnDimensions,
    selectSpawnedShape: false,
    onClick: handleAuthorSelect,
  })

  const authorItem = useMemo<PortalAuthor | null>(() => {
    if (typeof authorId !== 'number') return null
    return {
      id: authorId,
      fullName: authorFullName,
      avatarThumb: authorAvatarThumb,
    }
  }, [authorId, authorFullName, authorAvatarThumb])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (showBlockTitle) return

      const interactive = isInteractiveTarget(e.target)
      if (!interactive && !(e.target as HTMLElement | null)?.closest('[data-label-text]')) {
        return
      }

      stopEventPropagation(e as any)

      const labelEl = labelTextRef.current
      const isTextClick =
        !interactive && labelEl && (e.target as HTMLElement | null)?.closest('[data-label-text]')
      let caret: number | undefined = undefined

      if (isTextClick) {
        const rect = labelEl.getBoundingClientRect()
        const clickXScreen = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
        caret =
          getCaretFromDOMWidth(labelEl, displayText, clickXScreen) ??
          (() => {
            const scale = (textScale as any)?.get?.() ?? 1
            const clickXUnscaled = clickXScreen / scale
            const letterSpacingPx = LETTER_SPACING_EM * LABEL_FONT_SIZE
            const fontWeight = 600
            return getCaretPositionWithSpacing(
              displayText,
              clickXUnscaled,
              LABEL_FONT_SIZE,
              LABEL_FONT_FAMILY,
              letterSpacingPx,
              fontWeight
            )
          })()
      }

      if (!isSelected) {
        editor.setSelectedShapes([shapeId])
        if (!isTextClick) return
      }

      if (interactive) return

      if (isTextClick && caret !== undefined) {
        beginEditing(caret)
      }
    },
    [beginEditing, displayText, editor, isSelected, shapeId, showBlockTitle, textScale]
  )

  const baseRowStyle: CSSProperties = useMemo(
    () => ({
      fontFamily: LABEL_FONT_FAMILY,
      fontSize: FONT_SIZE_PX,
      fontWeight: 600,
      letterSpacing: LETTER_SPACING,
      color: activeColor,
      padding: 6,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-start',
      minWidth: 0,
      height: '100%',
      pointerEvents: 'auto',
      userSelect: isSelected ? 'text' : 'none',
      gap: 6,
      width: '100%',
      boxSizing: 'border-box',
      transition: 'color 150ms ease',
    }),
    [isSelected, activeColor]
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
            setIsEditing(false)
          }
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setIsEditing(false)
      }
    },
    [filteredOptions, highlightedIndex, onSourceChange, query, selectOption, setHighlightedIndex]
  )

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value)
      setHighlightedIndex(0)
    },
    [setQuery, setHighlightedIndex]
  )

  return (
    <div ref={containerRef}>
      <div
        style={{
          position: 'absolute',
          top: LABEL_TOP,
          left: 0,
          width: '100%',
          height: LABEL_MIN_HEIGHT,
          pointerEvents: 'auto',
          zIndex: showBlockTitle ? 9999 : 8,
        }}
      >
      <AnimatePresence>
        {showBackButton && (
          <motion.div
            key="portal-back-button"
            {...backPressFeedback.bind}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { duration: 0.15, ease: 'easeInOut' } }}
            style={{
              position: 'absolute',
              top:1,
              left: 10,
              width: 70, 
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              pointerEvents: 'auto',
              zIndex: 10,
              transformOrigin: 'top left',
              scale: backButtonScale,
            }}
          >
            <motion.div
              layout={false}
              initial={{ gap: 0 }}
              animate={{
                width: showBackButtonActive ? 44 : BACK_COLLAPSED_SIZE,
                height: BACK_COLLAPSED_SIZE,
                borderRadius: showBackButtonActive ? 20 : BACK_COLLAPSED_SIZE / 2,
                paddingLeft: showBackButtonActive ? 10 : 0,
                paddingRight: showBackButtonActive ? 10 : 0,
                gap: showBackButtonActive ? 6 : 0,
              }}
              style={{
                background: 'rgba(0,0,0,0.03)',
                color: '#bbb',
                fontSize: 10,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                transformOrigin: 'top left',
              }}
              transition={{ type: 'spring', stiffness: 520, damping: 36, mass: 0.6 }}
            >
              <motion.span
                initial={{ maxWidth: 0 }}
                animate={{
                  opacity: showBackButtonActive ? 1 : 0,
                  maxWidth: showBackButtonActive ? 40 : 0,
                }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
                style={{
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                }}
              >
                back
              </motion.span>
              <motion.span
                animate={{
                  opacity: showBackButtonActive ? 0 : 1,
                  width: showBackButtonActive ? 0 : 6,
                  height: showBackButtonActive ? 0 : 6,
                }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
                style={{
                  background: TEXT_SECONDARY,
                  borderRadius: 9999,
                  display: 'inline-block',
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
            pointerEvents: showBlockTitleActive ? 'auto' : 'none',
            fontFamily: LABEL_FONT_FAMILY,
            fontSize: FONT_SIZE_PX,
            fontWeight: 600,
            letterSpacing: LETTER_SPACING,
            color: TEXT_SECONDARY,
            opacity: showBlockTitleActive ? 1 : 0,
            transition: 'opacity 150ms ease',
          }}
        >
          <motion.div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              maxWidth: '50%',
              transformOrigin: 'top center',
              scale: textScale,
            }}
          >
            <OverflowCarouselText
              text={blockTitle}
              maxWidthPx={Math.max(100, Math.floor(window.innerWidth * 0.5 * 0.9))}
              gapPx={24}
              speedPxPerSec={40}
              fadePx={20}
              textStyle={{
                whiteSpace: 'nowrap',
                transformOrigin: 'top center',
              }}
            />
          </motion.div>
        </div>
      ) : null}

      <div
        style={{
          ...baseRowStyle,
          paddingLeft: LABEL_PADDING_LEFT,
          paddingRight: 8,
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
              width: scaledRowWidth,
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
              {displayText || 'search are.na channels'}
            </span>
            {hasAuthorChip ? (
                <span
                  data-interactive="author-chip"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    minWidth: 0,
                    opacity: showAuthorChip ? 1 : 0,
                    maxWidth: showAuthorChip ? '100%' : 0,
                    flex: '0 1 auto',
                    paddingRight: 10,
                    transition: showAuthorChip
                      ? 'opacity 200ms linear, max-width 120ms linear, color 150ms ease'
                      : 'opacity 200ms linear, max-width 120ms linear 200ms, color 150ms ease',
                    pointerEvents: showAuthorChip ? 'auto' : 'none',
                    color: activeColor,
                    overflow: 'hidden',
                  }}
                >
                <span style={{ fontSize: FONT_SIZE_PX }}>by</span>
                <motion.span
                  data-interactive="author-name"
                  {...authorPressFeedback.bind}
                  onPointerDown={(e) => {
                    authorPressFeedback.bind.onPointerDown(e)
                    if (authorItem) handleAuthorPointerDown(authorItem, e)
                  }}
                  onPointerMove={(e) => {
                    if (authorItem) handleAuthorPointerMove(authorItem, e)
                  }}
                  onPointerUp={(e) => {
                    authorPressFeedback.bind.onPointerUp(e)
                    if (authorItem) handleAuthorPointerUp(authorItem, e)
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    minWidth: 0,
                    flex: '1 1 auto',
                    scale: authorPressFeedback.pressScale,
                    willChange: 'transform',
                  }}
                >
                  <span
                    style={{
                      width: LABEL_ICON_SIZE,
                      height: LABEL_ICON_SIZE,
                      flex: '0 0 auto',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Avatar src={authorAvatarThumb} size={LABEL_ICON_SIZE} />
                  </span>
                  <span
                    style={{
                    display: 'block',
                    fontSize: FONT_SIZE_PX,
                    color: activeColor,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    minWidth: 0,
                    flex: '1 1 auto',
                    cursor: showAuthorChip ? 'pointer' : 'default',
                    transition: 'color 150ms ease',
                  }}
                  >
                    {authorFullName ?? ''}
                  </span>
                </motion.span>
              </span>
            ) : null}
          </motion.div>

          <AddressBarSearch
            open={isEditing}
            query={query}
            onQueryChange={handleQueryChange}
            onClose={() => setIsEditing(false)}
            onSelect={selectOption}
            options={filteredOptions}
            highlightedIndex={highlightedIndex}
            onHighlight={setHighlightedIndex}
            fontSize={LABEL_FONT_SIZE}
            iconSize={LABEL_ICON_SIZE}
            inputRef={inputRef}
            onKeyDown={handleKeyDown}
            dropdownGap={DROPDOWN_GAP}
            textScale={textScale}
          />
        </div>
      </div>
      <PortalSpawnGhost
        ghost={authorGhostState}
        padding={4}
        borderWidth={1}
        borderRadius={SHAPE_BORDER_RADIUS}
        boxShadow={SHAPE_SHADOW}
        background={GHOST_BACKGROUND}
        renderContent={(auth) => {
          const author = auth as PortalAuthor
          return (
            <div
              style={{
                padding: `4px 8px`,
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                height: '100%',
                gap: 8,
              }}
            >
              <Avatar src={author.avatarThumb} size={LABEL_ICON_SIZE} />
              <div
                style={{
                  fontSize: LABEL_FONT_SIZE,
                  fontWeight: 700,
                  color: TEXT_PRIMARY,
                  fontFamily: LABEL_FONT_FAMILY,
                }}
              >
                {author.fullName}
              </div>
            </div>
          )
        }}
      />
      </div>
    </div>
  )
})

