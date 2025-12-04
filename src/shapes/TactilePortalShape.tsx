import { BaseBoxShapeUtil, HTMLContainer, T, resizeBox, stopEventPropagation, useEditor, useValue, type TLResizeInfo } from 'tldraw'
import type { TLBaseShape } from 'tldraw'
import { TactileDeck } from './components/TactileDeck'
import { HoverIndicator } from './components/HoverIndicator'
import { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { motion } from 'motion/react'
import { isInteractiveTarget } from '../arena/dom'
import { SHAPE_BORDER_RADIUS, SHAPE_SHADOW, ELEVATED_SHADOW, PORTAL_BACKGROUND } from '../arena/constants'
import { MixBlendBorder, type MixBlendBorderHandle } from './MixBlendBorder'
import { selectLayoutMode, type LayoutMode } from '../arena/layoutConfig'
import { getGridSize, snapToGrid, TILING_CONSTANTS } from '../arena/layout'
import { useDoubleClick } from '../hooks/useDoubleClick'
import { PortalAddressBar, MOCK_PORTAL_SOURCES, type PortalSourceOption, type PortalSourceSelection } from './components/PortalAddressBar'
import { getChannelMetadata, getDefaultChannelMetadata } from '../arena/mockMetadata'
import { useMinimizeAnimation } from './hooks/useMinimizeAnimation'
import { useHoverBorder } from './hooks/useHoverBorder'
import { createMinimizeHandler } from './utils/createMinimizeHandler'

export interface TactilePortalShape extends TLBaseShape<
  'tactile-portal',
  {
    w: number
    h: number
    channel?: string
    userId?: number
    userName?: string
    userAvatar?: string
    scrollOffset?: number
    focusedCardId?: number
    minimized?: boolean
    restoredW?: number
    restoredH?: number
    minimizeAnchor?: string
    spawnDragging?: boolean
    spawnIntro?: boolean
  }
> { }

export class TactilePortalShapeUtil extends BaseBoxShapeUtil<TactilePortalShape> {
  static override type = 'tactile-portal' as const
  static override props = {
    w: T.number,
    h: T.number,
    channel: T.string.optional(),
    userId: T.number.optional(),
    userName: T.string.optional(),
    userAvatar: T.string.optional(),
    scrollOffset: T.number.optional(),
    focusedCardId: T.number.optional(),
    minimized: T.boolean.optional(),
    restoredW: T.number.optional(),
    restoredH: T.number.optional(),
    minimizeAnchor: T.string.optional(),
    spawnDragging: T.boolean.optional(),
    spawnIntro: T.boolean.optional(),
  }

  getDefaultProps(): TactilePortalShape['props'] {
    return {
      w: 320,
      h: 320,
      channel: 'cantos-hq',
      userId: undefined,
      userName: undefined,
      userAvatar: undefined,
    }
  }

  onResize(shape: TactilePortalShape, info: TLResizeInfo<TactilePortalShape>) {
    const resized = resizeBox(shape, info)
    const gridSize = getGridSize()

    // Snap dimensions to grid and apply minimums
    const originalW = resized.props.w
    const originalH = resized.props.h
    const snappedW = Math.max(TILING_CONSTANTS.minWidth, snapToGrid(originalW, gridSize))
    const snappedH = Math.max(TILING_CONSTANTS.minHeight, snapToGrid(originalH, gridSize))

    // Calculate how much the dimensions changed due to snapping
    const deltaW = snappedW - originalW
    const deltaH = snappedH - originalH

    // Adjust x/y position based on which handle is being dragged
    // This prevents jittering on the opposite edge
    let adjustedX = resized.x
    let adjustedY = resized.y

    const handle = info.handle

    // For handles that affect the left edge, compensate x position
    if (handle === 'top_left' || handle === 'left' || handle === 'bottom_left') {
      adjustedX = resized.x - deltaW
    }

    // For handles that affect the top edge, compensate y position  
    if (handle === 'top_left' || handle === 'top' || handle === 'top_right') {
      adjustedY = resized.y - deltaH
    }

    return {
      ...resized,
      x: adjustedX,
      y: adjustedY,
      props: {
        ...resized.props,
        w: snappedW,
        h: snappedH,
      }
    }
  }

  component(shape: TactilePortalShape) {
    const editor = useEditor()
    const { w, h, channel, userId, userName, userAvatar, focusedCardId, spawnDragging, spawnIntro } = shape.props
    const { x, y } = shape

    // TODO: zoom=1 for now until we figure out how to fix per
    const labelLayout = useMemo(() => {
      const baseFont = 14
      const fontSize = baseFont
      const height = Math.max(fontSize + 6, 20)
      const iconSize = Math.max(12, Math.min(20, Math.round(fontSize)))
      const paddingLeft = 16

      return {
        top: 10,
        width: w,
        height,
        shapeHeight: h,
        paddingLeft,
        fontSize,
        iconSize,
      }
    }, [w, h])

    // Tactile-specific auto layout mode selection
    const mode: LayoutMode = useMemo(() => selectLayoutMode(w, h), [w, h])

    const labelVisible = useMemo(() => {
      if (mode === 'tab' || mode === 'vtab' || mode === 'mini') {
        return true
      }
      return w >= 140 && h >= 120
    }, [mode, w, h])

  
    // Hover state - single source of truth for both border effects and hover indicator
    const { isHovered, borderRef, handlePointerEnter, handlePointerLeave } = useHoverBorder()

    const [focusedBlock, setFocusedBlock] = useState<{ id: number; title: string } | null>(null)
    const handleFocusChange = useCallback((block: { id: number; title: string } | null) => {
      setFocusedBlock(block)
    }, [])

    const handleFocusPersist = useCallback(
      (id: number | null) => {
        editor.updateShape({
          id: shape.id,
          type: 'tactile-portal',
          props: { focusedCardId: id === null ? undefined : id }
        })
      },
      [editor, shape.id]
    )

    // Use the captured editor instance from the outer scope instead of the one passed to the callback (which might be untyped or unexpected)
    const isSelected = useValue('isSelected', () => editor.getSelectedShapeIds().includes(shape.id), [editor, shape.id])


    // Get connections count for hover indicator
    const connectionsCount = useMemo(() => {
      const metadata = channel
        ? getChannelMetadata(channel) || getDefaultChannelMetadata()
        : getDefaultChannelMetadata()
      return metadata.connections.length
    }, [channel])

    const portalOptions = MOCK_PORTAL_SOURCES
    const fallbackSource: PortalSourceOption =
      portalOptions[0] ??
      {
        kind: 'channel',
        channel: { slug: channel || 'untitled', title: channel || 'Untitled Channel' },
      }

    const currentSource: PortalSourceOption = useMemo(() => {
      if (channel) {
        const match = portalOptions.find(
          (option) => option.kind === 'channel' && option.channel.slug === channel
        )
        if (match) {
          return match
        }
        return {
          kind: 'channel',
          channel: {
            slug: channel,
            title: channel,
          },
        }
      }
      if (userId) {
        return {
          kind: 'author',
          author: {
            id: userId,
            name: userName || 'Unnamed',
            avatar: userAvatar,
          },
        }
      }
      return fallbackSource
    }, [channel, userAvatar, userId, userName, portalOptions, fallbackSource])

    const handleSourceChange = useCallback(
      (selection: PortalSourceSelection) => {
        if (selection.kind === 'channel') {
          editor.updateShape({
            id: shape.id,
            type: 'tactile-portal',
            props: {
              channel: selection.slug,
              userId: undefined,
              userName: undefined,
              userAvatar: undefined,
            },
          })
        } else {
          editor.updateShape({
            id: shape.id,
            type: 'tactile-portal',
            props: {
              channel: undefined,
              userId: selection.userId,
              userName: selection.name,
              userAvatar: selection.avatar,
            },
          })
        }
      },
      [editor, shape.id]
    )

    // Minimize/restore animation hook
    const { contentW, contentH, contentX, contentY, animateTransition } = useMinimizeAnimation(w, h, x, y)
    const handleDoubleClick = useDoubleClick(
      createMinimizeHandler(shape, editor, animateTransition)
    )


    return (
      <HTMLContainer
        style={{
          pointerEvents: 'all',
          overflow: 'visible',
          position: 'relative',
          background: PORTAL_BACKGROUND,
          borderRadius: `${SHAPE_BORDER_RADIUS}px`,
          boxSizing: 'border-box',
        }}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handleDoubleClick}
        
      >
        {/* Visual wrapper to scale full content and border during spawn-drag */}
        <motion.div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: contentW,
            height: contentH,
            x: contentX,
            y: contentY,
            transformOrigin: 'center',
            boxShadow: spawnDragging ? ELEVATED_SHADOW : SHAPE_SHADOW,
            borderRadius: `${SHAPE_BORDER_RADIUS}px`,
            overflow: 'hidden',
            scale: spawnDragging ? 0.95 : spawnIntro ? 1.02 : 1,
          }}
        >
          {/* Border effect - ensure non-interactive and respects rounded corners */}
          <div style={{ pointerEvents: 'none', position: 'absolute', inset: 0 }}>
            <MixBlendBorder
              ref={borderRef}
              panelOpen={false}
              borderRadius={SHAPE_BORDER_RADIUS}
              transformOrigin="top center"
              zIndex={5}
              subtleNormal={true}
            />
          </div>
          {/* Interactive content layer */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              zIndex: 4,
            }}
            onPointerDown={(e) => {
              if (isInteractiveTarget(e.target)) {
                stopEventPropagation(e)
              }
            }}
            onWheel={(e) => {
              if (e.ctrlKey) return
              // Explicitly stop propagation at the shape container level too
              e.stopPropagation()
            }}
          >
            <TactileDeck
              w={w}
              h={h}
              mode={mode}
              source={currentSource}
              shapeId={shape.id}
              initialScrollOffset={shape.props.scrollOffset}
              initialFocusedCardId={focusedCardId}
              onFocusChange={handleFocusChange}
              onFocusPersist={handleFocusPersist}
            />
          </div>
        </motion.div>
        {labelVisible ? (
          <PortalAddressBar
            layout={labelLayout}
            source={currentSource}
            focusedBlock={focusedBlock}
            isSelected={isSelected}
            options={portalOptions}
            onSourceChange={handleSourceChange}
            editor={editor}
            shapeId={shape.id}
            zoom={1}
          />
        ) : null}
        {/* Hover indicator for connections count when not selected */}
        <motion.div
          animate={{ opacity: (!isSelected && isHovered) ? 1 : 0 }}
          transition={{ duration: 0.15 }}
        >
          <HoverIndicator
            connectionsCount={connectionsCount}
            position={{
              x: w + 8, // Right side of shape + small gap
              y: 20  // Vertically centered
            }}
            zoom={1}
          />
        </motion.div>
      </HTMLContainer>
    )
  }

  indicator(shape: TactilePortalShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />
  }
}
