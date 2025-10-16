## Are.na Channel Viewer as a TLDraw Shape — Plan

### Goals
- Embed an Are.na channel viewer inside a TLDraw shape (host within `ThreeDBoxShape.tsx`).
- Apply SWE best practices: clear separation (types, API, hook, UI), testable units.
- Keep a simple, clean UI (greys/whitespace), no AI, no autocomplete.
- Provide a light “physical card deck” drag interaction without new deps.

### Non-Goals
- No AI channel recommendation.
- No channel autocomplete or large Are.na client abstraction.
- No additional animation libraries.

### High-Level Architecture
```mermaid
flowchart TD
  TBX[ThreeDBoxShapeUtil \n (TLDraw shape)] -->|renders| Deck[ArenaDeck (React)]
  Deck --> Hook[useArenaChannel]
  Hook --> API[fetchArenaChannel]
  API --> ARENA[`https://api.are.na/v2/channels/{slug}`]
  API --> Cache[(in-memory cache)]
```

### Directory Layout
- `src/arena/types.ts` — Are.na types + internal Card type
- `src/arena/api.ts` — minimal fetch + pagination + in-memory cache
- `src/arena/useArenaData.ts` — React hook for data (loading/error/cards)
- `src/arena/Deck.tsx` — minimal deck UI (drag top card, dismiss or snap)
- `src/shapes/ThreeDBoxShape.tsx` — host viewer; add `channel?: string` prop

---

### Types
Create `src/arena/types.ts`:
```ts
export type ArenaUser = {
  id: number
  username: string
  full_name: string
  avatar?: string | null
}

export type ArenaBlockClass = 'Image' | 'Text' | 'Link' | 'Media'

export type ArenaBlock = {
  id: number
  class: ArenaBlockClass | string
  title?: string
  created_at: string
  description?: string
  content?: string
  content_html?: string
  user?: {
    id: number
    username: string
    full_name: string
    avatar?: { thumb?: string } | null
    avatar_image?: { thumb?: string } | null
  }
  image?: {
    display?: { url?: string }
    original?: { width: number; height: number }
  }
  source?: { url?: string; provider?: { name?: string } }
  embed?: { html?: string }
  attachment?: { url?: string; content_type?: string }
}

export type ArenaChannelResponse = {
  id: number
  title: string
  slug: string
  contents: ArenaBlock[]
  pagination?: { next?: string | null }
}

export type CardBase = {
  id: number
  title: string
  createdAt: string
  user?: ArenaUser
}

export type CardImage = CardBase & {
  type: 'image'
  url: string
  alt: string
  originalDimensions?: { width: number; height: number }
}

export type CardText = CardBase & {
  type: 'text'
  content: string
}

export type CardLink = CardBase & {
  type: 'link'
  url: string
  imageUrl?: string
  provider?: string
}

export type CardMedia = CardBase & {
  type: 'media'
  embedHtml: string
  thumbnailUrl?: string
  provider?: string
  originalUrl?: string
}

export type Card = CardImage | CardText | CardLink | CardMedia
```

### API
Create `src/arena/api.ts`:
```ts
import type { ArenaChannelResponse, ArenaBlock, Card, ArenaUser } from './types'

const cache = new Map<string, Card[]>()

const toUser = (u: ArenaBlock['user']): ArenaUser | undefined =>
  u
    ? {
        id: u.id,
        username: u.username,
        full_name: u.full_name,
        avatar: u.avatar?.thumb ?? u.avatar_image?.thumb ?? null,
      }
    : undefined

const blockToCard = (b: ArenaBlock): Card => {
  const base = {
    id: b.id,
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

  switch (b.class) {
    case 'Image':
      return {
        ...base,
        type: 'image',
        url: b.image?.display?.url ?? '',
        alt: b.title ?? 'Image',
        originalDimensions: b.image?.original,
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
    default:
      return { ...base, type: 'text', content: b.title ?? 'Untitled' }
  }
}

export async function fetchArenaChannel(slug: string, per: number = 40): Promise<Card[]> {
  if (cache.has(slug)) return cache.get(slug)!

  const collected: ArenaBlock[] = []
  let url = `https://api.are.na/v2/channels/${encodeURIComponent(slug)}?per=${per}`

  while (url) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Are.na fetch failed: ${res.status} ${res.statusText}`)
    const json = (await res.json()) as ArenaChannelResponse
    collected.push(...(json.contents ?? []))
    url = json.pagination?.next ?? ''
  }

  const cards = collected.map(blockToCard)
  cache.set(slug, cards)
  return cards
}
```

### Hook
Create `src/arena/useArenaData.ts`:
```ts
import { useEffect, useState } from 'react'
import { fetchArenaChannel } from './api'
import type { Card } from './types'

export type UseArenaState = {
  loading: boolean
  error: string | null
  cards: Card[]
}

export function useArenaChannel(slug: string | undefined): UseArenaState {
  const [state, setState] = useState<UseArenaState>({ loading: false, error: null, cards: [] })

  useEffect(() => {
    let cancelled = false
    if (!slug) {
      setState({ loading: false, error: null, cards: [] })
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    fetchArenaChannel(slug)
      .then((cards) => !cancelled && setState({ loading: false, error: null, cards }))
      .catch((e) => !cancelled && setState({ loading: false, error: e.message ?? 'Error', cards: [] }))
    return () => {
      cancelled = true
    }
  }, [slug])

  return state
}
```

### Deck UI
Create `src/arena/Deck.tsx` (no extra deps):
```tsx
import { useMemo, useRef, useState } from 'react'
import type { Card } from './types'

export type ArenaDeckProps = {
  cards: Card[]
  width: number
  height: number
}

type Vec = { x: number; y: number }

export function ArenaDeck({ cards, width, height }: ArenaDeckProps) {
  const [goneIds, setGoneIds] = useState<Set<number>>(new Set())
  const [drag, setDrag] = useState<{ id: number; start: Vec; cur: Vec } | null>(null)

  const visible = useMemo(() => cards.filter((c) => !goneIds.has(c.id)).slice(0, 12), [cards, goneIds])

  const threshold = Math.max(40, width * 0.25)

  const onPointerDown = (id: number, e: React.PointerEvent) => {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ id, start: { x: e.clientX, y: e.clientY }, cur: { x: e.clientX, y: e.clientY } })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    setDrag((d) => (d ? { ...d, cur: { x: e.clientX, y: e.clientY } } : d))
  }

  const onPointerUp = () => {
    if (!drag) return
    const dx = drag.cur.x - drag.start.x
    const dy = drag.cur.y - drag.start.y
    const dist = Math.hypot(dx, dy)
    if (dist > threshold) {
      setGoneIds((s) => new Set(s).add(drag.id))
    }
    setDrag(null)
  }

  const cardStyle = (idx: number, id: number): React.CSSProperties => {
    const isTop = drag?.id === id
    const dx = isTop ? drag!.cur.x - drag!.start.x : 0
    const dy = isTop ? drag!.cur.y - drag!.start.y : 0
    const rot = isTop ? (dx / width) * 12 : (idx * 4 - 8)
    const scale = isTop ? 1.03 : 1
    return {
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: Math.min(300, width * 0.9),
      height: Math.min(300, height * 0.9),
      transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${scale})`,
      transformOrigin: 'center',
      background: '#fff',
      border: '1px solid rgba(0,0,0,.08)',
      boxShadow: '0 2px 8px rgba(0,0,0,.06)',
      borderRadius: 8,
      userSelect: 'none',
      touchAction: 'none',
      pointerEvents: 'auto',
    }
  }

  const render = (c: Card, idx: number) => {
    switch (c.type) {
      case 'image':
        return <img src={c.url} alt={c.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      case 'text':
        return (
          <div style={{ padding: 16, color: 'rgba(0,0,0,.7)', fontSize: 14, lineHeight: 1.4, overflow: 'auto' }}>{c.content}</div>
        )
      case 'link':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
            {c.imageUrl ? (
              <img src={c.imageUrl} alt={c.title} style={{ width: '100%', height: '65%', objectFit: 'cover' }} />
            ) : null}
            <div style={{ padding: 12, color: 'rgba(0,0,0,.7)' }}>
              <div style={{ fontSize: 14 }}>{c.title}</div>
              {c.provider ? <div style={{ fontSize: 12, opacity: 0.6 }}>{c.provider}</div> : null}
            </div>
          </div>
        )
      case 'media':
        return c.embedHtml ? (
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }} dangerouslySetInnerHTML={{ __html: c.embedHtml }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'rgba(0,0,0,.4)' }}>media</div>
        )
    }
  }

  return (
    <div
      style={{ position: 'relative', width, height, overflow: 'hidden', pointerEvents: 'auto', background: 'transparent' }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {visible.map((c, i) => (
        <div key={c.id}
          style={cardStyle(i, c.id)}
          onPointerDown={(e) => onPointerDown(c.id, e)}
        >
          {render(c, i)}
        </div>
      ))}
    </div>
  )
}
```

### Shape Integration
Edit `src/shapes/ThreeDBoxShape.tsx` in two places:

1) Extend props schema and defaults:
```ts
// props
static override props = {
  w: T.number,
  h: T.number,
  tilt: T.number.optional(),
  shadow: T.boolean.optional(),
  cornerRadius: T.number.optional(),
  channel: T.string.optional(),
}

getDefaultProps() {
  return { w: 200, h: 140, tilt: 8, shadow: true, cornerRadius: 12, channel: '' }
}
```

2) Render deck (replace the face content with channel UI). Keep the 3D/perspective container intact, but make the face interactive:
```tsx
import { ArenaDeck } from '../arena/Deck'
import { useArenaChannel } from '../arena/useArenaData'

component(shape: ThreeDBoxShape) {
  const { w, h, tilt, shadow, cornerRadius, channel } = shape.props
  const editor = this.editor
  const [slug, setSlug] = useState(channel ?? '')
  const { loading, error, cards } = useArenaChannel(channel)

  // ... existing popped / refs / useEffect that manages transform/opacity

  return (
    <HTMLContainer
      style={{ pointerEvents: 'all', width: w, height: h, perspective: `${Math.max(vpb.w, vpb.h)}px`, perspectiveOrigin: `${px}px ${py}px` }}
      onDoubleClick={(e) => { setPopped((p) => !p); stopEventPropagation(e) }}
    >
      <div ref={shadowRef} style={{ /* keep shadow styles */ }} />
      <div
        ref={faceRef}
        style={{ /* keep face styles but make interactive: */ pointerEvents: 'auto', background: '#fff' }}
      >
        {!channel ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              editor.updateShape({ id: shape.id, type: '3d-box', props: { channel: slug } })
            }}
            style={{ display: 'flex', gap: 8, width: '100%' }}
          >
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="are.na channel slug"
              style={{ flex: 1, fontSize: 12, padding: 6, border: '1px solid rgba(0,0,0,.1)' }}
            />
            <button type="submit" style={{ fontSize: 12, padding: '6px 8px', border: '1px solid rgba(0,0,0,.2)' }}>↦</button>
          </form>
        ) : (
          <div style={{ width: '100%', height: '100%' }}>
            {loading ? (
              <div style={{ color: 'rgba(0,0,0,.4)', fontSize: 12 }}>loading…</div>
            ) : error ? (
              <div style={{ color: 'rgba(0,0,0,.5)', fontSize: 12 }}>error: {error}</div>
            ) : (
              <ArenaDeck cards={cards} width={w - 24} height={h - 24} />
            )}
          </div>
        )}
      </div>
    </HTMLContainer>
  )
}
```

Notes:
- Preserve the existing 3D tilt/shadow. Only change `pointerEvents` on the face to enable interaction.
- Use a tiny inline form to set the channel slug once (no autocomplete).
- Keep deck layout bounded by shape `w`×`h` with subtle margins.

### UI Guidelines
- Monochrome greys, no heavy borders; quiet hover/press states.
- No emojis; use Unicode arrows/symbols where needed (↦).

### Testing Checklist
- Create a new 3D Box via the toolbar, enter a valid Are.na channel slug.
- Cards render; drag the top card: it moves with the pointer, releases to snap back; exceed threshold to dismiss.
- Resize shape: deck scales to fit; interactions still work.
- Double-click shape still toggles “popped” tilt per existing logic.
- Network failures show a terse error message; retry by clearing `channel` prop or duplicating shape.

### Future Enhancements (optional)
- Add a tiny header with channel title and back/forward history.
- Persist dismissed cards in shape props (ids in a Set) to maintain curation.
- Add basic keyboard shortcuts (←/→ to cycle cards).


