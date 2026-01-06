import type { ArenaBlock, ArenaUser, Card } from './types'

const toUser = (u: ArenaBlock['user']): ArenaUser | undefined =>
  u
    ? {
        id: u.id,
        username: u.slug ?? u.username,           // v3 uses slug, v2 uses username
        full_name: u.name ?? u.full_name,         // v3 uses name, v2 uses full_name
        avatar:
          (typeof u.avatar === 'string' ? u.avatar : null) ??
          (u as any).avatar?.thumb ??
          u.avatar_image?.thumb ??
          null,
      }
    : undefined

/** Get image URL - handles both v2 and v3 structures */
const getImageUrl = (image: ArenaBlock['image'], size: 'thumb' | 'display' | 'large'): string | undefined => {
  if (!image) return undefined
  // v3 structure: small/medium/large with src
  if (size === 'thumb' && image.small?.src) return image.small.src
  if (size === 'display' && image.medium?.src) return image.medium.src
  if (size === 'large' && image.large?.src) return image.large.src
  // v2 structure: thumb/display/large with url
  if (size === 'thumb') return image.thumb?.url
  if (size === 'display') return image.display?.url
  if (size === 'large') return image.large?.url
  return undefined
}

/** Get block type - handles both v2 class and v3 type fields */
const getBlockType = (b: ArenaBlock): string => {
  // v3 uses 'type', v2 uses 'class'
  return b.type ?? b.class
}

export function blockToCard(b: ArenaBlock): Card {
  const parsedBlockId = Number(b.blockId)
  const numericId = b.arenaId ?? (Number.isFinite(parsedBlockId) ? parsedBlockId : undefined) ?? 0

  // Extract aspect ratio from v3 image (eliminates need for client-side measurement)
  const aspect = b.image?.aspect_ratio ?? undefined

  const base = {
    id: numericId,
    title: b.title ?? '',
    createdAt: b.created_at,
    user: toUser(b.user),
    // Include aspect ratio if available from v3
    ...(aspect ? { aspect } : {}),
  }

  const blockType = getBlockType(b)

  // Handle Attachment type (v3) or attachment content type checks
  if (blockType === 'Attachment' || b.attachment) {
    if (b.attachment?.content_type?.startsWith('video/')) {
      return {
        ...base,
        type: 'media',
        embedHtml: '',
        thumbnailUrl: getImageUrl(b.image, 'display'),
        provider: b.source?.provider?.name,
        originalUrl: b.attachment.url,
      }
    }

    if (b.attachment?.content_type === 'application/pdf' || b.attachment?.content_type?.includes('pdf')) {
      return {
        ...base,
        type: 'pdf',
        url: b.attachment.url!,
        thumbnailUrl: getImageUrl(b.image, 'display'),
        fileSize: b.attachment?.file_size_display ?? b.attachment?.file_size,
        contentType: 'application/pdf',
      }
    }

    // Generic attachment - treat as link
    if (blockType === 'Attachment') {
      return {
        ...base,
        type: 'link',
        url: b.attachment?.url ?? '',
        imageUrl: getImageUrl(b.image, 'display'),
        contentType: b.attachment?.content_type,
        fileSize: b.attachment?.file_size,
      }
    }
  }

  switch (blockType) {
    case 'Image': {
      const originalFile = b.image?.original
        ? {
            url: b.image.original.url,
            fileSize: b.image.original.file_size,
            fileSizeDisplay: b.image.original.file_size_display,
          }
        : undefined
      // v3 provides dimensions directly on image
      const originalDimensions = (b.image?.width && b.image?.height)
        ? { width: b.image.width, height: b.image.height }
        : (b.image?.original as any)?.width
          ? (b.image?.original as any)
          : undefined
      return {
        ...base,
        type: 'image',
        url: getImageUrl(b.image, 'display') ?? '',
        thumbUrl: getImageUrl(b.image, 'thumb'),
        largeUrl: getImageUrl(b.image, 'large'),
        alt: b.image?.alt_text ?? b.title ?? 'Image',
        originalDimensions,
        originalFile,
      }
    }
    case 'Text':
      return {
        ...base,
        type: 'text',
        content: b.content ?? b.title ?? 'Untitled',
      }
    case 'Link':
      return {
        ...base,
        type: 'link',
        url: b.source?.url ?? '',
        imageUrl: getImageUrl(b.image, 'display'),
        thumbUrl: getImageUrl(b.image, 'thumb'),
        provider: b.source?.provider?.name,
      }
    case 'Media':   // v2
    case 'Embed':   // v3
      return {
        ...base,
        type: 'media',
        embedHtml: b.embed?.html ?? '',
        thumbnailUrl: getImageUrl(b.image, 'display'),
        provider: b.embed?.author_name ?? b.source?.provider?.name,
        originalUrl: b.embed?.source_url ?? b.source?.url,
      }
    case 'Channel':
      return {
        ...base,
        type: 'channel',
        slug: b.connected_by_user_slug || (b as any).slug,
        length: b.length ?? (b as any).length ?? 0,
        updatedAt: b.updated_at ?? (b as any).updated_at,
      } as any
    default:
      return { ...base, type: 'text', content: b.title ?? 'Untitled' }
  }
}
