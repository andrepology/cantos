import { useEffect, useMemo, useRef, useState, memo, useCallback, useLayoutEffect } from 'react'
import type React from 'react'
import { Scrubber } from './Scrubber'
import { ConnectionsPanelHost } from './ConnectionsPanelHost'
import { useConnectedChannels } from './hooks/useArenaData'
import { useGlobalPanelState } from '../jazz/usePanelState'
import { useDeckLayout } from './hooks/useDeckLayout'
import { useDeckScroll } from './hooks/useDeckScroll'
import { useCardInteraction } from './hooks/useCardInteraction'
import { useCardSizing } from './hooks/useCardSizing'
import { StackLayout } from './components/layouts/StackLayout'
import { MiniLayout } from './components/layouts/MiniLayout'
import { TabsLayout } from './components/layouts/TabsLayout'
import { VerticalTabsLayout } from './components/layouts/VerticalTabsLayout'
import { VirtualRowLayout } from './components/layouts/VirtualRowLayout'
import { VirtualGridLayout } from './components/layouts/VirtualGridLayout'
import { getDeckContainerStyle, getScrubberContainerStyle } from './styles/deckStyles'
import type { Card } from './types'
import type { ReferenceDimensions } from './layout'

export type ArenaDeckProps = {
  cards: Card[]
  width: number
  height: number
  cornerRadius?: number
  channelTitle?: string
  referenceDimensions?: ReferenceDimensions
  onCardPointerDown?: (card: Card, size: { w: number; h: number }, e: React.PointerEvent) => void
  onCardPointerMove?: (card: Card, size: { w: number; h: number }, e: React.PointerEvent) => void
  onCardPointerUp?: (card: Card, size: { w: number; h: number }, e: React.PointerEvent) => void
  initialPersist?: { anchorId?: string; anchorFrac?: number; rowX?: number; colY?: number; stackIndex?: number }
  onPersist?: (state: { anchorId?: string; anchorFrac?: number; rowX: number; colY: number; stackIndex?: number }) => void
  selectedCardId?: number
  onSelectCard?: (card: Card, rectCss: { left: number; top: number; right: number; bottom: number }) => void
  onSelectedCardRectChange?: (rectCss: { left: number; top: number; right: number; bottom: number }) => void
}

const ArenaDeckInner = function ArenaDeckInner(props: ArenaDeckProps) {
  const {
    cards,
    width,
    height,
    cornerRadius,
    channelTitle,
    referenceDimensions,
    onCardPointerDown,
    onCardPointerMove,
    onCardPointerUp,
    initialPersist,
    onPersist,
    selectedCardId,
    onSelectCard,
    onSelectedCardRectChange
  } = props



  const [currentIndex, setCurrentIndex] = useState(0)

  // Stable wrapper for event handlers: keeps prop identity constant while calling latest impl
  const useStableCallback = <T extends (...args: any[]) => any>(fn: T): T => {
    const ref = useRef(fn)
    useLayoutEffect(() => {
      ref.current = fn
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useCallback(((...args: any[]) => (ref.current as any)(...args)) as T, [])
  }

  const [isScrubberVisible, setIsScrubberVisible] = useState(false)
  const isHoveringRef = useRef(false)
  const isHoveringScrubberZoneRef = useRef(false)
  const isDraggingScrubberRef = useRef(false)
  const deckRef = useRef<HTMLDivElement | null>(null)

  // Use extracted hooks
  const layout = useDeckLayout({ width, height, referenceDimensions })
  const scroll = useDeckScroll({
    cards,
    layoutMode: layout.layoutMode,
    initialPersist,
    onPersist,
    currentIndex,
    setCurrentIndex
  })
  const interaction = useCardInteraction({
    onCardPointerDown,
    onCardPointerMove,
    onCardPointerUp,
    onSelectCard,
    onSelectedCardRectChange,
    selectedCardId
  })
  // Bind stable wrappers AFTER interaction is created so we can reference its latest handlers
  const onCardClickStable = useStableCallback(interaction.handleCardClick)
  const onCardPointerDownStable = useStableCallback(interaction.handleCardPointerDown)
  const onCardPointerMoveStable = useStableCallback(interaction.handleCardPointerMove)
  const onCardPointerUpStable = useStableCallback(interaction.handleCardPointerUp)
  const onCardContextMenuStable = useStableCallback(interaction.handleCardContextMenu)
  const scheduleSelectedRectUpdateStable = useStableCallback(interaction.scheduleSelectedRectUpdate)
  const sizing = useCardSizing({
    cardW: layout.cardW,
    cardH: layout.cardH,
    gridSize: layout.gridSize,
    snapToGrid: layout.snapToGrid
  })

  const ensureAspectsFor = useCallback((subset: Card[]) => {
    for (const c of subset) {
      sizing.ensureAspect(c)
    }
  }, [sizing])

  // Keep selected card rect in sync
  useEffect(() => {
    interaction.scheduleSelectedRectUpdate()
  }, [interaction, layout.layoutMode, layout.vw, layout.vh, sizing.aspectVersion, selectedCardId, cards])

  // Get connections for right-clicked channel card
  const channelSlug = interaction.rightClickedCard?.type === 'channel' ? interaction.rightClickedCard.slug : undefined
  const { loading: connectionsLoading, error: connectionsError, connections } = useConnectedChannels(channelSlug, !!channelSlug)
  const connectionsForPanel = useMemo(() => {
    return connections.map((c) => ({
      id: Number(c.id),
      title: (c as any).title || (c as any).slug,
      slug: (c as any).slug,
      author: (c as any).user?.full_name || (c as any).user?.username,
    }))
  }, [connections])

  // Stack-specific static positions
  const stackDepth = 6
  const stackBaseIndex = currentIndex
  const stackCards = layout.layoutMode === 'stack' || layout.layoutMode === 'mini' ? cards.slice(stackBaseIndex, Math.min(cards.length, stackBaseIndex + stackDepth + 1)) : []
  const stackKeys = useMemo(() => stackCards.map((c) => c.id), [stackCards])

  const stackPositions = useMemo(() => {
    return stackKeys.map((_, i) => {
      const d = i
      const depth = Math.max(0, d)
      const visible = d >= 0 && d <= stackDepth
      const opacityFalloff = Math.exp(-0.80 * depth)
      const scaleFalloff = Math.pow(0.915, depth)
      // Add blur as we move backwards in the stack (further from the top/front)
      // Blur increases with depth, e.g. 0px for top card, up to e.g. 6px for the furthest
      return {
        x: layout.snapToGrid(0),
        y: layout.snapToGrid(-d * (7 - d * 0.1)),
        rot: 0,
        scale: scaleFalloff,
        opacity: visible ? opacityFalloff : 0,
        zIndex: visible ? 1000 - d : 0,
      }
    })
  }, [stackKeys, stackDepth, layout])

  // Wheel handling for stack navigation
  const wheelAccumRef = useRef(0)
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      scroll.lastUserActivityAtRef.current = Date.now()
      if ((layout.layoutMode !== 'stack' && layout.layoutMode !== 'mini') || cards.length <= 1) return
      if (e.ctrlKey) return

      // Check if wheel event is on a text element - if so, allow native scrolling
      const textScroller = (e.target as HTMLElement | null)?.closest('[data-card-text="true"]') as HTMLElement | null
      if (textScroller) {
        // Don't prevent default - let the browser handle text scrolling
        // But stop propagation to prevent TLDraw from handling it
        e.stopPropagation()
        return
      }

      e.preventDefault()
      e.stopPropagation()

      const stageFallback = Math.max(layout.vw, layout.vh, 240)
      const stage = layout.layoutMode === 'mini' ? layout.miniDesignSide * layout.miniScale : layout.stageSide || stageFallback
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? stage : 1
      const delta = -e.deltaY * unit
      if (!Number.isFinite(delta) || delta === 0) return

      const threshold = 45
      let accum = wheelAccumRef.current + delta
      const steps = accum > 0 ? Math.floor(accum / threshold) : Math.ceil(accum / threshold)

      if (steps !== 0) {
        const nextIndex = Math.max(0, Math.min(currentIndex + steps, cards.length - 1))
        if (nextIndex !== currentIndex) {
          scroll.setIndex(nextIndex)
          accum -= steps * threshold
        } else {
          accum = 0
        }
      }

      wheelAccumRef.current = accum

    },
    [layout, cards.length, currentIndex, scroll]
  )

  // Manually attach non-passive wheel event listener
  useEffect(() => {
    const deckElement = deckRef.current
    if (!deckElement) return

    deckElement.addEventListener('wheel', handleWheel, { passive: false, capture: true })

    return () => {
      deckElement.removeEventListener('wheel', handleWheel, { capture: true })
    }
  }, [handleWheel])

  // Cleanup effects
  useEffect(() => {
    wheelAccumRef.current = 0
    if (layout.layoutMode !== 'stack' && isScrubberVisible) {
      setIsScrubberVisible(false)
    }
  }, [layout.layoutMode, scroll.deckKey, isScrubberVisible])

  // Render the appropriate layout
  const renderLayout = () => {
    switch (layout.layoutMode) {
      case 'stack':
        return (
          <StackLayout
            cards={cards}
            currentIndex={currentIndex}
            stageSide={layout.stageSide}
            stackStageOffset={layout.stackStageOffset}
            stackKeys={stackKeys}
            positions={stackPositions}
            getCardSizeWithinSquare={sizing.getCardSizeWithinSquare}
            hoveredId={interaction.hoveredId}
            selectedCardId={selectedCardId}
            onCardClick={interaction.handleCardClick}
            onCardPointerDown={interaction.handleCardPointerDown}
            onCardPointerMove={interaction.handleCardPointerMove}
            onCardPointerUp={interaction.handleCardPointerUp}
            onCardContextMenu={interaction.handleCardContextMenu}
            onMouseEnter={() => {}}
            onMouseLeave={() => {}}
          />
        )
      case 'mini':
        return (
          <MiniLayout
            channelTitle={channelTitle}
            miniDesignSide={layout.miniDesignSide}
            miniScale={layout.miniScale}
            cornerRadius={cornerRadius}
          />
        )
      case 'row':
        return (
          <VirtualRowLayout
            cards={cards}
            cardW={layout.cardW}
            cardH={layout.cardH}
            gap={layout.snapToGrid(12)}
            paddingRowTB={layout.paddingRowTB}
            paddingRowLR={layout.paddingRowLR}
            hoveredId={interaction.hoveredId}
            selectedCardId={selectedCardId}
            lastUserActivityAtRef={scroll.lastUserActivityAtRef}
            scheduleSelectedRectUpdate={scheduleSelectedRectUpdateStable}
            onCardClick={onCardClickStable}
            onCardPointerDown={onCardPointerDownStable}
            onCardPointerMove={onCardPointerMoveStable}
            onCardPointerUp={onCardPointerUpStable}
            onCardContextMenu={onCardContextMenuStable}
            containerHeight={height}
            containerWidth={width}
            onEnsureAspects={ensureAspectsFor}
          />
        )
      case 'column':
      case 'grid':
        return (
          <VirtualGridLayout
            cards={cards}
            cardW={layout.cardW}
            cardH={layout.cardH}
            gap={layout.snapToGrid(12)}
            paddingColTB={layout.paddingColTB}
            paddingColLR={layout.layoutMode === 'column' ? layout.paddingColLR : 24}
            hoveredId={interaction.hoveredId}
            selectedCardId={selectedCardId}
            lastUserActivityAtRef={scroll.lastUserActivityAtRef}
            scheduleSelectedRectUpdate={scheduleSelectedRectUpdateStable}
            onCardClick={onCardClickStable}
            onCardPointerDown={onCardPointerDownStable}
            onCardPointerMove={onCardPointerMoveStable}
            onCardPointerUp={onCardPointerUpStable}
            onCardContextMenu={onCardContextMenuStable}
            containerHeight={height}
            containerWidth={width}
            active={true}
          />
        )
      case 'tabs':
        return (
          <TabsLayout
            channelTitle={channelTitle}
            tabHeight={layout.tabHeight}
            paddingTabsTB={layout.paddingTabsTB}
            paddingTabsLR={layout.paddingTabsLR}
            tabGap={layout.tabGap}
            containerWidth={width}
            rowRef={scroll.rowRef}
            lastUserActivityAtRef={scroll.lastUserActivityAtRef}
            onWheelCapture={() => { }}
          />
        )
      case 'htabs':
        return (
          <VerticalTabsLayout
            channelTitle={channelTitle}
            containerHeight={height}
            paddingHTabsLR={layout.paddingHTabsLR}
          />
        )
      default:
        return null
    }
  }

  return (
    <div
      ref={(el) => {
        deckRef.current = el
        if (interaction.containerRef.current !== el) {
          interaction.containerRef.current = el
        }
      }}
      style={getDeckContainerStyle(width, height, layout.layoutMode)}
      onDragStart={(e) => e.preventDefault()}
      onMouseEnter={() => {
        isHoveringRef.current = true
      }}
      onMouseLeave={() => {
        isHoveringRef.current = false
      }}
    >
      {renderLayout()}

      {layout.layoutMode === 'stack' && (
        <>
          {/* Invisible hover zone covering bottom 30% of deck for scrubber visibility */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '30%',
              pointerEvents: 'auto',
              background: 'transparent',
              zIndex: 10,
            }}
            onMouseEnter={() => {
              isHoveringScrubberZoneRef.current = true
              setIsScrubberVisible(true)
            }}
            onMouseLeave={() => {
              isHoveringScrubberZoneRef.current = false
              setTimeout(() => {
                if (!isHoveringScrubberZoneRef.current && !isDraggingScrubberRef.current) {
                  setIsScrubberVisible(false)
                }
              }, 450)
            }}
          />

          <div style={{
            ...getScrubberContainerStyle(isScrubberVisible, layout.scrubberHeight),
            zIndex: 11,
          }}>
            <Scrubber
              count={cards.length}
              index={currentIndex}
              onChange={scroll.setIndex}
              width={width}
              forceSimple={layout.stageSide < 100}
              onScrubStart={() => { isDraggingScrubberRef.current = true }}
              onScrubEnd={() => {
                isDraggingScrubberRef.current = false
                // Hide scrubber after delay if not hovering zone
                setTimeout(() => {
                  if (!isHoveringScrubberZoneRef.current && !isDraggingScrubberRef.current) {
                    setIsScrubberVisible(false)
                  }
                }, 450)
              }}
            />
          </div>
        </>
      )}

      {interaction.rightClickedCard && interaction.panelPosition && (
        <ConnectionsPanelHost
          screenX={interaction.panelPosition.x}
          screenY={interaction.panelPosition.y}
          widthPx={260}
          maxHeightPx={400}
          title={(interaction.rightClickedCard as any)?.title}
          author={(interaction.rightClickedCard as any)?.user ? {
            id: (interaction.rightClickedCard as any).user.id,
            username: (interaction.rightClickedCard as any).user.username,
            full_name: (interaction.rightClickedCard as any).user.full_name,
            avatar: (interaction.rightClickedCard as any).user.avatar
          } : undefined}
          createdAt={(interaction.rightClickedCard as any)?.createdAt}
          updatedAt={(interaction.rightClickedCard as any)?.updatedAt}
          loading={connectionsLoading}
          error={connectionsError}
          connections={connectionsForPanel}
        />
      )}
    </div>
  )
}

ArenaDeckInner.displayName = 'ArenaDeck'

export const ArenaDeck = memo(ArenaDeckInner)
