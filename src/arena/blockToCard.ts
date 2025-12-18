import type { ArenaBlock, ArenaUser, Card } from './types'

const toUser = (u: ArenaBlock['user']): ArenaUser | undefined =>
  u
    ? {
        id: u.id,
        username: u.username,
        full_name: u.full_name,
        avatar:
          (u as any).avatar?.thumb ??
          u.avatar_image?.thumb ??
          (typeof (u as any).avatar === 'string' ? ((u as any).avatar as string) : null) ??
          (typeof (u as any).avatar === 'object' ? null : null),
      }
    : undefined

export function blockToCard(b: ArenaBlock): Card {
  const parsedBlockId = Number(b.blockId)
  const numericId = b.arenaId ?? (Number.isFinite(parsedBlockId) ? parsedBlockId : undefined) ?? 0
  const base = {
    id: numericId,
    title: b.title ?? '',
    createdAt: b.created_at,
    user: toUser(b.user),
  }

  if (b.attachment?.content_type?.startsWith('video/')) {
    return {
      ...base,
      type: 'media',
      embedHtml: '',
      thumbnailUrl: b.image?.display?.url,
      provider: b.source?.provider?.name,
      originalUrl: b.attachment.url,
    }
  }

  if (b.attachment?.content_type === 'application/pdf') {
    return {
      ...base,
      type: 'pdf',
      url: b.attachment.url!,
      thumbnailUrl: b.image?.display?.url,
      fileSize: (b as any).attachment?.file_size_display,
      contentType: 'application/pdf',
    }
  }

  switch (b.class) {
    case 'Image': {
      const originalFile = b.image?.original
        ? {
            url: b.image.original.url,
            fileSize: b.image.original.file_size,
            fileSizeDisplay: b.image.original.file_size_display,
          }
        : undefined
      return {
        ...base,
        type: 'image',
        url: b.image?.display?.url ?? '',
        alt: b.title ?? 'Image',
        originalDimensions: (b.image?.original as any)?.width ? (b.image?.original as any) : undefined,
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
        imageUrl: b.image?.display?.url,
        provider: b.source?.provider?.name,
      }
    case 'Media':
      return {
        ...base,
        type: 'media',
        embedHtml: b.embed?.html ?? '',
        thumbnailUrl: b.image?.display?.url,
        provider: b.source?.provider?.name,
        originalUrl: b.source?.url,
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
