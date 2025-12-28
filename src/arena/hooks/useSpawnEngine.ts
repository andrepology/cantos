import { useCallback } from 'react'
import { createShapeId, transact, useEditor } from 'tldraw'
import type { ArenaBlock as ApiArenaBlock, Card } from '../types'
import { getGridSize, snapToGrid } from '../layout'
import { blockToCard } from '../blockToCard'
import { ArenaBlock as ArenaBlockCoValue, type LoadedArenaBlock } from '../../jazz/schema'
import type { TactilePortalShape } from '../../shapes/TactilePortalShape'
import type { ArenaBlockShape } from '../../shapes/ArenaBlockShape'
import type { PortalSource } from '../search/portalSearchTypes'

export type PortalSpawnPayload =
  | { kind: 'channel'; slug: string; title?: string }
  | { kind: 'author'; userId: number; userName: string; userAvatar?: string }

export type SpawnedPortalShape = { id: string; w: number; h: number }

export interface SpawnContext {
  dimensions?: { w: number; h: number }
  cardSize?: { w: number; h: number }
  pointerOffsetPage?: { x: number; y: number } | null
  select?: boolean
  zoom?: number
}

export function useSpawnEngine() {
  const editor = useEditor()
  const gridSize = getGridSize()

  // Helper function to spawn a block shape
  const spawnBlockShape = useCallback((card: Card, page: { x: number; y: number }, ctx: SpawnContext) => {
    const size = ctx.cardSize || { w: 240, h: 240 }
    // Use exact dimensions initially to match the visual card size
    const w = size.w
    const h = size.h
    
    const id = createShapeId()
    
    const props: ArenaBlockShape['props'] = {
      blockId: String(card.id),
      w,
      h,
      spawnDragging: true,
      spawnIntro: true,
    }

    const off = ctx.pointerOffsetPage
    
    const x0 = page.x - (off?.x ?? w / 2)
    const y0 = page.y - (off?.y ?? h / 2)
    
    transact(() => {
      editor.createShapes([{ id, type: 'arena-block', x: x0, y: y0, props } as any])
    })
    try { requestAnimationFrame(() => { try { editor.updateShape({ id: id as any, type: 'arena-block', props: { spawnIntro: false } as any }) } catch {} }) } catch {}
    return id
  }, [editor])

  const spawnTactilePortalShape = useCallback((payload: PortalSpawnPayload, page: { x: number; y: number }, ctx?: SpawnContext): SpawnedPortalShape | null => {
    const dims = ctx?.dimensions
    const pointerOffset = ctx?.pointerOffsetPage
    const shouldSelect = ctx?.select ?? true
    const w = snapToGrid(dims?.w ?? 180, gridSize)
    const h = snapToGrid(dims?.h ?? 180, gridSize)
    const id = createShapeId()

    const source: PortalSource =
      payload.kind === 'channel'
        ? { kind: 'channel', slug: payload.slug, title: payload.title }
        : { kind: 'author', id: payload.userId, fullName: payload.userName, avatarThumb: payload.userAvatar }

    const props: TactilePortalShape['props'] = {
      w,
      h,
      spawnDragging: true,
      spawnIntro: true,
      source,
    }

    const x0 = page.x - (pointerOffset?.x ?? w / 2)
    const y0 = page.y - (pointerOffset?.y ?? h / 2)

    transact(() => {
      editor.createShapes([
        {
          id,
          type: 'tactile-portal',
          x: x0,
          y: y0,
          props,
        } as any,
      ])
      if (shouldSelect) {
        editor.setSelectedShapes([id])
      }
    })

    try {
      requestAnimationFrame(() => {
        try {
          editor.updateShape({
            id: id as any,
            type: 'tactile-portal',
            props: { spawnIntro: false } as any,
          })
        } catch {}
      })
    } catch {}

    return { id, w, h }
  }, [editor, gridSize])

  const spawnFromCard = useCallback(
    (card: Card | ApiArenaBlock | LoadedArenaBlock, page: { x: number; y: number }, ctx: SpawnContext) => {
      let normalized: Card

      // Case 1: Jazz ArenaBlock (new system)
      if ('$isLoaded' in card) {
        // Simple manual mapping from Jazz block to internal Card
        // Prioritize thumbUrl to match BlockRenderer.tsx for instant visual transition
        const imageUrl = card.thumbUrl || card.displayUrl || card.largeUrl
        normalized = {
          id: card.arenaId ?? 0,
          title: card.title ?? '',
          createdAt: card.createdAt ?? '',
          type: card.type as any, // image, text, link, media, pdf, channel
          content: card.content || '',
          url: card.originalFileUrl || card.displayUrl,
          imageUrl: imageUrl,
          channelSlug: card.channelSlug,
          length: card.length || 0,
          embedHtml: card.embedHtml,
        }
      } 
      // Case 2: API ArenaBlock (legacy conversion)
      else if ('class' in card) {
        normalized = blockToCard(card)
      } 
      // Case 3: Already normalized Card
      else {
        normalized = card
      }

      if (normalized.type === 'channel') {
        const slug = normalized.channelSlug || (normalized as any).slug || String(normalized.id)
        const result = spawnTactilePortalShape(
          { kind: 'channel', slug, title: normalized.title },
          page,
          {
            dimensions: ctx.cardSize,
            pointerOffsetPage: ctx.pointerOffsetPage,
            select: ctx.select ?? false,
          }
        )
        return result?.id ?? null
      }
      return spawnBlockShape(normalized, page, ctx)
    },
    [spawnBlockShape, spawnTactilePortalShape]
  )

  return { spawnFromCard, spawnTactilePortalShape }
}
