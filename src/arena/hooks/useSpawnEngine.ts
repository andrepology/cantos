import { useCallback } from 'react'
import { createShapeId, transact, useEditor } from 'tldraw'
import type { Card } from '../types'
import { getGridSize, snapToGrid } from '../layout'

export function useSpawnEngine() {
  const editor = useEditor()

  // Helper function to spawn a channel shape
  const spawnChannelShape = useCallback((card: Card, page: { x: number; y: number }, ctx: any) => {
    const zoom = ctx.zoom
    const size = ctx.cardSize || { w: 240, h: 240 }
    // Use exact dimensions initially to match the visual card size
    const w = size.w
    const h = size.h
    
    const id = createShapeId()
    const slugOrTerm = (card as any).slug || String(card.id)
    const off = ctx.pointerOffsetPage
    
    // Position exactly where the pointer is relative to the card
    const x0 = page.x - (off?.x ?? w / 2)
    const y0 = page.y - (off?.y ?? h / 2)
    
    transact(() => {
      editor.createShapes([{ id, type: 'portal', x: x0, y: y0, props: { w, h, channel: slugOrTerm, spawnDragging: true, spawnIntro: true } } as any])
      editor.setSelectedShapes([id])
    })
    // Clear spawnIntro flag after a frame
    try { requestAnimationFrame(() => { try { editor.updateShape({ id: id as any, type: 'portal', props: { spawnIntro: false } as any }) } catch {} }) } catch {}
    return id
  }, [editor])

  // Helper function to spawn a block shape
  const spawnBlockShape = useCallback((card: Card, page: { x: number; y: number }, ctx: any) => {
    const zoom = ctx.zoom
    const size = ctx.cardSize || { w: 240, h: 240 }
    // Use exact dimensions initially to match the visual card size
    const w = size.w
    const h = size.h
    
    const id = createShapeId()
    
    // Map Card → ArenaBlockShape props
    let props: any
    switch (card.type) {
      case 'image':
        props = { blockId: String(card.id), kind: 'image', title: card.title, imageUrl: (card as any).url }
        break
      case 'text':
        props = { blockId: String(card.id), kind: 'text', title: (card as any).content }
        break
      case 'link':
        props = { blockId: String(card.id), kind: 'link', title: card.title, imageUrl: (card as any).imageUrl, url: (card as any).url }
        break
      case 'media':
        props = { blockId: String(card.id), kind: 'media', title: card.title, imageUrl: (card as any).thumbnailUrl, url: (card as any).originalUrl, embedHtml: (card as any).embedHtml }
        break
      case 'pdf':
        props = { blockId: String(card.id), kind: 'pdf', title: card.title, imageUrl: (card as any).thumbnailUrl, url: (card as any).url }
        break
      default:
        return null
    }

    const off = ctx.pointerOffsetPage
    
    const x0 = page.x - (off?.x ?? w / 2)
    const y0 = page.y - (off?.y ?? h / 2)
    
    props = { ...props, w, h }
    transact(() => {
      editor.createShapes([{ id, type: 'arena-block', x: x0, y: y0, props: { ...props, spawnDragging: true, spawnIntro: true } } as any])
      editor.setSelectedShapes([id])
    })
    try { requestAnimationFrame(() => { try { editor.updateShape({ id: id as any, type: 'arena-block', props: { spawnIntro: false } as any }) } catch {} }) } catch {}
    return id
  }, [editor])

  const spawnFromCard = useCallback((card: Card, page: { x: number; y: number }, ctx: any) => {
    if (card.type === 'channel') {
      return spawnChannelShape(card, page, ctx)
    } else {
      return spawnBlockShape(card, page, ctx)
    }
  }, [spawnChannelShape, spawnBlockShape])

  return { spawnFromCard }
}

