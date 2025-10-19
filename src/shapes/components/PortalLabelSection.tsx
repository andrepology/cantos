import { useState, useRef, type RefObject } from 'react'
import { stopEventPropagation } from 'tldraw'
import { SearchLabel } from './SearchLabel'
import { TEXT_SECONDARY } from '../../arena/constants'
import type { SearchResult } from '../../arena/types'
import { Avatar } from '../../arena/icons'

// Unified label display component for user/channel labels in PortalShape
export function PortalLabel({
  // Raw data
  userId,
  userName,
  userAvatar,
  channel,
  title,
  author,

  // UI state
  isSelected,

  // Zoom and sizing
  zoom,
  zoomAwareFontPx,
  labelIconPx,

  // Interaction handlers
  handleUserSelect,

  // Styling
  TEXT_TERTIARY,

  // Event handling
  stopEventPropagation,
}: {
  userId?: number
  userName?: string
  userAvatar?: string
  channel?: string
  title?: string
  author?: any
  isSelected: boolean
  zoom: number
  zoomAwareFontPx: number
  labelIconPx: number
  handleUserSelect: (userId: number, userName: string, userAvatar?: string) => void
  TEXT_TERTIARY: string
  stopEventPropagation: (e: any) => void
}) {
  // Calculate derived values
  const authorName = author?.full_name || author?.username || ''
  const authorAvatar = (author as any)?.avatar || ''
  const labelPrimary = userId ? userName || '' : title || channel || ''
  const profileIconPx = labelIconPx
  return (
    <>
      {userId ? (
        <span
          data-tactile
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            paddingLeft: 2,
            gap: 4,
            minWidth: 0,
            overflow: 'hidden',
            flex: '0 1 auto',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 0}}>
            <Avatar src={userAvatar} size={profileIconPx} />
          </span>
          <span style={{
            textOverflow: 'ellipsis',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }} data-label-text>
            {labelPrimary || 'Profile'}
          </span>
        </span>
      ) : (
        <span
          data-tactile
          style={{
            textOverflow: 'ellipsis',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            minWidth: 0,
            paddingLeft: 2,
            flex: '0 1 auto',
          }}
          data-label-text
        >
          {labelPrimary || 'search arena'}
        </span>
      )}
      {isSelected && authorName ? (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            minWidth: 0,
            overflow: 'hidden',
            flex: '0 1 auto',
          }}
        >
          <span style={{
            fontSize: `${zoomAwareFontPx}px`,
            color: TEXT_TERTIARY,
            flexShrink: 0,
            marginRight: 1.5
          }}>by </span>
          <span
            data-interactive="button"
            data-tactile
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              minWidth: 0,
              overflow: 'hidden',
              cursor: 'pointer',
              pointerEvents: 'auto'
            }}
            data-author-row={true}
            data-user-id={author?.id ? String(author.id) : undefined}
            data-user-username={author?.username || undefined}
            data-user-fullname={author?.full_name || undefined}
            data-user-avatar={author?.avatar || undefined}
            onPointerUp={(e) => {
              stopEventPropagation(e)
              // Don't select user if meta key is pressed (used for tiling spawn)
              if (!e.metaKey && author?.id) {
                handleUserSelect(author.id, author.username || author.full_name || '', author?.avatar || undefined)
              }
            }}
          >
            <div style={{ transform: 'translateY(-1px)', flexShrink: 0 }}>
              <Avatar src={authorAvatar} size={labelIconPx} />
            </div>
            <span style={{
              fontSize: `${zoomAwareFontPx}px`,
              color: TEXT_TERTIARY,
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}>{authorName}</span>
          </span>
        </div>
      ) : null}
    </>
  )
}

export interface ThreeDBoxLabelSectionProps {
  // Visibility
  visible: boolean
  
  // Positioning & dimensions
  labelHeight: number
  labelOffset: number
  w: number
  z: number
  
  // Content
  channel?: string
  userId?: number
  userName?: string
  userAvatar?: string
  title?: string
  author?: any
  
  // State
  isSelected: boolean
  isEditingLabel: boolean
  setIsEditingLabel: (editing: boolean) => void
  
  // Handlers
  onSearchSelection: (result: SearchResult | null) => void
  handleUserSelect: (userId: number, userName: string, userAvatar?: string) => void
  
  // Dimensions
  zoomAwareFontPx: number
  labelIconPx: number
  
  // Editor context
  editor: any
  shapeId: string
  
  // Refs
  inputRef: RefObject<HTMLInputElement | null>
}

export function PortalLabelSection({
  visible,
  labelHeight,
  labelOffset,
  w,
  z,
  channel,
  userId,
  userName,
  userAvatar,
  title,
  author,
  isSelected,
  isEditingLabel,
  setIsEditingLabel,
  onSearchSelection,
  handleUserSelect,
  zoomAwareFontPx,
  labelIconPx,
  editor,
  shapeId,
  inputRef,
}: ThreeDBoxLabelSectionProps) {
  if (!visible) return null

  const isInteractiveTarget = (target: EventTarget | null): boolean => {
    if (!target || !(target instanceof Element)) return false
    const el = target as HTMLElement
    const interactive = el.closest('[data-interactive]')
    return !!interactive
  }

  const getCaretPositionFromClick = (text: string, clickX: number, fontSize: number, fontFamily: string): number => {
    if (!text) return 0

    // Create a canvas to measure text
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return text.length

    ctx.font = `${fontSize}px ${fontFamily}`

    let position = 0
    let cumulativeWidth = 0

    for (let i = 0; i <= text.length; i++) {
      const charWidth = i < text.length ? ctx.measureText(text[i]).width : 0
      const charCenter = cumulativeWidth + charWidth / 2

      if (clickX <= charCenter) {
        position = i
        break
      }

      cumulativeWidth += charWidth
      if (i === text.length - 1) {
        position = text.length
      }
    }

    return position
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: -(labelHeight + labelOffset),
        left: -2,
        width: w, // Extra width for label text
        height: labelHeight,
        pointerEvents: 'none',
        zIndex: 8,
      }}
    >
      <div
        style={{
          fontFamily: "'Alte Haas Grotesk', system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif",
          fontSize: `${zoomAwareFontPx}px`,
          lineHeight: 1.0,
          left: 8,
          position: 'relative',
          fontWeight: 600,
          letterSpacing: '-0.0125em',
          color: TEXT_SECONDARY,
          padding: 6,
          textAlign: 'left',
          verticalAlign: 'top',
          maxWidth: `calc(100% - ${Math.max(8, 12 / Math.min(z, 1.5))}px)`,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          userSelect: isSelected ? 'auto' : 'none',
          pointerEvents: 'auto',
          outline: 'none',
          border: 'none',
          minWidth: 0,
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
        onPointerDown={(e) => {
          // Only handle interaction if clicking on actual content, not whitespace
          const isOnLabelText = !!(e.target as HTMLElement | null)?.closest('[data-label-text]')
          const isOnInteractive = isInteractiveTarget(e.target)

          if (!isOnLabelText && !isOnInteractive) {
            // Let whitespace clicks pass through to canvas
            return
          }

          stopEventPropagation(e)

          if (!isSelected) {
            editor.setSelectedShapes([shapeId])
            return
          }

          // Don't enter editing mode if clicking on other interactive elements
          if (isOnInteractive) {
            return
          }

          // Only enter editing if clicking on the primary text span
          const labelEl = (e.target as HTMLElement | null)?.closest('[data-label-text]') as HTMLElement | null
          if (!labelEl) {
            return
          }

          // Don't enter editing mode if clicking on other interactive elements
          if (isInteractiveTarget(e.target)) {
            return
          }

          // Calculate caret position relative to the primary text span
          const rect = labelEl.getBoundingClientRect()
          const clickX = e.clientX - rect.left
          const primaryText = (userId ? (userName || 'Profile') : (title || channel || ''))
          const fontFamily = "'Alte Haas Grotesk', system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif"
          const caretPosition = getCaretPositionFromClick(primaryText, clickX, zoomAwareFontPx, fontFamily)

          // Enter editing mode on single click when selected
          // Gate: only enable editing for channel/title labels by default
          if (!primaryText || (!!userId && !(channel || title))) {
            return
          }
          setIsEditingLabel(true)
          setTimeout(() => {
            const input = inputRef.current
            if (input) {
              input.focus()
              input.setSelectionRange(caretPosition, caretPosition)
            }
          }, 0)
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            minWidth: 0,
            flex: 1,
          }}
          onPointerDown={(e) => {
            if (isInteractiveTarget(e.target)) {
              stopEventPropagation(e)
            }
          }}
          onPointerMove={(e) => {
            if (e.buttons > 0 && isInteractiveTarget(e.target)) {
              stopEventPropagation(e)
            }
          }}
          onPointerUp={(e) => {
            if (isInteractiveTarget(e.target)) {
              stopEventPropagation(e)
            }
          }}
        >
          {/* Unified label: display + edit overlay + author chip */}
          <SearchLabel
            initialValue={(userId ? (userName || 'Profile') : (title || channel || ''))}
            displayText={(userId ? (userName || 'Profile') : ((title && title.trim()) ? title : (channel || '')))}
            editing={isEditingLabel}
            onSelect={onSearchSelection}
            onCancel={() => setIsEditingLabel(false)}
            isSelected={isSelected}
            editor={editor}
            shapeId={shapeId}
            placeholder={(channel || userId) ? 'search' : 'search arena'}
            containerWidth={w}
            inputRef={inputRef}
            author={author}
            labelIconPx={labelIconPx}
            zoomAwareFontPx={zoomAwareFontPx}
            authorColor={TEXT_SECONDARY}
            onAuthorSelect={handleUserSelect}
            inputStyle={{
              fontFamily: 'inherit',
              fontSize: `${zoomAwareFontPx}px`,
              fontWeight: 600,
              letterSpacing: '-0.0125em',
              color: TEXT_SECONDARY,
              border: 'none',
              borderRadius: 0,
              marginRight: 0,
              background: 'transparent',
              width: '100%',
              outline: 'none',
              boxSizing: 'border-box',
              lineHeight: 1.0,
            }}
          />
        </div>
      </div>
    </div>
  )
}


