/**
 * Intent detection for tiling preview and commit.
 * Extracts spawn type and metadata from DOM event targets.
 */

export interface SpawnIntent {
  type: '3d-box' | 'arena-block'
  kind?: 'channel' | 'user' | 'image' | 'text' | 'link' | 'media' | 'pdf'
  cardEl?: HTMLElement
  metadata: {
    // For channels
    channelSlug?: string
    // For users  
    userId?: number
    userName?: string
    userAvatar?: string
    // For blocks
    blockId?: string
    title?: string
    imageUrl?: string
    url?: string
    embedHtml?: string
    content?: string
  }
}

/**
 * Detect spawn intent from pointer event target by inspecting DOM attributes.
 * Returns null if no recognized spawn target is found.
 */
export function getSpawnIntentFromEventTarget(
  target: HTMLElement | null
): SpawnIntent | null {
  if (!target) return null

  // Look for card element (channel or block)
  const cardEl = target.closest?.('[data-interactive="card"], [data-interactive="button"]') as HTMLElement | null
  
  if (cardEl) {
    const type = cardEl.getAttribute('data-card-type')
    
    if (type === 'channel') {
      const channelSlug = cardEl.getAttribute('data-channel-slug') || ''
      return {
        type: '3d-box',
        kind: 'channel',
        cardEl,
        metadata: { channelSlug }
      }
    }
    
    if (type === 'image' || type === 'text' || type === 'link' || type === 'media' || type === 'pdf') {
      const blockId = cardEl.getAttribute('data-card-id') || undefined
      const title = cardEl.getAttribute('data-card-title') || ''
      const imageUrl = cardEl.getAttribute('data-image-url') || undefined
      const url = cardEl.getAttribute('data-url') || undefined
      const embedHtml = cardEl.getAttribute('data-embed-html') || undefined
      const content = cardEl.getAttribute('data-content') || undefined
      
      return {
        type: 'arena-block',
        kind: type as any,
        cardEl,
        metadata: {
          blockId,
          title: type === 'text' ? content || title : title,
          imageUrl,
          url,
          embedHtml
        }
      }
    }
  }

  // Look for author/user row
  const authorEl = target.closest?.('[data-author-row]') as HTMLElement | null
  if (authorEl) {
    const userId = Number(authorEl.getAttribute('data-user-id') || '') || undefined
    const username = authorEl.getAttribute('data-user-username') || undefined
    const fullName = authorEl.getAttribute('data-user-fullname') || undefined
    const avatar = authorEl.getAttribute('data-user-avatar') || undefined
    
    if (userId) {
      return {
        type: '3d-box',
        kind: 'user',
        metadata: {
          userId,
          userName: username || fullName || '',
          userAvatar: avatar
        }
      }
    }
  }

  return null
}

