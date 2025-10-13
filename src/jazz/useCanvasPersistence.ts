import { useEffect, useRef, useState } from 'react'
import type { Editor } from 'tldraw'
import { getSnapshot, loadSnapshot } from 'tldraw'
import { useAccount } from 'jazz-tools/react'
import { co } from 'jazz-tools'
import { Account, ArenaPrivate, CanvasDoc, Root } from './schema'

// Compression utilities for large payloads
const COMPRESSION_THRESHOLD = 10 * 1024 // 10KB
const COMPRESSION_PREFIX = 'gz:' // Prefix to indicate compressed data

async function compressString(str: string): Promise<string> {
  if (str.length < COMPRESSION_THRESHOLD || !(window as any).CompressionStream) {
    return str // Skip compression for small payloads or unsupported browsers
  }

  try {
    const stream = new (window as any).CompressionStream('gzip')
    const writer = stream.writable.getWriter()
    const reader = stream.readable.getReader()

    writer.write(new TextEncoder().encode(str))
    writer.close()

    const chunks: Uint8Array[] = []
    // Read all chunks
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }

    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
    const compressed = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      compressed.set(chunk, offset)
      offset += chunk.length
    }

    // Convert to base64 for storage
    const base64 = btoa(String.fromCharCode(...compressed))
    return COMPRESSION_PREFIX + base64
  } catch (e) {
    console.warn('[JazzPersistence] Compression failed, using uncompressed', e)
    return str
  }
}

async function decompressString(str: string): Promise<string> {
  if (!str.startsWith(COMPRESSION_PREFIX) || !(window as any).DecompressionStream) {
    return str // Not compressed or unsupported
  }

  try {
    const base64 = str.slice(COMPRESSION_PREFIX.length)
    const binary = atob(base64)
    const compressed = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) compressed[i] = binary.charCodeAt(i)

    const stream = new (window as any).DecompressionStream('gzip')
    const writer = stream.writable.getWriter()
    const reader = stream.readable.getReader()

    writer.write(compressed)
    writer.close()

    const chunks: Uint8Array[] = []
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }

    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
    const decompressed = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      decompressed.set(chunk, offset)
      offset += chunk.length
    }

    return new TextDecoder().decode(decompressed)
  } catch (e) {
    console.warn('[JazzPersistence] Decompression failed', e)
    return str // Return the compressed string as-is if decompression fails
  }
}

// Fast string hash (FNV-1a 32-bit)
function hashString(str: string): string {
  let h = 0x811c9dc5 >>> 0
  for (let i = 0, l = str.length; i < l; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return ('00000000' + h.toString(16)).slice(-8)
}

type LoadingState = { status: 'loading' } | { status: 'ready'; docId: string } | { status: 'error'; error: string }
export type CanvasPersistenceState = LoadingState & { canvasDoc: CanvasDocInstance | null }

type AccountInstance = co.loaded<typeof Account>
type RootInstance = co.loaded<typeof Root>
type CanvasDocInstance = co.loaded<typeof CanvasDoc>

export function useCanvasPersistence(editor: Editor | null, key: string, intervalMs = 120000) { // Default 2 minutes
  const [state, setState] = useState<LoadingState>({ status: 'loading' })
  const { me } = useAccount(Account, { resolve: { root: { canvases: { $each: true } } } })
  const [canvasDoc, setCanvasDoc] = useState<CanvasDocInstance | null>(null)
  const debugPrefix = '[JazzPersistence]'
  const canWrite = Boolean(me && canvasDoc && (me as unknown as { canWrite?: (cv: CanvasDocInstance) => boolean }).canWrite?.(canvasDoc))
  const initedRef = useRef(false)
  const hydratedRef = useRef(false)
  const isHydratingRef = useRef(false)
  const documentDirtyRef = useRef(false)
  const sessionDirtyRef = useRef(false)
  const saveIntervalRef = useRef<number | null>(null)
  const unsubscribeDocRef = useRef<(() => void) | null>(null)
  const unsubscribeAllRef = useRef<(() => void) | null>(null)
  const lastSavedHashRef = useRef<string | null>(null)



  // Reset guards / subscriptions when the persistence key or editor changes
  useEffect(() => {
    // clear any pending interval
    if (saveIntervalRef.current) window.clearInterval(saveIntervalRef.current)
    saveIntervalRef.current = null
    // unsubscribe from any previous editor store listeners
    if (unsubscribeDocRef.current) {
      unsubscribeDocRef.current()
      unsubscribeDocRef.current = null
    }
    if (unsubscribeAllRef.current) {
      unsubscribeAllRef.current()
      unsubscribeAllRef.current = null
    }
    // reset local flags so we can re-hydrate for new key/editor
    initedRef.current = false
    hydratedRef.current = false
    isHydratingRef.current = false
    documentDirtyRef.current = false
    sessionDirtyRef.current = false
    lastSavedHashRef.current = null
    setCanvasDoc(null)
  }, [key, editor])

  useEffect(() => {
    if (me === undefined) return // loading
    if (me === null) return // not signed in
    if (!editor) return // wait for editor before snapshotting/creating
    if (initedRef.current) return // already ensured

    async function ensureDoc() {
      console.time('[Perf] ensureDoc')
      const ed = editor
      if (!ed) return
      try {
        const account = me as AccountInstance
        // Do not recreate root here; rely on Account migration to initialize it.
        if (account.root === null) {
          // Account root is null; waiting for migration to initialize root - no logging
          return
        }
        const root = account.root as RootInstance
        if (!root) return
        const canvases = root.canvases as ReadonlyArray<CanvasDocInstance>
        // Root canvases - no logging
        console.time('[Perf] canvases->match')
        const match = canvases.find((c) => c.key === key)
        console.timeEnd('[Perf] canvases->match')
        if (match) {
          setCanvasDoc(match)
          setState({ status: 'ready', docId: match.$jazz.id })
          // Loaded existing CanvasDoc - no logging
          initedRef.current = true
          try { window.localStorage.setItem(`jazz:canvas:${key}`, match.$jazz.id) } catch {}
          return
        }

        // Fallback: if list link is missing, try recovering by stored id
        try {
          const storedId = window.localStorage.getItem(`jazz:canvas:${key}`)
          if (storedId) {
            console.time('[Perf] CanvasDoc.loadById')
            const recovered = await CanvasDoc.load(storedId)
            console.timeEnd('[Perf] CanvasDoc.loadById')
            if (recovered) {
              const rec = recovered as unknown as CanvasDocInstance
              setCanvasDoc(rec)
              setState({ status: 'ready', docId: rec.$jazz.id })
              console.log(debugPrefix, 'Recovered CanvasDoc via stored id', { key, id: rec.$jazz.id })
              // Ensure it is linked under root for future lookups
              const alreadyLinked = (root.canvases as unknown as ReadonlyArray<CanvasDocInstance>).some(
                (c) => c.$jazz.id === rec.$jazz.id,
              )
              if (!alreadyLinked) {
                ;(root.canvases as unknown as { $jazz: { push: (item: CanvasDocInstance) => void } }).$jazz.push(
                  rec,
                )
                console.log(debugPrefix, 'Re-linked recovered CanvasDoc under root', { id: rec.$jazz.id })
              }
              initedRef.current = true
              return
            }
          }
        } catch (e) {
          console.warn(debugPrefix, 'recover by id failed', e)
        }

        const fullSnapshot = getSnapshot(ed.store)
        const initialSnapshot = JSON.stringify(fullSnapshot)
        const compressedInitialSnapshot = await compressString(initialSnapshot)
        const owner = account.$jazz.owner
        console.time('[Perf] CanvasDoc.create+link')
        const created = CanvasDoc.create({ key, snapshot: compressedInitialSnapshot, title: key }, owner)
        ;(root.canvases as unknown as { $jazz: { push: (item: CanvasDocInstance) => void } }).$jazz.push(
          created as unknown as CanvasDocInstance,
        )
        console.timeEnd('[Perf] CanvasDoc.create+link')
        setCanvasDoc(created as unknown as CanvasDocInstance)
        setState({ status: 'ready', docId: created.$jazz.id })
        initedRef.current = true
        try { window.localStorage.setItem(`jazz:canvas:${key}`, created.$jazz.id) } catch {}
        console.timeEnd('[Perf] ensureDoc')
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        setState({ status: 'error', error: message })
        console.error(debugPrefix, 'ensureDoc error', e)
        console.timeEnd('[Perf] ensureDoc')
      }
    }

    ensureDoc()
  }, [me, key, editor])

  // Hydrate TLDraw from snapshot when the subscribed doc is available
  useEffect(() => {
    if (!editor) return
    if (!canvasDoc) return
    if (hydratedRef.current) return
    const hydrate = async () => {
      isHydratingRef.current = true
      try {
        const raw = canvasDoc.snapshot as string | undefined
        if (raw) {
          const decompressed = await decompressString(raw)
          const snap = JSON.parse(decompressed)
          loadSnapshot(editor.store, snap, { forceOverwriteSessionState: true })
          // Set lastSavedHash so first interval doesn't force an identical write
          lastSavedHashRef.current = hashString(decompressed)
          console.log(debugPrefix, 'Hydrated editor from CanvasDoc', {
            id: canvasDoc.$jazz.id,
            compressedBytes: raw.length,
            decompressedBytes: decompressed.length
          })
          hydratedRef.current = true
        }
      } catch (e) {
        console.warn(debugPrefix, 'hydrate error', e)
      } finally {
        isHydratingRef.current = false
      }
    }

    hydrate()
  }, [editor, canvasDoc])

  // Interval autosave every intervalMs, tracking document and session dirtiness
  useEffect(() => {
    if (!editor) return
    if (!canvasDoc) return

    // Subscribe to document changes from user
    if (unsubscribeDocRef.current) {
      unsubscribeDocRef.current()
      unsubscribeDocRef.current = null
    }
    unsubscribeDocRef.current = editor.store.listen(
      () => {
        if (isHydratingRef.current) return
        documentDirtyRef.current = true
      },
      { scope: 'document', source: 'user' } as any
    )

    // Subscribe to session-related changes: conservatively mark session dirty on any user-origin change
    if (unsubscribeAllRef.current) {
      unsubscribeAllRef.current()
      unsubscribeAllRef.current = null
    }
    unsubscribeAllRef.current = editor.store.listen(
      () => {
        if (isHydratingRef.current) return
        sessionDirtyRef.current = true
      },
      { scope: 'all', source: 'user' } as any
    )

    const flush = async () => {
      if (!canWrite) return
      if (isHydratingRef.current) return
      if (!documentDirtyRef.current && !sessionDirtyRef.current) return
      try {
        const snapshotObj = getSnapshot(editor.store)
        // Persist full session + document as requested
        const stringified = JSON.stringify(snapshotObj)
        const compressed = await compressString(stringified)
        const currentHash = hashString(stringified)
        if (currentHash !== lastSavedHashRef.current) {
          canvasDoc.$jazz.set('snapshot', compressed)
          const isCompressed = compressed.startsWith(COMPRESSION_PREFIX)
          console.log(debugPrefix, 'Saved snapshot', {
            originalBytes: stringified.length,
            storedBytes: compressed.length,
            compressed: isCompressed,
            ratio: isCompressed ? (compressed.length / stringified.length).toFixed(2) : '1.0'
          })
          lastSavedHashRef.current = currentHash
        }
        documentDirtyRef.current = false
        sessionDirtyRef.current = false
      } catch (e) {
        console.warn(debugPrefix, 'interval save error', e)
      }
    }

    // Start interval
    if (saveIntervalRef.current) window.clearInterval(saveIntervalRef.current)
    saveIntervalRef.current = window.setInterval(() => {
      void flush()
    }, intervalMs)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void flush()
      }
    }
    const onPageHide = () => {
      void flush()
    }
    window.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)

    return () => {
      if (saveIntervalRef.current) window.clearInterval(saveIntervalRef.current)
      saveIntervalRef.current = null
      if (unsubscribeDocRef.current) {
        unsubscribeDocRef.current()
        unsubscribeDocRef.current = null
      }
      if (unsubscribeAllRef.current) {
        unsubscribeAllRef.current()
        unsubscribeAllRef.current = null
      }
      window.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [editor, canvasDoc, canWrite, intervalMs])

  const combined: CanvasPersistenceState = { ...(state as LoadingState), canvasDoc }
  return combined
}


