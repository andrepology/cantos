import { BaseBoxShapeUtil, HTMLContainer, T, resizeBox, stopEventPropagation, useEditor, useValue, type TLResizeInfo } from 'tldraw'
import type { TLBaseShape } from 'tldraw'
import { TactileDeck } from './components/TactileDeck'
import { useMemo, useRef, useState, useLayoutEffect, useCallback } from 'react'
import { motion, useMotionValue, animate } from 'motion/react'
import { isInteractiveTarget } from '../arena/dom'
import { SHAPE_BORDER_RADIUS, SHAPE_SHADOW, ELEVATED_SHADOW, PORTAL_BACKGROUND } from '../arena/constants'
import { MixBlendBorder, type MixBlendBorderHandle } from './MixBlendBorder'
import { selectLayoutMode, type LayoutMode } from '../arena/layoutConfig'
import { getGridSize, snapToGrid, TILING_CONSTANTS } from '../arena/layout'
import { useDoubleClick } from '../hooks/useDoubleClick'
import { PortalAddressBar, MOCK_PORTAL_SOURCES, type PortalSourceOption, type PortalSourceSelection } from './components/PortalAddressBar'

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
    const { w, h, channel, userId, userName, userAvatar, focusedCardId } = shape.props
    const { x, y } = shape

    // Fixed label layout - not zoom-dependent for performance
    // Address bar text should remain readable at all zoom levels
    const labelLayout = useMemo(() => {
      const baseFont = 14
      const fontSize = baseFont
      const height = fontSize + 6
      const iconSize = 16
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

    // Refs and state for visual effects (matching PortalShape structure)
    const faceBackgroundRef = useRef<HTMLDivElement>(null)
    const borderRef = useRef<MixBlendBorderHandle>(null)

    // Hover state managed via refs to avoid re-renders - border updates imperatively
    const hoverStateRef = useRef(false)

    const [focusedBlock, setFocusedBlock] = useState<{ id: number; title: string } | null>(null)
    const handleFocusChange = useCallback((block: { id: number; title: string } | null) => {
      setFocusedBlock(block)
    }, [])
    // Use the captured editor instance from the outer scope instead of the one passed to the callback (which might be untyped or unexpected)
    const isSelected = useValue('isSelected', () => editor.getSelectedShapeIds().includes(shape.id), [editor, shape.id])

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

    // Double-click handler for minimize/restore
    const handleDoubleClick = useDoubleClick((e: React.PointerEvent) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const zoom = rect.width / w
      const x = (e.clientX - rect.left) / zoom
      const y = (e.clientY - rect.top) / zoom

      const T = 40 // Threshold
      let region = 'center'

      const isTop = y < T
      const isBottom = y > h - T
      const isLeft = x < T
      const isRight = x > w - T

      if (isTop && isLeft) region = 'top-left-corner'
      else if (isTop && isRight) region = 'top-right-corner'
      else if (isBottom && isLeft) region = 'bottom-left-corner'
      else if (isBottom && isRight) region = 'bottom-right-corner'
      else if (isTop) region = 'top-edge'
      else if (isBottom) region = 'bottom-edge'
      else if (isLeft) region = 'left-edge'
      else if (isRight) region = 'right-edge'

      const ANIM_DURATION = 0.25

      // CALCULATE TARGET STATE
      let targetW = w
      let targetH = h
      let anchor = shape.props.minimizeAnchor || 'tl'

      if (shape.props.minimized) {
        // RESTORE
        targetW = shape.props.restoredW || 320
        targetH = shape.props.restoredH || 320
      } else {
        // MINIMIZE
        if (region === 'center') return

        // Determine target dimensions and anchor based on region
        if (region.includes('corner')) {
          targetW = 100; targetH = 100
          if (region === 'top-left-corner') anchor = 'br'
          else if (region === 'top-right-corner') anchor = 'bl'
          else if (region === 'bottom-left-corner') anchor = 'tr'
          else if (region === 'bottom-right-corner') anchor = 'tl'
        } else {
          // Edges
          if (region === 'top-edge') { targetH = 40; anchor = 'bottom' }
          else if (region === 'bottom-edge') { targetH = 40; anchor = 'top' }
          else if (region === 'left-edge') { targetW = 60; anchor = 'right' }
          else if (region === 'right-edge') { targetW = 60; anchor = 'left' }
        }
      }

      // CALCULATE NEW POSITION BASED ON ANCHOR
      // We want the "anchor" point to remain fixed.
      // If anchor is BR, then x + w = newX + targetW => newX = x + w - targetW
      // If anchor is TL, then x = newX

      let newX = shape.x
      let newY = shape.y

      if (anchor.includes('right')) newX = shape.x + w - targetW
      else if (anchor === 'left' || anchor.includes('left')) newX = shape.x
      else if (anchor === 'top' || anchor.includes('top')) newX = shape.x // X doesn't change for pure top/bottom unless corner
      else if (anchor === 'bottom') newX = shape.x // Same

      // Re-evaluate X for Center-Horizontal Anchors (Top/Bottom edges) - wait, Top/Bottom edge anchors?
      // If anchor is 'top', it means Top edge fixed. So Y stays same.
      // If anchor is 'bottom', it means Bottom edge fixed. Y changes.
      // If anchor is 'left', X stays same.
      // If anchor is 'right', X changes.

      // Let's just use a cleaner switch
      switch (anchor) {
        case 'tl': newX = shape.x; newY = shape.y; break;
        case 'tr': newX = shape.x + w - targetW; newY = shape.y; break;
        case 'bl': newX = shape.x; newY = shape.y + h - targetH; break;
        case 'br': newX = shape.x + w - targetW; newY = shape.y + h - targetH; break;
        case 'top': newX = shape.x; newY = shape.y; break;
        case 'bottom': newX = shape.x; newY = shape.y + h - targetH; break;
        case 'left': newX = shape.x; newY = shape.y; break;
        case 'right': newX = shape.x + w - targetW; newY = shape.y; break;
      }

      // ANIMATION
      // Visual Delta = Target Global Pos - Current Global Pos
      // We want to animate "Content" to this delta.
      const visualDeltaX = newX - shape.x
      const visualDeltaY = newY - shape.y

      animate(contentW, targetW, { duration: ANIM_DURATION, ease: 'easeInOut' })
      animate(contentH, targetH, { duration: ANIM_DURATION, ease: 'easeInOut' })
      if (visualDeltaX !== 0) animate(contentX, visualDeltaX, { duration: ANIM_DURATION, ease: 'easeInOut' })
      if (visualDeltaY !== 0) animate(contentY, visualDeltaY, { duration: ANIM_DURATION, ease: 'easeInOut' })

      // COMMIT
      setTimeout(() => {
        editor.updateShape({
          id: shape.id,
          type: 'tactile-portal',
          x: newX,
          y: newY,
          props: {
            w: targetW,
            h: targetH,
            minimized: !shape.props.minimized,
            restoredW: shape.props.minimized ? undefined : w,
            restoredH: shape.props.minimized ? undefined : h,
            minimizeAnchor: anchor
          }
        })
      }, ANIM_DURATION * 1000)

      stopEventPropagation(e as any)
      e.preventDefault()
    })

    // FLIP animation logic removed in favor of delayed commit
    // We'll use local motion values to drive the animation first, then commit logic.
    const contentW = useMotionValue(w)
    const contentH = useMotionValue(h)
    const contentX = useMotionValue(0)
    const contentY = useMotionValue(0)

    // Sync w/h/x/y when props change to reset the "visual" state to the "logical" state
    useLayoutEffect(() => {
      contentW.stop()
      contentH.stop()
      contentX.stop()
      contentY.stop()

      contentW.set(w)
      contentH.set(h)
      contentX.set(0)
      contentY.set(0)
    }, [w, h, x, y])

    // Hover handlers - update border imperatively without re-renders
    const handlePointerEnter = useCallback(() => {
      hoverStateRef.current = true
      borderRef.current?.setHovered(true)
    }, [])

    const handlePointerLeave = useCallback(() => {
      hoverStateRef.current = false
      borderRef.current?.setHovered(false)
    }, [])

    return (
      <HTMLContainer
        style={{ pointerEvents: 'all', overflow: 'visible', position: 'relative' }}
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
            // transition: 'box-shadow 0.2s ease, transform 0.15s ease, width 0.2s ease, height 0.2s ease',
            // transform: 'scale(1.0)', // Conflict with motion style x/y
            transformOrigin: 'center',
            boxShadow: SHAPE_SHADOW,
            borderRadius: `${SHAPE_BORDER_RADIUS}px`,
            overflow: 'hidden',
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
          {/* Face background */}
          <div
            ref={faceBackgroundRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              background: PORTAL_BACKGROUND,
              borderRadius: `${SHAPE_BORDER_RADIUS}px`,
              boxSizing: 'border-box',
              zIndex: 3,
            }}
          />
          {/* Content layer (interactive) */}
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
            // mode={mode}
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
      </HTMLContainer>
    )
  }

  indicator(shape: TactilePortalShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />
  }
}
