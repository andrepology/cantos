import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { getTactileScales } from '../arena/constants'
import { useWheelPreventDefault } from '../hooks/useWheelControl'
import {
  createShapeId,
  DefaultColorStyle,
  GeoShapeGeoStyle,
  getDefaultColorTheme,
  useEditor,
  useTools,
  useIsToolSelected,
  useValue,
  stopEventPropagation,
  TldrawUiMenuContextProvider,
  TldrawUiMenuToolItem,
  TldrawUiButtonIcon,
  TldrawUiPopover,
  TldrawUiPopoverContent,
  TldrawUiPopoverTrigger,
  TldrawUiToolbar,
  TldrawUiToolbarButton,
  useTranslation,
} from 'tldraw'
import * as Popover from '@radix-ui/react-popover'
import { useArenaAuth } from '../arena/hooks/useArenaAuth'
import { useAddressBarSearch } from '../shapes/components/AddressBar/useAddressBarSearch'
import { AddressBarDropdown } from '../shapes/components/AddressBar/AddressBarDropdown'
import { useMotionValue } from 'motion/react'
import type { ArenaUser } from '../arena/types'
import type { PortalSourceOption } from '../arena/search/portalSearchTypes'
import { useAccount, useIsAuthenticated, usePasskeyAuth } from 'jazz-tools/react'
import { useJazzContextManager } from 'jazz-tools/react-core'
import { Account } from '../jazz/schema'
import {
  COMPONENT_STYLES,
  DESIGN_TOKENS,
  SHAPE_SHADOW,
} from '../arena/constants'
import { getGridSize, snapToGrid } from '../arena/layout'
import { useScreenToPagePoint } from '../arena/hooks/useScreenToPage'
import { usePortalSpawnDrag } from '../arena/hooks/usePortalSpawnDrag'
import { useMyChannels } from '../arena/hooks/useMyChannels'

const DRAW_TOOL_IDS = ['draw', 'highlight', 'eraser'] as const
const SHAPE_TOOL_IDS = ['rectangle', 'ellipse', 'triangle', 'diamond', 'arrow'] as const

const COLOR_SWATCHES = [
  'black',
  'grey',
  'blue',
  'green',
  'yellow',
  'orange',
  'red',
  'violet',
] as const

type ColorSwatch = (typeof COLOR_SWATCHES)[number]

const ToolbarToolButton = React.memo(({ toolId }: { toolId: string }) => {
  const tools = useTools()
  const isSelected = useIsToolSelected(tools[toolId])

  return <TldrawUiMenuToolItem toolId={toolId} isSelected={isSelected} />
})

const ToolbarToolTrigger = React.forwardRef<
  HTMLButtonElement,
  { toolId: string } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ toolId, onClick, type: _type, ...props }, ref) => {
  const tools = useTools()
  const msg = useTranslation()
  const tool = tools[toolId]
  const isSelected = useIsToolSelected(tool)

  if (!tool) return null

  return (
    <TldrawUiToolbarButton
      ref={ref}
      type="tool"
      aria-label={msg(tool.label)}
      aria-pressed={isSelected ? 'true' : 'false'}
      data-state={isSelected ? 'on' : 'off'}
      isActive={isSelected}
      data-testid={`tools.${toolId}`}
      data-value={toolId}
      onClick={(event) => {
        onClick?.(event)
        tool.onSelect('toolbar')
      }}
      {...props}
    >
      <TldrawUiButtonIcon icon={tool.icon} />
    </TldrawUiToolbarButton>
  )
})

ToolbarToolTrigger.displayName = 'ToolbarToolTrigger'

const ColorSwatches = React.memo(({ onSelect }: { onSelect: (color: ColorSwatch) => void }) => {
  const editor = useEditor()
  const theme = getDefaultColorTheme({ isDarkMode: editor.user.getIsDarkMode() })
  const activeColor = useValue(
    'active color',
    () => editor.getInstanceState().stylesForNextShape[DefaultColorStyle.id] as ColorSwatch | undefined,
    [editor]
  ) ?? 'black'

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingLeft: 8 }}>
      {COLOR_SWATCHES.map((color) => {
        const swatch = theme[color].solid
        const isActive = activeColor === color

        return (
          <button
            key={color}
            type="button"
            onPointerDown={stopEventPropagation}
            onPointerUp={stopEventPropagation}
            onClick={() => onSelect(color)}
            style={{
              width: 16,
              height: 16,
              borderRadius: 999,
              border: isActive
                ? `2px solid ${DESIGN_TOKENS.colors.textPrimary}`
                : `1px solid ${DESIGN_TOKENS.colors.border}`,
              background: swatch,
              boxShadow: isActive ? `0 0 0 2px ${DESIGN_TOKENS.colors.background}` : 'none',
              padding: 0,
              cursor: 'pointer',
            }}
            aria-label={`Set color ${color}`}
          />
        )
      })}
    </div>
  )
})

const ToolGroupPopover = React.memo(
  ({
    id,
    activeToolId,
    toolIds,
    onColorSelect,
  }: {
    id: string
    activeToolId: string
    toolIds: readonly string[]
    onColorSelect?: (color: ColorSwatch) => void
  }) => {
    return (
      <TldrawUiPopover id={id}>
        <TldrawUiPopoverTrigger>
          <ToolbarToolTrigger toolId={activeToolId} />
        </TldrawUiPopoverTrigger>
        <TldrawUiPopoverContent side="top" align="center" sideOffset={6}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: 6,
            }}
            onPointerDown={stopEventPropagation}
            onPointerUp={stopEventPropagation}
          >
            <TldrawUiMenuContextProvider type="toolbar" sourceId="toolbar">
              {toolIds.map((toolId) => (
                <ToolbarToolButton key={toolId} toolId={toolId} />
              ))}
            </TldrawUiMenuContextProvider>
            {onColorSelect ? <ColorSwatches onSelect={onColorSelect} /> : null}
          </div>
        </TldrawUiPopoverContent>
      </TldrawUiPopover>
    )
  }
)

const ToolbarTools = React.memo(({ side = 'all' }: { side?: 'left' | 'right' | 'all' }) => {
  const editor = useEditor()
  const msg = useTranslation()
  const activeToolId = useValue('active tool', () => editor.getCurrentToolId(), [editor])
  const currentGeo = useValue(
    'active geo',
    () => editor.getSharedStyles().getAsKnownValue(GeoShapeGeoStyle) as string | undefined,
    [editor]
  )

  const drawToolId = DRAW_TOOL_IDS.includes(activeToolId as (typeof DRAW_TOOL_IDS)[number])
    ? activeToolId
    : 'draw'
  const shapeToolId = SHAPE_TOOL_IDS.includes(activeToolId as (typeof SHAPE_TOOL_IDS)[number])
    ? activeToolId
    : activeToolId === 'geo' && currentGeo
      ? currentGeo
      : 'rectangle'

  const handleColorSelect = useCallback(
    (color: ColorSwatch) => {
      editor.run(() => {
        if (editor.isIn('select')) {
          editor.setStyleForSelectedShapes(DefaultColorStyle, color)
        }
        editor.setStyleForNextShapes(DefaultColorStyle, color)
        editor.updateInstanceState({ isChangingStyle: true })
      })
    },
    [editor]
  )

  return (
    <TldrawUiToolbar className="tlui-toolbar__tools" label={msg('tool-panel.title')}>
      <div className="tlui-toolbar__tools__list">
        <TldrawUiMenuContextProvider type="toolbar" sourceId="toolbar">
          {side !== 'right' ? <ToolbarToolButton toolId="select" /> : null}
          {side !== 'right' ? (
            <ToolGroupPopover
              id="draw-tool-group"
              activeToolId={drawToolId}
              toolIds={DRAW_TOOL_IDS}
              onColorSelect={handleColorSelect}
            />
          ) : null}
          {side !== 'left' ? (
            <ToolGroupPopover
              id="shape-tool-group"
              activeToolId={shapeToolId}
              toolIds={SHAPE_TOOL_IDS}
            />
          ) : null}
        </TldrawUiMenuContextProvider>
      </div>
    </TldrawUiToolbar>
  )
})

/**
 * SUB-COMPONENT: ToolbarProfile
 * Handles Jazz and Arena authentication status and account management.
 */
const ToolbarProfile = React.memo(() => {
  const arenaAuth = useArenaAuth()
  const me = useAccount(Account, { resolve: { profile: true } } as any)
  const passkeyAuth = usePasskeyAuth({ appName: 'Cantos' })
  const isAuthenticated = useIsAuthenticated()
  const jazzContextManager = useJazzContextManager()
  const profileButtonRef = useRef<any>(null)

  const arenaUser: ArenaUser | null = arenaAuth.state.status === 'authorized'
    ? arenaAuth.state.me
    : null
  const arenaUsername = arenaUser?.username

  useWheelPreventDefault(profileButtonRef, (e) => e.ctrlKey)

  return (
    <div style={COMPONENT_STYLES.layouts.toolbarLeft}>
      <Popover.Root>
        <Popover.Trigger asChild>
          {isAuthenticated ? (
            <div
              ref={profileButtonRef}
              onPointerDown={(e) => stopEventPropagation(e)}
              onPointerUp={(e) => stopEventPropagation(e)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: DESIGN_TOKENS.colors.surfaceBackground,
              border: `1px solid ${DESIGN_TOKENS.colors.border}`,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 12,
              color: DESIGN_TOKENS.colors.textPrimary,
              cursor: 'pointer',
              userSelect: 'none',
              marginRight: 0,
            }}
            >
              {(arenaUsername || 'You').slice(0, 1).toUpperCase()}
            </div>
          ) : (
            <button
              ref={profileButtonRef}
              style={{ ...COMPONENT_STYLES.buttons.textButton, marginRight: 0 }}
              onPointerDown={(e) => stopEventPropagation(e)}
              onPointerUp={(e) => stopEventPropagation(e)}
            >
              Sign in
            </button>
          )}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="bottom"
            align="start"
            sideOffset={6}
            onPointerDown={(e) => stopEventPropagation(e)}
            onPointerUp={(e) => stopEventPropagation(e)}
            style={{
              ...COMPONENT_STYLES.overlays.profilePopover,
              backdropFilter: `blur(${DESIGN_TOKENS.blur.medium})`,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {isAuthenticated ? (
              <>
                {arenaUser ? (
                  <div
                    style={{
                      borderRadius: DESIGN_TOKENS.borderRadius.medium,
                      border: `1px solid ${DESIGN_TOKENS.colors.border}`,
                      background: DESIGN_TOKENS.colors.wash,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      alignItems: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: DESIGN_TOKENS.borderRadius.medium,
                        overflow: 'hidden',
                        background: DESIGN_TOKENS.colors.surfaceBackgroundDense,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: `1px solid ${DESIGN_TOKENS.colors.border}`,
                        boxShadow: DESIGN_TOKENS.shadows.shape,
                      }}
                    >
                      {arenaUser.avatar ? (
                        <img
                          src={typeof arenaUser.avatar === 'string' ? arenaUser.avatar : arenaUser.avatar.thumb || arenaUser.avatar.display || ''}
                          alt={arenaUser.full_name || arenaUser.username}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <span style={{ fontWeight: 700, fontSize: 20, color: DESIGN_TOKENS.colors.textPrimary }}>
                          {(arenaUser.full_name || arenaUser.username || 'A').slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: DESIGN_TOKENS.colors.textPrimary, textAlign: 'center' }}>
                      {arenaUser.full_name || arenaUser.username || 'Arena user'}
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        width: '100%',
                        gap: 4,
                        textAlign: 'center',
                        fontSize: 10,
                        color: DESIGN_TOKENS.colors.textSecondary,
                        borderTop: `1px solid ${DESIGN_TOKENS.colors.border}`,
                        paddingTop: 8,
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <strong style={{ fontSize: 12, color: DESIGN_TOKENS.colors.textPrimary }}>{arenaUser.channel_count ?? '—'}</strong>
                        <span>channels</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <strong style={{ fontSize: 12, color: DESIGN_TOKENS.colors.textPrimary }}>{arenaUser.follower_count ?? '—'}</strong>
                        <span>followers</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <strong style={{ fontSize: 12, color: DESIGN_TOKENS.colors.textPrimary }}>{arenaUser.following_count ?? '—'}</strong>
                        <span>following</span>
                      </div>
                    </div>
                  </div>
                ) : null}
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', width: '100%' }}>
                    <div style={{ fontSize: 11, color: DESIGN_TOKENS.colors.textSecondary, flex: 1, fontWeight: 600 }}>Arena</div>
                    {arenaAuth.state.status === 'authorized' ? (
                      <button
                        style={{ ...COMPONENT_STYLES.buttons.textButton, flex: 1, marginRight: 0, padding: '4px 6px' }}
                        onClick={() => { arenaAuth.logout() }}
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        style={{ ...COMPONENT_STYLES.buttons.textButton, flex: 1, marginRight: 0, padding: '4px 6px' }}
                        onClick={() => arenaAuth.login()}
                      >
                        Connect
                      </button>
                    )}
                  </div>

                  <button
                    style={{ ...COMPONENT_STYLES.buttons.textButton, width: '100%', marginRight: 0, background: 'transparent', boxShadow: 'none', border: 'none', color: DESIGN_TOKENS.colors.textSecondary }}
                    onClick={() => {
                      jazzContextManager.logOut()
                      arenaAuth.logout()
                    }}
                  >
                    Log out
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  style={{ ...COMPONENT_STYLES.buttons.textButton, width: '100%', marginRight: 0, padding: '6px 8px' }}
                  onClick={() => passkeyAuth.signUp('')}
                >
                  Sign up (passkey)
                </button>
                <button
                  style={{ ...COMPONENT_STYLES.buttons.textButton, width: '100%', marginRight: 0, padding: '6px 8px' }}
                  onClick={() => passkeyAuth.logIn()}
                >
                  Log in (passkey)
                </button>
              </div>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
})

/**
 * SUB-COMPONENT: ToolbarSearch
 * Handles Arena search input, results dropdown, and drag-to-spawn logic.
 */
const ToolbarSearch = React.memo(({ arenaUserId, windowHeight }: { arenaUserId: number | undefined, windowHeight: number }) => {
  const editor = useEditor()
  const inputRef = useRef<HTMLInputElement>(null)
  const textScale = useMotionValue(1)
  
  const [isFocused, setIsFocused] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const { channels, loading: channelsLoading } = useMyChannels()

  const myChannelOptions = useMemo<PortalSourceOption[]>(() => {
    if (!channels.length) return []
    return channels.map((ch) => ({
      kind: 'channel',
      channel: {
        id: ch.id,
        title: ch.title,
        slug: ch.slug,
        length: ch.length,
        author: ch.author
          ? {
              id: ch.author.id,
              fullName: ch.author.fullName ?? ch.author.username,
            }
          : undefined,
      },
    }))
  }, [channels])

  const {
    query,
    setQuery,
    filteredOptions,
    highlightedIndex,
    setHighlightedIndex,
    loading: searchLoading
  } = useAddressBarSearch(myChannelOptions, '')

  const loading = channelsLoading || searchLoading

  useWheelPreventDefault(inputRef, (e) => e.ctrlKey)

  const centerDropXY = useCallback((w: number, h: number) => {
    const vpb = editor.getViewportPageBounds()
    const gridSize = getGridSize()
    return {
      x: snapToGrid(vpb.midX - w / 2, gridSize),
      y: snapToGrid(vpb.midY - h / 2, gridSize)
    }
  }, [editor])

  const createFromSelection = useCallback((option: PortalSourceOption | null) => {
    const term = query.trim()
    if (!option && !term) return
    const { x, y } = centerDropXY(320, 320)
    const id = createShapeId()

    if (!option) {
      editor.createShapes([
        { id, type: 'tactile-portal', x, y, props: { w: 320, h: 320, source: { kind: 'channel', slug: term } } as any } as any,
      ])
    } else if (option.kind === 'channel') {
      editor.createShapes([
        { id, type: 'tactile-portal', x, y, props: { w: 320, h: 320, source: { kind: 'channel', slug: option.channel.slug } } as any } as any,
      ])
    } else {
      editor.createShapes([
        { 
          id, 
          type: 'tactile-portal', 
          x, 
          y, 
          props: { 
            w: 320, 
            h: 320, 
            source: { 
              kind: 'author', 
              id: option.author.id, 
              fullName: option.author.fullName, 
              avatarThumb: option.author.avatarThumb 
            } 
          } as any 
        } as any,
      ])
    }
    
    editor.setSelectedShapes([id])
    setQuery('')
  }, [centerDropXY, query, editor, setQuery])

  const screenToPagePoint = useScreenToPagePoint()
  const { handlePointerDown, handlePointerMove, handlePointerUp } = usePortalSpawnDrag<PortalSourceOption>({
    thresholdPx: 12,
    screenToPagePoint,
    getSpawnPayload: (opt) => opt.kind === 'channel' 
      ? { kind: 'channel', slug: opt.channel.slug, title: opt.channel.title }
      : { kind: 'author', userId: opt.author.id, userName: opt.author.fullName || '', userAvatar: opt.author.avatarThumb },
    onClick: (_, option) => {
      createFromSelection(option)
    }
  })

  const isPopoverOpen = isFocused && !!arenaUserId && (filteredOptions.length > 0 || loading)
  const showPlaceholder = !isFocused && query.trim() === ''
  const shouldTranslate = isHovered && showPlaceholder

  return (
    <div style={COMPONENT_STYLES.layouts.toolbarCenter}>
      <Popover.Root open={isPopoverOpen}>
      <Popover.Anchor asChild>
        <div
          style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {/* Magnifying glass icon */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)' + (shouldTranslate ? ' translateX(-46px)' : ''),
                pointerEvents: 'none',
                zIndex: 1,
                transition: 'transform 0.2s ease-out, opacity 0.15s ease-out',
                opacity: showPlaceholder ? 1 : 0,
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color: DESIGN_TOKENS.colors.toolbarIcon }}
              >
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
            </div>

            {/* Search arena text */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%) translateX(14px)',
                pointerEvents: 'none',
                zIndex: 1,
                opacity: shouldTranslate ? 1 : 0,
                transition: 'opacity 0.2s ease-out',
                fontFamily: DESIGN_TOKENS.typography.label,
                fontSize: 14,
                fontWeight: 600,
                color: DESIGN_TOKENS.colors.textSecondary,
              }}
            >
              search arena
            </div>

            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setTimeout(() => setIsFocused(false), 50)}
              onPointerDown={stopEventPropagation}
              onPointerUp={stopEventPropagation}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  if (filteredOptions.length > 0) {
                    setHighlightedIndex((i) => (i < 0 ? 0 : (i + 1) % filteredOptions.length))
                  }
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  if (filteredOptions.length > 0) {
                    setHighlightedIndex((i) => (i <= 0 ? filteredOptions.length - 1 : i - 1))
                  }
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  const chosen = highlightedIndex >= 0 && highlightedIndex < filteredOptions.length ? filteredOptions[highlightedIndex] : null
                  createFromSelection(chosen)
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  inputRef.current?.blur()
                }
              }}
              style={{
                ...COMPONENT_STYLES.inputs.search,
                textAlign: 'left',
                backgroundColor: isFocused
                  ? DESIGN_TOKENS.colors.surfaceBackgroundDense
                  : DESIGN_TOKENS.colors.surfaceBackground,
                backdropFilter: 'blur(4px)',
                paddingLeft: 16,
                paddingRight: 16,
                ...getTactileScales('subtle'),
              }}
            />
          </div>
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            side="top"
            align="center"
            sideOffset={6}
            collisionPadding={12}
            avoidCollisions={true}
            onOpenAutoFocus={(e) => e.preventDefault()}
            style={{
              ...COMPONENT_STYLES.overlays.searchPopover,
              maxHeight: Math.min(400, windowHeight * 0.7),
              padding: 0,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
            onPointerDown={stopEventPropagation}
            onPointerUp={stopEventPropagation}
            onWheel={(e) => (e as any).ctrlKey ? (e as any).preventDefault() : (e as any).stopPropagation()}
          >
            <AddressBarDropdown
              options={filteredOptions}
              highlightedIndex={highlightedIndex}
              onHighlight={setHighlightedIndex}
              onSelect={createFromSelection}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              fontSize={14}
              iconSize={12}
              dropdownGap={0}
              textScale={textScale}
              loading={loading}
              showAuthor={false}
              style={{
                position: 'relative',
                top: 0,
                width: '100%',
                maxHeight: '100%',
                minHeight: 0,
                marginTop: 0,
                flex: '1 1 auto',
                display: 'flex',
                flexDirection: 'column',
              }}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
})

export function CustomToolbar() {
  const arenaAuth = useArenaAuth()
  const [windowHeight, setWindowHeight] = useState(() => typeof window !== 'undefined' ? window.innerHeight : 800)

  // Track window height for responsive panel sizing
  useEffect(() => {
    const handleResize = () => setWindowHeight(window.innerHeight)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const arenaUserId = arenaAuth.state.status === 'authorized' ? arenaAuth.state.me?.id : undefined

  return (
    <div className="tlui-toolbar" style={{ width: '100%' }}>
      <div className="tlui-toolbar__inner" style={{ width: '100%' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            width: '100%',
          }}
          onWheelCapture={(e) => (e as any).ctrlKey ? (e as any).preventDefault() : (e as any).stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ToolbarProfile />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'nowrap' }}>
            <ToolbarSearch arenaUserId={arenaUserId} windowHeight={windowHeight} />
            <div style={{ display: 'flex', flexShrink: 0 }}>
              <ToolbarTools />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
