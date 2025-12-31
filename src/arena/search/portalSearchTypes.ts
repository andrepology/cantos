export interface PortalAuthor {
  id: number
  fullName?: string
  avatarThumb?: string
}

export interface PortalChannel {
  id: number
  title: string
  slug: string
  author?: PortalAuthor
  length?: number
}

export type PortalSource =
  | { kind: 'channel'; slug: string; title?: string }
  | { kind: 'author'; id: number; fullName?: string; avatarThumb?: string }

export type PortalSourceOption =
  | { kind: 'channel'; channel: PortalChannel }
  | { kind: 'author'; author: PortalAuthor }

export type PortalSourceSelection =
  | { kind: 'channel'; slug: string }
  | {
      kind: 'author'
      userId: number
      fullName?: string
      avatarThumb?: string
    }


