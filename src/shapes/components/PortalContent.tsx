import { useRef, useState, type RefObject } from 'react'
import { stopEventPropagation } from 'tldraw'
import { ArenaDeck } from '../../arena/Deck'
import { ErrorBoundary } from '../../arena/components/ErrorBoundary'
import { invalidateArenaChannel } from '../../arena/api'
import { isInteractiveTarget } from '../../arena/dom'
import { ArenaUserChannelsIndex } from '../../arena/ArenaUserChannelsIndex'
import { InteractiveUserCard } from '../../arena/components/InteractiveUserCard'
import { SearchPortal } from './SearchPortal'
import { LoadingPulse } from '../LoadingPulse'
import type { Card, SearchResult } from '../../arena/types'
import type { ReferenceDimensions } from '../../arena/layout'

export interface ThreeDBoxContentProps {
  // Mode
  mode: 'search' | 'channel' | 'user'
  predictedLayoutMode: string

  // Dimensions
  w: number
  h: number
  cornerRadius: number
  searchFont: { fontSizePx: number; lineHeight: number }
  searchPadding: {
    containerVertical: number
    containerHorizontal: number
    inputVertical: number
    inputLeft: number
  }
  
  // Channel mode
  channel?: string
  loading: boolean
  error: string | null
  cards: Card[] | null
  title?: string
  deckErrorKey: number
  setDeckErrorKey: (key: number) => void
  referenceDimensions?: ReferenceDimensions
  
  // User mode
  userId?: number
  userName?: string
  userAvatar?: string
  userChannelsLoading: boolean
  userChannelsError: string | null
  userChannels: any[]
  
  // Search mode
  isEditingLabel: boolean
  onSearchSelection: (result: SearchResult | null) => void
  
  // Deck interaction
  selectedCardId: number | null
  onCardPointerDown: (card: Card, size: { w: number; h: number }, event: React.PointerEvent) => void
  onCardPointerMove: (card: Card, size: { w: number; h: number }, event: React.PointerEvent) => void
  onCardPointerUp: (card: Card, size: { w: number; h: number }, event: React.PointerEvent) => void
  onSelectCard: (card: Card, rect: { left: number; top: number; right: number; bottom: number }) => void
  onSelectedCardRectChange: (rect: { left: number; top: number; right: number; bottom: number } | null) => void
  onDeckPersist: (state: { anchorId?: string; anchorFrac?: number; rowX: number; colY: number; stackIndex?: number }) => void
  memoizedInitialPersist: { anchorId?: string; anchorFrac?: number; rowX?: number; colY?: number; stackIndex?: number }
  
  // User channels interaction
  onChannelSelect: (slug: string) => void
  onUserChannelPointerDown: (info: { slug: string; id: number; title: string }, e: React.PointerEvent) => void
  onUserChannelPointerMove: (info: { slug: string; id: number; title: string }, e: React.PointerEvent) => void
  onUserChannelPointerUp: (info: { slug: string; id: number; title: string }, e: React.PointerEvent) => void
  
  // State
  isSelected: boolean
  editor: any
  shapeId: string
  
  // Refs
  contentRef: RefObject<HTMLDivElement | null>
  faceBackgroundRef: RefObject<HTMLDivElement | null>
  
  // Visual
  setIsHovered: (hovered: boolean) => void
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void

  // Selection management
  setSelectedCardId: (id: number | null) => void
  setSelectedCardRect: (rect: { left: number; top: number; right: number; bottom: number } | null) => void
}

export function PortalContent({
  mode,
  predictedLayoutMode,
  w,
  h,
  cornerRadius,
  searchFont,
  searchPadding,
  channel,
  loading,
  error,
  cards,
  title,
  deckErrorKey,
  setDeckErrorKey,
  referenceDimensions,
  userId,
  userName,
  userAvatar,
  userChannelsLoading,
  userChannelsError,
  userChannels,
  isEditingLabel,
  onSearchSelection,
  selectedCardId,
  onCardPointerDown,
  onCardPointerMove,
  onCardPointerUp,
  onSelectCard,
  onSelectedCardRectChange,
  onDeckPersist,
  memoizedInitialPersist,
  onChannelSelect,
  onUserChannelPointerDown,
  onUserChannelPointerMove,
  onUserChannelPointerUp,
  isSelected,
  editor,
  shapeId,
  contentRef,
  faceBackgroundRef,
  setIsHovered,
  panelOpen,
  setPanelOpen,
  setSelectedCardId,
  setSelectedCardRect,
}: ThreeDBoxContentProps) {

  return (
    <div
      ref={contentRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'stretch',
        padding: 0,
        overflow: 'hidden',
        borderRadius: `${cornerRadius}px`,
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif',
        color: '#333',
        fontSize: 16,
        boxSizing: 'border-box',
        zIndex: 4,
      }}
      onPointerDown={(e) => {
        if (isInteractiveTarget(e.target)) {
          stopEventPropagation(e)
          return
        }
        try {
          const targetEl = e.target as HTMLElement
          const insideCard = !!targetEl?.closest?.('[data-interactive="card"]')
          if (!insideCard && selectedCardId != null) {
            setSelectedCardId(null)
            setSelectedCardRect(null)
          }
        } catch {}
        if (!isSelected) {
          editor.setSelectedShapes([shapeId])
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenuCapture={(e) => {
        // Handle right-click to set selection and open connections panel
        stopEventPropagation(e)
        e.preventDefault()
        // Set selection to this shape
        editor.setSelectedShapes([shapeId])
        // Always open panel since this shape is now the only selected one
        setPanelOpen(true)
      }}
      onWheel={(e) => {
        if (e.ctrlKey) {
          e.preventDefault()
        } else {
          // Allow wheel events to pass through to interactive elements
          if (!isInteractiveTarget(e.target)) {
            e.stopPropagation()
          }
        }
      }}
    >
      {mode === 'search' ? (
        <SearchPortal
          initialValue=""
          onSearchSelection={onSearchSelection}
          isSelected={isSelected}
          isEditingLabel={isEditingLabel}
          editor={editor}
          shapeId={shapeId}
          inputType="textarea"
          placeholder="search"
          inputStyle={{
            fontFamily: 'inherit',
            fontSize: `${searchFont.fontSizePx}px`,
            fontWeight: 700,
            letterSpacing: '-0.015em',
            color: '#CACACA',
            border: 'none',
            borderRadius: 0,
            padding: `${searchPadding.inputVertical}px ${searchPadding.inputLeft}px ${searchPadding.inputVertical}px ${searchPadding.inputLeft}px`,
            background: 'transparent',
            width: '100%',
            boxSizing: 'border-box',
            outline: 'none',
            display: 'block',
            resize: 'none',
            overflow: 'hidden',
            lineHeight: searchFont.lineHeight,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            textAlign: 'center',
          }}
          containerStyle={{
            padding: `${searchPadding.containerVertical}px ${searchPadding.containerHorizontal}px ${searchPadding.containerVertical}px ${searchPadding.containerHorizontal}px`,
          }}
          containerWidth={w}
          containerHeight={h}
        />
      ) : mode === 'channel' && channel ? (
        <div style={{ width: '100%', height: '100%' }}>
          {loading ? (
            <LoadingPulse />
          ) : error ? (
            <div style={{ color: 'rgba(0,0,0,.5)', fontSize: 12 }}>error: {error}</div>
          ) : (
            <ErrorBoundary
              resetKeys={[deckErrorKey]}
              onError={(err) => {
                try {
                  if (channel) invalidateArenaChannel(channel)
                  setTimeout(() => {
                    setDeckErrorKey(deckErrorKey + 1)
                  }, 50)
                } catch {}
              }}
              onReset={() => {}}
            >
              <ArenaDeck
                key={`deck-${channel}-${deckErrorKey}`}
                cards={cards ?? []}
                width={w}
                height={h}
                cornerRadius={cornerRadius}
                channelTitle={title || channel}
                referenceDimensions={referenceDimensions}
                onCardPointerDown={onCardPointerDown}
                onCardPointerMove={onCardPointerMove}
                onCardPointerUp={onCardPointerUp}
                initialPersist={memoizedInitialPersist}
                onPersist={onDeckPersist}
                selectedCardId={selectedCardId ?? undefined}
                onSelectCard={onSelectCard}
                onSelectedCardRectChange={onSelectedCardRectChange}
              />
            </ErrorBoundary>
          )}
        </div>
      ) : mode === 'user' && userId ? (
        predictedLayoutMode === 'mini' ? (
          <InteractiveUserCard
            userName={userName}
            userAvatar={userAvatar}
            width={w}
            height={h}
          />
        ) : (
          <ArenaUserChannelsIndex
            loading={userChannelsLoading}
            error={userChannelsError}
            channels={userChannels}
            width={w}
            height={h}
            onSelectChannel={onChannelSelect}
            onChannelPointerDown={onUserChannelPointerDown}
            onChannelPointerMove={onUserChannelPointerMove}
            onChannelPointerUp={onUserChannelPointerUp}
          />
        )
      ) : null}
    </div>
  )
}
