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
} from '../../../arena/constants'
import { isInteractiveTarget } from '../../../arena/dom'
import {
  getCaretPositionWithSpacing,
  getCaretFromDOMWidth,
} from '../../../utils/textMeasurement'
import {
  type PortalAuthor,
  type PortalSourceOption,
  type PortalSourceSelection,
} from '../../../arena/search/portalSearchTypes'

import { usePressFeedback } from '../../../hooks/usePressFeedback'
import { recordRender } from '../../../arena/renderCounts'
import { usePortalSpawnDrag } from '../../../arena/hooks/usePortalSpawnDrag'

import { useScreenToPagePoint } from '../../../arena/hooks/useScreenToPage'
import { AddressBarSearch } from './AddressBarSearch'
import { type LayoutMode } from '../../../arena/layoutConfig'

const LABEL_FONT_SIZE = 14
const LABEL_ICON_SIZE = Math.max(12, Math.min(20, Math.round(LABEL_FONT_SIZE)))
const LETTER_SPACING_EM = -0.0125
const LABEL_PADDING_LEFT = 16
const LABEL_HEIGHT = Math.max(LABEL_FONT_SIZE + 6, 20)
const LABEL_TOP = 10
const LABEL_BOTTOM = 10
const LABEL_MIN_HEIGHT = Math.max(LABEL_HEIGHT, LABEL_FONT_SIZE + 8)
const LETTER_SPACING = `${LETTER_SPACING_EM}em`
const FONT_SIZE_PX = `${LABEL_FONT_SIZE}px`
const DROPDOWN_GAP = 4
const BACK_COLLAPSED_SIZE = 22

export interface AddressBarProps {
  sourceKind: PortalSourceOption['kind']
  sourceSlug?: string
  sourceUserId?: number
  displayText: string
  authorId?: number
  authorFullName?: string
  authorAvatarThumb?: string
  focusedBlock?: { id: number | string; title: string } | null
  isSelected: boolean
  isHovered: boolean
  onSourceChange: (next: PortalSourceSelection) => void
  onBack?: () => void
  shapeId: TLShapeId
  textScale: MotionValue<number>
  layoutMode: LayoutMode
}

// Stable empty array for search (avoids new reference each render)
const EMPTY_OPTIONS: PortalSourceOption[] = []

export const AddressBar = memo(function AddressBar({
  sourceKind,
  sourceSlug,
  sourceUserId,
  displayText,
  authorId,
  authorFullName,
  authorAvatarThumb,
  focusedBlock,
  isSelected,
  isHovered,
  onSourceChange,
  onBack,
  shapeId,
  textScale,
  layoutMode,
}: AddressBarProps) {
  recordRender('AddressBar')
  recordRender(`AddressBar:${shapeId}`)

  const editor = useEditor()
  const [isEditing, setIsEditing] = useState(false)
  const [initialCaret, setInitialCaret] = useState<number | undefined>(undefined)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [{ isTopHovered, isTopLeftHovered }, setHoverZone] = useState({
    isTopHovered: false,
    isTopLeftHovered: false,
  })
  const containerRef = useRef<HTMLDivElement | null>(null)

  const scaledRowWidth = useTransform(textScale, (scale) => `${100 / Math.max(0.01, scale)}%`)

  const labelTextRef = useRef<HTMLSpanElement>(null)

  // Layout derivations
  const isVertical = layoutMode === 'vtab'
  const isMini = layoutMode === 'mini'
  const canEditLabel =
    layoutMode === 'row' || layoutMode === 'column' || layoutMode === 'stack' || layoutMode === 'grid'
  // row, column, stack, grid -> Standard Top Left

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

      // Adjust hit testing zones based on layout
      let nextTop = false
      let nextTopLeft = false

      if (isVertical) {
        // Spine mode: hit zone is left/bottom area roughly
        // Simplified: just check if we are near the label
        // For now, let's keep it simple or adapt if needed.
        // The original logic assumes top bar.
        // We might want to disable "back" or special hovers in spine mode if it's too complex
        // But user said "interactive in all modes".
        // Let's assume standard hit logic for now, or maybe relax it.
        nextTop = true // Let hover always be active for the label interaction
      } else if (isMini) {
         // Bottom area
         nextTop = y >= rect.height - 40
      } else {
        // Standard Top
        nextTop = y <= rect.height / 3
        nextTopLeft = nextTop && x <= rect.width / 3
      }

      setHoverZone((prev) => {
        if (prev.isTopHovered === nextTop && prev.isTopLeftHovered === nextTopLeft) return prev
        return { isTopHovered: nextTop, isTopLeftHovered: nextTopLeft }
      })
    }

    host.addEventListener('pointermove', handlePointerMove, { passive: true })
    return () => host.removeEventListener('pointermove', handlePointerMove)
  }, [isHovered, isVertical, isMini])

  useEffect(() => {
    const host = containerRef.current?.parentElement
    if (!host || typeof ResizeObserver === 'undefined') return

    const updateSize = (rect: DOMRectReadOnly) => {
      setContainerSize({ width: rect.width, height: rect.height })
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) updateSize(entry.contentRect)
    })

    observer.observe(host)
    updateSize(host.getBoundingClientRect())

    return () => observer.disconnect()
  }, [])

  const blockTitle = focusedBlock?.title ?? ''
  const showBlockTitle = Boolean(focusedBlock)
  const isLabelDarkened = isEditing || (isTopHovered && !showBlockTitle)
  const activeColor = isLabelDarkened ? TEXT_TERTIARY : TEXT_SECONDARY
  const showBlockTitleActive = showBlockTitle && isTopHovered
  const showBackButtonActive = showBlockTitle && isTopLeftHovered
  const showBackButton = showBlockTitle && (isHovered || isSelected)
  const hasAuthorChip = sourceKind === 'channel' && typeof authorId === 'number'
  const showAuthorChip =
    hasAuthorChip &&
    isSelected &&
    !isEditing &&
    !showBlockTitle &&
    layoutMode !== 'tab' &&
    layoutMode !== 'vtab' &&
    layoutMode !== 'mini'

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

  const beginEditing = useCallback(
    (caret?: number) => {
      if (!isSelected) {
        editor.setSelectedShapes([shapeId])
      }
      setInitialCaret(caret ?? displayText.length)
      setIsEditing(true)
    },
    [isSelected, editor, shapeId, displayText]
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

  const getSearchSpawnPayload = useCallback((option: PortalSourceOption) => {
    if (option.kind === 'channel') {
      return { kind: 'channel' as const, slug: option.channel.slug, title: option.channel.title }
    } else {
      return { 
        kind: 'author' as const, 
        userId: option.author.id, 
        userName: option.author.fullName || '', 
        userAvatar: option.author.avatarThumb 
      }
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

  const handleSearchSelect = useCallback((payload: any) => {
    onSourceChange(payload.kind === 'channel' 
      ? { kind: 'channel', slug: payload.slug } 
      : { kind: 'author', userId: payload.userId, fullName: payload.userName, avatarThumb: payload.userAvatar }
    )
    setIsEditing(false)
  }, [onSourceChange])

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

  const {
    ghostState: searchGhostState,
    handlePointerDown: handleSearchPointerDown,
    handlePointerMove: handleSearchPointerMove,
    handlePointerUp: handleSearchPointerUp,
  } = usePortalSpawnDrag<PortalSourceOption>({
    thresholdPx: 12,
    screenToPagePoint,
    getSpawnPayload: getSearchSpawnPayload,
    defaultDimensions: portalSpawnDimensions,
    selectSpawnedShape: false,
    onClick: handleSearchSelect,
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
      if (!canEditLabel) return
      if (showBlockTitle) return
      const targetEl = e.target instanceof Element ? e.target : (e.target as Node | null)?.parentElement
      const labelEl = labelTextRef.current
      const labelRect = labelEl?.getBoundingClientRect()
      const isLabelHit =
        !!labelRect &&
        e.clientX >= labelRect.left &&
        e.clientX <= labelRect.right &&
        e.clientY >= labelRect.top &&
        e.clientY <= labelRect.bottom

      const interactive = isInteractiveTarget(e.target)
      if (!interactive && !isLabelHit) {
        return
      }

      stopEventPropagation(e as any)

      const isTextClick = !interactive && labelEl && isLabelHit
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
    [beginEditing, canEditLabel, displayText, editor, isSelected, shapeId, showBlockTitle, textScale]
  )

  const layoutKey = useMemo(() => {
    if (layoutMode === 'vtab') return 'spine'
    if (layoutMode === 'mini') return 'mini'
    if (layoutMode === 'tab') return 'centered'
    return 'standard'
  }, [layoutMode])

  const baseLabelStyle: CSSProperties = {
    fontFamily: LABEL_FONT_FAMILY,
    fontSize: FONT_SIZE_PX,
    fontWeight: 600,
    letterSpacing: LETTER_SPACING,
    color: activeColor,
    padding: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
    height: '100%',
    pointerEvents: 'auto',
    userSelect: isSelected ? 'text' : 'none',
    gap: 6,
    boxSizing: 'border-box',
    transition: 'color 150ms ease',
  }

  const centeredMaxWidth =
    containerSize.width > 0 ? `${Math.max(0, containerSize.width - 32)}px` : '90%'
  const vtabMaxWidth =
    containerSize.height > 0 ? `${Math.max(0, containerSize.height - 56)}px` : centeredMaxWidth

  const compactLabelStyle: CSSProperties = {
    ...baseLabelStyle,
    width: 'auto',
    height: 'auto',
    padding: 0,
  }

  const renderLabelContent = ({
    multiline = false,
    alignment = 'left',
    useScaledWidth = false,
    maxWidth = '100%',
    useMaxWidthAsWidth = false,
    forceLabelWidth = false,
    inputPaddingLeft = 0,
    inputTextAlign = 'left',
    containerWidth = '100%',
    enableWordBreak = false,
    useLineClamp = multiline,
  }: {
    multiline?: boolean
    alignment?: 'left' | 'center'
    useScaledWidth?: boolean
    maxWidth?: string
    useMaxWidthAsWidth?: boolean
    forceLabelWidth?: boolean
    inputPaddingLeft?: number
    inputTextAlign?: 'left' | 'center'
    containerWidth?: '100%' | 'auto'
    enableWordBreak?: boolean
    useLineClamp?: boolean
  } = {}) => (
      <div
        style={{
          position: 'relative',
          flex: containerWidth === '100%' ? '1 1 auto' : '0 0 auto',
          minWidth: 0,
          width: containerWidth,
        }}
      >
        <div
          style={{
            width: containerWidth === '100%' ? '100%' : 'auto',
            display: 'flex',
            justifyContent: 'flex-start',
          }}
        >
          <motion.div
            style={{
              display: 'inline-flex',
              alignItems: multiline ? 'flex-end' : 'baseline',
              gap: 0,
              minWidth: 0,
              maxWidth,
              width: useScaledWidth ? scaledRowWidth : useMaxWidthAsWidth ? maxWidth : 'auto',
              transformOrigin: alignment === 'center' ? 'center center' : 'left center',
              scale: textScale,
              flexWrap: multiline ? 'wrap' : 'nowrap',
              position: 'relative',
            }}
          >
            <span
              ref={labelTextRef}
              data-label-text={!isEditing || undefined}
              style={{
                flex: forceLabelWidth ? '1 1 auto' : '0 1 auto',
                width: forceLabelWidth ? '100%' : undefined,
                minWidth: 0,
                whiteSpace: multiline ? 'normal' : 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                pointerEvents: isEditing ? 'none' : 'auto',
                marginRight: 4,
                opacity: isEditing ? 0 : 1,
                lineHeight: multiline ? 1.2 : undefined,
                display: multiline && useLineClamp ? '-webkit-box' : 'block',
                WebkitLineClamp: multiline && useLineClamp ? 3 : undefined,
                WebkitBoxOrient: multiline && useLineClamp ? 'vertical' : undefined,
                textAlign: alignment,
                wordBreak: enableWordBreak ? 'break-word' : undefined,
                overflowWrap: enableWordBreak ? 'anywhere' : undefined,
                
              }}
            >
              {displayText || 'search are.na channels'}
            </span>
            
            {hasAuthorChip && !multiline ? (
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

            {isEditing && (
              <AddressBarSearch
                options={EMPTY_OPTIONS}
                displayText={displayText}
                initialCaret={initialCaret}
                onSourceChange={onSourceChange}
                onPointerDown={handleSearchPointerDown}
                onPointerMove={handleSearchPointerMove}
                onPointerUp={handleSearchPointerUp}
                onClose={() => setIsEditing(false)}
                fontSize={LABEL_FONT_SIZE}
                iconSize={LABEL_ICON_SIZE}
                dropdownGap={DROPDOWN_GAP}
                textScale={textScale}
                paddingLeft={inputPaddingLeft}
                textAlign={inputTextAlign}
                applyTextScale={false}
              />
            )}
          </motion.div>
        </div>
      </div>
  )

  // Render the specific layout wrapper based on variant
  // using absolute positioning relative to the shape container
  
  const renderLayoutShell = () => {
    switch (layoutKey) {
      case 'spine':
        return (
          <motion.div
            key="spine"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              justifyContent: 'center',
              pointerEvents: 'auto',
              zIndex: 8,
            }}
          >
            <motion.div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                rotate: -90,
              }}
            >
              <div style={{ ...compactLabelStyle, minWidth: 25 }}>
                {renderLabelContent({
                  alignment: 'center',
                  maxWidth: vtabMaxWidth, 
                  inputTextAlign: 'center',
                  containerWidth: 'auto',
                })}
              </div>
            </motion.div>
          </motion.div>
        )
      case 'centered':
        return (
          <motion.div
            key="centered"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              pointerEvents: 'auto',
              zIndex: 8,
              paddingLeft: 8,
              paddingRight: 8,
            }}
          >
            <div
              style={{
                ...compactLabelStyle,
                justifyContent: 'center',
                textAlign: 'center',
                paddingLeft: 6,
                paddingRight: 6,
                overflow: 'hidden',
              }}
            >
              {renderLabelContent({
                alignment: 'center',
                maxWidth: centeredMaxWidth,
                useMaxWidthAsWidth: true,
                forceLabelWidth: true,
                inputTextAlign: 'center',
                containerWidth: '100%',
              })}
            </div>
          </motion.div>
        )
      case 'mini':
        return (
          <motion.div
             key="mini"
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             exit={{ opacity: 0 }}
             transition={{ duration: 0.15 }}
             style={{
               position: 'absolute',
               inset: 0,
               display: 'grid',
               pointerEvents: 'auto',
               zIndex: 8,
               paddingBottom: 8,
               paddingLeft: LABEL_PADDING_LEFT,
               paddingRight: 8,
             }}
          >
            <div style={{
              ...baseLabelStyle,
              height: 'auto',
              alignItems: 'flex-end',
              paddingLeft: 0,
              paddingRight: 6,
            }}>
              {renderLabelContent({
                multiline: true,
                alignment: 'left',
                maxWidth: '100%',
                useMaxWidthAsWidth: true,
                forceLabelWidth: true,
                useScaledWidth: true,
                inputPaddingLeft: 0,
                containerWidth: '100%',
                enableWordBreak: false,
                useLineClamp: true,
              })}
            </div>
          </motion.div>
        )
      default: // standard
        return (
          <motion.div
            key="standard"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
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
            {/* Back Button Wrapper */}
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
                     {/* Back button content ... */}
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

             {/* Block Title Overlay */}
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
                ...baseLabelStyle,
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
               {renderLabelContent({ useScaledWidth: true })}
            </div>
          </motion.div>
        )
    }
  }

  return (
    <div 
      ref={containerRef}
      data-card-type={sourceKind === 'channel' ? "channel" : undefined}
      data-channel-slug={sourceSlug}
      data-card-title={displayText}
      data-author-row={sourceKind === 'author' ? "" : undefined}
      data-user-id={sourceUserId}
      data-user-fullname={displayText}
    >
      <AnimatePresence mode="wait" initial={false}>
         {renderLayoutShell()}
      </AnimatePresence>
    </div>
  )
})
