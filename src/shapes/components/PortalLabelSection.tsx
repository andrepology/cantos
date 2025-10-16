import { useState, useRef, type RefObject } from 'react'
import { stopEventPropagation } from 'tldraw'
import { SearchInterface, type SearchInterfaceProps } from './SearchInterface'
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
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 / zoom, minWidth: 0, overflow: 'hidden' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 0 }}>
            <Avatar src={userAvatar} size={profileIconPx} />
          </span>
          <span style={{
            textOverflow: 'ellipsis',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}>
            {labelPrimary || 'Profile'}
          </span>
        </span>
      ) : (
        <span style={{
          textOverflow: 'ellipsis',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}>
          {labelPrimary || 'search arena'}
        </span>
      )}
      {isSelected && authorName ? (
        <>
          <span style={{
            fontSize: `${zoomAwareFontPx}px`,
            color: TEXT_TERTIARY,
            flexShrink: 0
          }}>by </span>
          <span
            data-interactive="button"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 / zoom, minWidth: 0, overflow: 'hidden', cursor: 'pointer', pointerEvents: 'auto' }}
            data-author-row={true}
            data-user-id={author?.id ? String(author.id) : undefined}
            data-user-username={author?.username || undefined}
            data-user-fullname={author?.full_name || undefined}
            data-user-avatar={author?.avatar || undefined}
            onPointerDown={(e) => {
              stopEventPropagation(e)
              // Don't select user if meta key is pressed (used for tiling spawn)
              if (!e.metaKey && author?.id) {
                handleUserSelect(author.id, author.username || author.full_name || '', author?.avatar || undefined)
              }
            }}
          >
            <Avatar src={authorAvatar} size={labelIconPx} />
            <span style={{
              fontSize: `${zoomAwareFontPx}px`,
              color: TEXT_TERTIARY,
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}>{authorName}</span>
          </span>
        </>
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

  return (
    <div
      style={{
        position: 'absolute',
        top: -(labelHeight + labelOffset),
        left: -2,
        width: w,
        height: labelHeight,
        pointerEvents: 'all',
        zIndex: 8,
      }}
    >
      <div
        style={{
          fontFamily: "'Alte Haas Grotesk', system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif",
          fontSize: `${zoomAwareFontPx}px`,
          lineHeight: 1.1,
          left: 8,
          position: 'relative',
          fontWeight: 600,
          letterSpacing: '-0.0125em',
          color: TEXT_SECONDARY,
          padding: 6,
          textAlign: 'left',
          verticalAlign: 'top',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 8 / z,
          userSelect: isSelected ? 'auto' : 'none',
          pointerEvents: 'auto',
          outline: 'none',
          border: 'none',
          background: 'transparent',
        }}
        onClick={(e) => {
          stopEventPropagation(e)
          if (!isSelected) {
            editor.setSelectedShapes([shapeId])
          }
        }}
        onDoubleClick={(e) => {
          stopEventPropagation(e)
          e.preventDefault()
          if (!isSelected) return
          setIsEditingLabel(true)
          setTimeout(() => inputRef.current?.focus(), 0)
        }}
      >
        {isEditingLabel ? (
          <SearchInterface
            initialValue={channel || ''}
            onSearchSelection={onSearchSelection}
            isSelected={isSelected}
            editor={editor}
            shapeId={shapeId}
            inputType="input"
            placeholder={(channel || userId) ? 'Change…' : 'search arena'}
            inputStyle={{
              fontFamily: 'inherit',
              fontSize: `${zoomAwareFontPx}px`,
              fontWeight: 600,
              letterSpacing: '-0.0125em',
              color: 'var(--color-text)',
              border: 'none',
              borderRadius: 0,
              padding: `${2 / z}px ${4 / z}px`,
              background: 'transparent',
              width: 'auto',
              minWidth: 60,
              outline: 'none',
            }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4 / z,
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
            onDoubleClick={(e) => {
              stopEventPropagation(e)
              e.preventDefault()
              if (!isSelected) return
              setIsEditingLabel(true)
              setTimeout(() => inputRef.current?.focus(), 0)
            }}
          >
            <PortalLabel
              userId={userId}
              userName={userName}
              userAvatar={userAvatar}
              channel={channel}
              title={title}
              author={author}
              isSelected={isSelected}
              zoom={z}
              zoomAwareFontPx={zoomAwareFontPx}
              labelIconPx={labelIconPx}
              handleUserSelect={handleUserSelect}
              TEXT_TERTIARY={TEXT_SECONDARY}
              stopEventPropagation={stopEventPropagation}
            />
          </div>
        )}
      </div>
    </div>
  )
}

