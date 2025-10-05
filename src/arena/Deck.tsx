import { useEffect, useMemo, useRef, useState, memo, useCallback, useLayoutEffect } from 'react'
import type React from 'react'
import { Scrubber, useLayoutSprings } from './Scrubber'
import { ConnectionsPanelHost } from './ConnectionsPanelHost'
import { useConnectedChannels } from './hooks/useArenaChannel'
import { useGlobalPanelState } from '../jazz/usePanelState'
import { useDeckLayout } from './hooks/useDeckLayout'
import { useDeckScroll } from './hooks/useDeckScroll'
import { useCardInteraction } from './hooks/useCardInteraction'
import { useCardSizing } from './hooks/useCardSizing'
import { StackLayout } from './components/layouts/StackLayout'
import { MiniLayout } from './components/layouts/MiniLayout'
import { TabsLayout } from './components/layouts/TabsLayout'
import { HorizontalTabsLayout } from './components/layouts/HorizontalTabsLayout'
import { VirtualRowLayout } from './components/layouts/VirtualRowLayout'
import { VirtualGridLayout } from './components/layouts/VirtualGridLayout'
import { getDeckContainerStyle, getScrubberContainerStyle } from './styles/deckStyles'
import type { Card } from './types'
import type { ReferenceDimensions } from './layout'

export type ArenaDeckProps = {
  cards: Card[]
  width: number
  height: number
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
  const wheelHideTimeoutRef = useRef<number | null>(null)
  const isHoveringRef = useRef(false)
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

  // Stack-specific springs
  const stackDepth = 6
  const stackBaseIndex = currentIndex
  const stackCards = layout.layoutMode === 'stack' || layout.layoutMode === 'mini' ? cards.slice(stackBaseIndex, Math.min(cards.length, stackBaseIndex + stackDepth + 1)) : []
  const stackKeys = useMemo(() => stackCards.map((c) => c.id), [stackCards])

  const springConfig = useMemo(() => ({ tension: 560, friction: 30 }), [])
  const getTarget = useCallback(
    (i: number) => {
      const d = i
      const depth = Math.max(0, d)
      const visible = d >= 0 && d <= stackDepth
      const opacityFalloff = Math.exp(-0.35 * depth)
      const scaleFalloff = Math.pow(0.975, depth)
      return {
        x: layout.snapToGrid(0),
        y: layout.snapToGrid(-d * (10 - d * 0.5)),
        rot: 0,
        scale: scaleFalloff,
        opacity: visible ? opacityFalloff : 0,
        zIndex: visible ? 1000 - d : 0,
      }
    },
    [stackDepth, layout]
  )

  const springs = useLayoutSprings(stackKeys, getTarget, springConfig)

  // Wheel handling for stack navigation
  const wheelAccumRef = useRef(0)
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      scroll.lastUserActivityAtRef.current = Date.now()
      if ((layout.layoutMode !== 'stack' && layout.layoutMode !== 'mini') || cards.length <= 1) return
      if (e.ctrlKey) return

      const textScroller = (e.target as HTMLElement | null)?.closest('[data-card-text="true"]') as HTMLElement | null
      if (textScroller) {
        const maxScroll = textScroller.scrollHeight - textScroller.clientHeight
        if (maxScroll > 0) {
          const epsilon = 1
          const scrollingDown = e.deltaY > 0
          const canScrollDown = textScroller.scrollTop < maxScroll - epsilon
          const canScrollUp = textScroller.scrollTop > epsilon
          if ((scrollingDown && canScrollDown) || (!scrollingDown && canScrollUp)) {
            wheelAccumRef.current = 0
            return
          }
        }
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

      if (layout.layoutMode === 'stack') {
        setIsScrubberVisible(true)
        if (wheelHideTimeoutRef.current != null) {
          window.clearTimeout(wheelHideTimeoutRef.current)
        }
        wheelHideTimeoutRef.current = window.setTimeout(() => {
          // Only hide if not currently hovering over the deck
          if (!isHoveringRef.current) {
            setIsScrubberVisible(false)
          }
          wheelHideTimeoutRef.current = null
        }, 900)
      }
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
    if (layout.layoutMode !== 'stack' && wheelHideTimeoutRef.current != null) {
      window.clearTimeout(wheelHideTimeoutRef.current)
      wheelHideTimeoutRef.current = null
    }
    if (layout.layoutMode !== 'stack' && isScrubberVisible) {
      setIsScrubberVisible(false)
    }
  }, [layout.layoutMode, scroll.deckKey, isScrubberVisible])

  useEffect(() => {
    return () => {
      if (wheelHideTimeoutRef.current != null) {
        window.clearTimeout(wheelHideTimeoutRef.current)
        wheelHideTimeoutRef.current = null
      }
    }
  }, [])

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
            springs={springs}
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
            cards={cards}
            currentIndex={currentIndex}
            channelTitle={channelTitle}
            miniDesignSide={layout.miniDesignSide}
            miniScale={layout.miniScale}
            stackKeys={stackKeys}
            springs={springs}
            getCardSizeWithinSquare={sizing.getCardSizeWithinSquare}
            hoveredId={interaction.hoveredId}
            selectedCardId={selectedCardId}
            onCardClick={interaction.handleCardClick}
            onCardPointerDown={undefined}
            onCardPointerMove={undefined}
            onCardPointerUp={undefined}
            onCardContextMenu={interaction.handleCardContextMenu}
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
            rowRef={scroll.rowRef}
            lastUserActivityAtRef={scroll.lastUserActivityAtRef}
            onWheelCapture={() => { }}
          />
        )
      case 'htabs':
        return (
          <HorizontalTabsLayout
            channelTitle={channelTitle}
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
        if (layout.layoutMode === 'stack') {
          setIsScrubberVisible(true)
        }
      }}
      onMouseLeave={() => {
        isHoveringRef.current = false
        if (layout.layoutMode === 'stack') {
          if (wheelHideTimeoutRef.current != null) {
            window.clearTimeout(wheelHideTimeoutRef.current)
          }
          wheelHideTimeoutRef.current = window.setTimeout(() => {
            if (!isHoveringRef.current) {
              setIsScrubberVisible(false)
            }
            wheelHideTimeoutRef.current = null
          }, 450)
        }
      }}
    >
      {renderLayout()}

      {layout.layoutMode === 'stack' && (
        <div style={getScrubberContainerStyle(isScrubberVisible, layout.scrubberHeight)}>
          <Scrubber
            count={cards.length}
            index={currentIndex}
            onChange={scroll.setIndex}
            width={width}
          />
        </div>
      )}

      {interaction.rightClickedCard && interaction.panelPosition && (
        <ConnectionsPanelHost
          screenX={interaction.panelPosition.x}
          screenY={interaction.panelPosition.y}
          widthPx={260}
          maxHeightPx={320}
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
