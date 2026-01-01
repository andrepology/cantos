import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { getTactileScales } from '../arena/constants'
import { useWheelPreventDefault } from '../hooks/useWheelControl'
import { Editor, createShapeId, useEditor, DefaultToolbar, useTools, useIsToolSelected, stopEventPropagation } from 'tldraw'
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
import { Avatar } from '../arena/icons'
import { OverflowCarouselText } from '../arena/OverflowCarouselText'

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
                background: '#f5f5f5',
                border: `1px solid ${DESIGN_TOKENS.colors.border}`,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 12,
                color: '#111',
                cursor: 'pointer',
                userSelect: 'none',
                marginRight: 12,
              }}
            >
              {(arenaUsername || 'You').slice(0, 1).toUpperCase()}
            </div>
          ) : (
            <button
              ref={profileButtonRef}
              style={{ ...COMPONENT_STYLES.buttons.textButton, marginRight: 12 }}
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
              background: '#fff',
              border: '1px solid #e5e5e5',
              borderRadius: 10,
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              padding: 12,
              maxWidth: 320,
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
                      borderRadius: 12,
                      border: '1px solid #eee',
                      boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      alignItems: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 14,
                        overflow: 'hidden',
                        background: '#f3f3f3',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid #e5e5e5',
                      }}
                    >
                      {arenaUser.avatar ? (
                        <img
                          src={typeof arenaUser.avatar === 'string' ? arenaUser.avatar : arenaUser.avatar.thumb || arenaUser.avatar.display || ''}
                          alt={arenaUser.full_name || arenaUser.username}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <span style={{ fontWeight: 700, fontSize: 20 }}>
                          {(arenaUser.full_name || arenaUser.username || 'A').slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>
                      {arenaUser.full_name || arenaUser.username || 'Arena user'}
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        width: '100%',
                        gap: 4,
                        textAlign: 'center',
                        fontSize: 12,
                        color: '#444',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <strong style={{ fontSize: 14 }}>{arenaUser.channel_count ?? '—'}</strong>
                        <span>channels</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <strong style={{ fontSize: 14 }}>{arenaUser.follower_count ?? '—'}</strong>
                        <span>followers</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <strong style={{ fontSize: 14 }}>{arenaUser.following_count ?? '—'}</strong>
                        <span>following</span>
                      </div>
                    </div>
                  </div>
                ) : null}
                <label style={{ fontSize: 12, color: '#333', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  Profile name
                  <input
                    value={(me as any)?.profile?.name ?? ''}
                    placeholder="Name"
                    onChange={(e) => {
                      const val = e.target.value
                      const profile = (me as any)?.profile
                      if (profile) profile.$jazz.set('name', val)
                    }}
                    style={{ border: '1px solid #ccc', borderRadius: 6, padding: '6px 8px', fontSize: 13, background: 'transparent' }}
                  />
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontSize: 12, color: '#333', flex: 1, fontWeight: 600 }}>Arena</div>
                  {arenaAuth.state.status === 'authorized' ? (
                    <button
                      style={{ ...COMPONENT_STYLES.buttons.textButton, flex: 1 }}
                      onClick={() => { arenaAuth.logout() }}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      style={{ ...COMPONENT_STYLES.buttons.textButton, flex: 1 }}
                      onClick={() => arenaAuth.login()}
                    >
                      Connect
                    </button>
                  )}
                </div>
                <button
                  style={COMPONENT_STYLES.buttons.textButton}
                  onClick={() => {
                    jazzContextManager.logOut()
                    arenaAuth.logout()
                  }}
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    style={COMPONENT_STYLES.buttons.textButton}
                    onClick={() => passkeyAuth.signUp('')}
                  >
                    Sign up (passkey)
                  </button>
                  <button
                    style={COMPONENT_STYLES.buttons.textButton}
                    onClick={() => passkeyAuth.logIn()}
                  >
                    Log in (passkey)
                  </button>
                </div>
              </>
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

  const {
    query,
    setQuery,
    filteredOptions,
    highlightedIndex,
    setHighlightedIndex,
    loading
  } = useAddressBarSearch([], '')

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
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color: 'rgba(0,0,0,0.45)' }}
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
                color: 'rgba(0,0,0,0.45)',
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
                backgroundColor: isFocused ? DESIGN_TOKENS.colors.surfaceBackground : 'rgba(245,245,245,0.8)',
                backdropFilter: 'blur(4px)',
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
              iconSize={16}
              dropdownGap={0}
              textScale={textScale}
              loading={loading}
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
    <DefaultToolbar>
      <div
        style={COMPONENT_STYLES.layouts.toolbarRow}
        onWheelCapture={(e) => (e as any).ctrlKey ? (e as any).preventDefault() : (e as any).stopPropagation()}
      >
        <ToolbarProfile />
        <ToolbarSearch arenaUserId={arenaUserId} windowHeight={windowHeight} />
      </div>
    </DefaultToolbar>
  )
}

