/**
 * Shared sizing logic for tiling preview and commit.
 * Ensures preview dimensions exactly match committed shape dimensions.
 */

import type { TileCandidate } from './types'
import type { SpawnIntent } from './previewIntent'

export interface ComputeShapePropsInput {
  candidate: TileCandidate
  intent: SpawnIntent
  grid: number
  maxW: number
  maxH: number
  aspectRatio?: number
}

export interface ComputedShapeProps {
  x: number
  y: number
  w: number
  h: number
  type: 'tactile-portal' | 'arena-block'
  props: Record<string, any>
  preview?: {
    kind?: 'image' | 'text' | 'link' | 'media' | 'pdf'
    title?: string
    imageUrl?: string
    url?: string
  }
}

function snapToGrid(value: number, grid: number): number {
  if (grid <= 0) return value
  return Math.max(grid, Math.ceil(value / grid) * grid)
}

/**
 * Compute final shape props for both preview and commit.
 * This function contains all sizing logic including aspect ratio fitting and grid snapping.
 */
export function computeSpawnedShapeProps(
  input: ComputeShapePropsInput
): ComputedShapeProps {
  const { candidate, intent, grid, maxW, maxH, aspectRatio } = input
  
  // Apply max constraints from candidate bounds
  const availableW = Math.min(candidate.w, maxW)
  const availableH = Math.min(candidate.h, maxH)
  
  // 3D Box shapes (channels, users)
  if (intent.type === 'portal') {
    const newW = snapToGrid(availableW, grid)
    const newH = snapToGrid(availableH, grid)
    
    if (intent.kind === 'channel') {
      return {
        x: candidate.x,
        y: candidate.y,
        w: newW,
        h: newH,
        type: 'tactile-portal',
        props: {
          w: newW,
          h: newH,
          source: {
            kind: 'channel',
            slug: intent.metadata.channelSlug || '',
            title: intent.metadata.channelTitle || '',
          }
        }
      }
    }
    
    if (intent.kind === 'user') {
      return {
        x: candidate.x,
        y: candidate.y,
        w: newW,
        h: newH,
        type: 'tactile-portal',
        props: {
          w: newW,
          h: newH,
          source: {
            kind: 'author',
            id: intent.metadata.userId,
            fullName: intent.metadata.userName || '',
            avatarThumb: intent.metadata.userAvatar
          }
        }
      }
    }
  }
  
  // Arena Block shapes (image, text, link, media, pdf)
  if (intent.type === 'arena-block') {
    const blockId = intent.metadata.blockId || String(Date.now())
    
    // Adjust initial w/h to respect ratio if available
    let newW = availableW
    let newH = availableH
    
    if (aspectRatio && Number.isFinite(aspectRatio) && aspectRatio > 0) {
      // Calculate what the dimensions would be if we used the full width
      const widthBasedH = availableW / aspectRatio
      // Calculate what the dimensions would be if we used the full height  
      const heightBasedW = availableH * aspectRatio
      
      // Choose the approach that fits within both constraints
      if (widthBasedH <= availableH) {
        // Width-based calculation fits, use full width
        newW = snapToGrid(availableW, grid)
        newH = snapToGrid(Math.max(1, Math.round(widthBasedH)), grid)
      } else {
        // Height-based calculation fits, use full height
        newW = snapToGrid(Math.max(1, Math.round(heightBasedW)), grid)
        newH = snapToGrid(availableH, grid)
      }
    } else {
      // No aspect ratio, just apply max constraints
      newW = snapToGrid(availableW, grid)
      newH = snapToGrid(availableH, grid)
    }
    
    const props: any = {
      w: newW,
      h: newH,
      blockId,
    }
    
    if (aspectRatio && Number.isFinite(aspectRatio) && aspectRatio > 0) {
      props.aspectRatio = aspectRatio
    }
    
    return {
      x: candidate.x,
      y: candidate.y,
      w: newW,
      h: newH,
      type: 'arena-block',
      props,
      preview: {
        kind: intent.kind as any,
        title: intent.metadata.title,
        imageUrl: intent.metadata.imageUrl,
        url: intent.metadata.url,
      },
    }
  }
  
  // Fallback for unknown types
  return {
    x: candidate.x,
    y: candidate.y,
    w: snapToGrid(availableW, grid),
    h: snapToGrid(availableH, grid),
    type: intent.type === 'portal' ? 'tactile-portal' : intent.type as 'arena-block',
    props: {}
  }
}
