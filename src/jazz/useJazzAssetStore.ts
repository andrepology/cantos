import { useEffect, useMemo, useRef } from 'react'
import type { TLAssetStore } from 'tldraw'
import { createImage, loadImage } from 'jazz-tools/media'
import type { LoadedCanvasDoc } from './schema'

type ObjectUrlCache = {
  get: (id: string) => string | undefined
  set: (id: string, url: string) => void
  revokeAll: () => void
}

function createObjectUrlCache(): ObjectUrlCache {
  const idToUrl = new Map<string, string>()
  return {
    get: (id) => idToUrl.get(id),
    set: (id, url) => {
      const prev = idToUrl.get(id)
      if (prev && prev !== url) URL.revokeObjectURL(prev)
      idToUrl.set(id, url)
    },
    revokeAll: () => {
      idToUrl.forEach((url) => URL.revokeObjectURL(url))
      idToUrl.clear()
    },
  }
}

export function useJazzAssetStore(canvasDoc: LoadedCanvasDoc | null): TLAssetStore | null {
  // Build a per-hook cache of blob: URLs to avoid leaking
  const cacheRef = useRef<ObjectUrlCache | null>(null)
  if (!cacheRef.current) cacheRef.current = createObjectUrlCache()

  useEffect(() => {
    return () => {
      cacheRef.current?.revokeAll()
    }
  }, [])

  return useMemo<TLAssetStore | null>(() => {
    if (!canvasDoc) return null

    const owner = canvasDoc.$jazz.owner
    const cache = cacheRef.current!

    const parseJazzSrc = (src: string | undefined): string | undefined => {
      if (!src) return undefined
      const prefix = 'jazz://image/'
      if (!src.startsWith(prefix)) return undefined
      return src.slice(prefix.length)
    }

    const store: TLAssetStore = {
      async upload(asset, file) {
        // Create an image owned by the canvas' group. Progressive/placeholder off initially.
        const image = await createImage(file, { owner, placeholder: false, progressive: false })

        // Optional bookkeeping: if assets list exists, append a link (best-effort, optional)
        try {
          canvasDoc.assets?.$jazz.push?.({
            tlAssetId: asset.id,
            image,
            name: (file as any).name,
            mime: (file as any).type,
          } as any)
        } catch {}

        return { src: `jazz://image/${image.id}` }
      },

      async resolve(asset) {
        const id = parseJazzSrc((asset.props as any).src ?? undefined)
        if (!id) return asset.props.src

        const cached = cache.get(id)
        if (cached) return cached

        const data: any = await loadImage(id)
        let blob: Blob | null = null
        if (data instanceof Blob) {
          blob = data
        } else if (data && data.image && typeof data.image.toBlob === 'function') {
          blob = await data.image.toBlob()
        }
        if (!blob) return asset.props.src
        const url = URL.createObjectURL(blob)
        cache.set(id, url)
        return url
      },
    }

    return store
  }, [canvasDoc])
}


