/**
 * Mock metadata service for testing the metadata panel
 * Provides channel and block metadata based on IDs
 */

import type { ConnectionItem } from './ConnectionsPanel'

export interface ChannelMetadata {
  author: { id: number; name: string; avatar?: string }
  createdAt: string
  updatedAt: string
  connections: ConnectionItem[]
}

export interface BlockMetadata {
  author: { id: number; name: string; avatar?: string }
  addedAt: string
}

// Mock channel data
const CHANNEL_DATA: Record<string, ChannelMetadata> = {
  'cantos-hq': {
    author: { id: 1, name: 'Opal Nadir', avatar: 'https://avatar.vercel.sh/opal' },
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-12-01T14:22:00Z',
    connections: [
      { id: 1, title: 'Spectrum Salon', slug: 'spectrum-salon', author: 'Opal', length: 42 },
      { id: 2, title: 'Astrograph Courier', slug: 'astrograph-courier', author: 'Celia', length: 28 },
      { id: 3, title: 'Mycelium Commons', slug: 'mycelium-commons', author: 'Fable', length: 156 },
      { id: 4, title: 'Luminous Logs', slug: 'luminous-logs', author: 'Harper', length: 89 },
    ]
  },
  'spectrum-salon': {
    author: { id: 2, name: 'Opal Nadir', avatar: 'https://avatar.vercel.sh/opal' },
    createdAt: '2024-02-20T16:45:00Z',
    updatedAt: '2024-11-28T09:15:00Z',
    connections: [
      { id: 5, title: 'Cantos HQ', slug: 'cantos-hq', author: 'Opal', length: 234 },
      { id: 6, title: 'Color Theory', slug: 'color-theory', author: 'Maya', length: 67 },
    ]
  },
  'astrograph-courier': {
    author: { id: 3, name: 'Celia Orbitz', avatar: 'https://avatar.vercel.sh/celia' },
    createdAt: '2024-03-10T11:20:00Z',
    updatedAt: '2024-11-30T18:30:00Z',
    connections: [
      { id: 7, title: 'Stellar Maps', slug: 'stellar-maps', author: 'Nova', length: 98 },
      { id: 8, title: 'Cosmic Calendar', slug: 'cosmic-calendar', author: 'Luna', length: 45 },
    ]
  }
}

// Mock block data (by block ID)
const BLOCK_DATA: Record<number, BlockMetadata> = {
  1: {
    author: { id: 1, name: 'Opal Nadir', avatar: 'https://avatar.vercel.sh/opal' },
    addedAt: '2024-11-20T08:15:00Z'
  },
  2: {
    author: { id: 2, name: 'Celia Orbitz', avatar: 'https://avatar.vercel.sh/celia' },
    addedAt: '2024-11-18T14:30:00Z'
  },
  3: {
    author: { id: 3, name: 'Fable Dyad', avatar: 'https://avatar.vercel.sh/fable' },
    addedAt: '2024-11-15T16:45:00Z'
  },
  4: {
    author: { id: 4, name: 'Harper Sable', avatar: 'https://avatar.vercel.sh/harper' },
    addedAt: '2024-11-12T10:20:00Z'
  },
  5: {
    author: { id: 5, name: 'Isolde Finch', avatar: 'https://avatar.vercel.sh/isolde' },
    addedAt: '2024-11-10T13:00:00Z'
  }
}

/**
 * Get channel metadata by slug
 */
export function getChannelMetadata(slug: string): ChannelMetadata | null {
  return CHANNEL_DATA[slug] || null
}

/**
 * Get block metadata by block ID
 */
export function getBlockMetadata(blockId: number): BlockMetadata | null {
  return BLOCK_DATA[blockId] || null
}

/**
 * Get default channel metadata for testing
 */
export function getDefaultChannelMetadata(): ChannelMetadata {
  return CHANNEL_DATA['cantos-hq'] || {
    author: { id: 0, name: 'Unknown Author' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    connections: []
  }
}

/**
 * Get default block metadata for testing
 */
export function getDefaultBlockMetadata(): BlockMetadata {
  return BLOCK_DATA[1] || {
    author: { id: 0, name: 'Unknown Author' },
    addedAt: new Date().toISOString()
  }
}

