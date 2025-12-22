import { useEffect, useRef, useState } from 'react'
import type { Editor } from 'tldraw'
import { loadSnapshot } from 'tldraw'
import { useAccount } from 'jazz-tools/react'
import { co } from 'jazz-tools'
import { Account, CanvasDoc, Root } from './schema'

// Compression utilities for large payloads
const COMPRESSION_THRESHOLD = 10 * 1024 // 10KB
const COMPRESSION_PREFIX = 'gz:' // Prefix to indicate compressed data

const LOG_COMPRESSION_STATS = true

function logCompression(label: string, originalLength: number, compressedLength: number) {
  if (!LOG_COMPRESSION_STATS) return
  const delta = originalLength - compressedLength
  const percent = originalLength > 0 ? (delta / originalLength) * 100 : 0
  const origKb = (originalLength / 1024).toFixed(1)
  const compKb = (compressedLength / 1024).toFixed(1)
  const sign = delta >= 0 ? 'saved' : 'grew'
  const absPercent = Math.abs(percent).toFixed(1)
  console.debug(`[canvas] compression ${label}: ${origKb}KB -> ${compKb}KB (${absPercent}% ${sign})`)
}

async function compressString(str: string, label = 'snapshot'): Promise<string> {
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
    const result = COMPRESSION_PREFIX + base64
    logCompression(label, str.length, result.length)
    return result
  } catch (e) {
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
export type CanvasPersistenceState = LoadingState & {
  canvasDoc: CanvasDocInstance | null
  isNewDoc: boolean
  hydrated: boolean
}

type AccountInstance = co.loaded<typeof Account>
type RootInstance = co.loaded<typeof Root>
type CanvasDocInstance = co.loaded<typeof CanvasDoc>

export function useCanvasPersistence(editor: Editor | null, key: string, intervalMs = 4000) { // Debounced save delay
  const [state, setState] = useState<LoadingState>({ status: 'loading' })
  const me = useAccount(Account, { resolve: { root: { canvases: { $each: true } } } })
  const [canvasDoc, setCanvasDoc] = useState<CanvasDocInstance | null>(null)
  const [isNewDoc, setIsNewDoc] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const canWrite = Boolean(me.$isLoaded && canvasDoc && (me as unknown as { canWrite?: (cv: CanvasDocInstance) => boolean }).canWrite?.(canvasDoc))
  const isHydratingRef = useRef(false)
  const documentDirtyRef = useRef(false)
  const cameraDirtyRef = useRef(false)
  const saveInFlightRef = useRef(false)
  const pendingSaveRef = useRef(false)
  const saveTimeoutRef = useRef<number | null>(null)
  const lastSavedHashRef = useRef<string | null>(null)



  // Reset state when the persistence key or editor changes
  useEffect(() => {
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = null
    isHydratingRef.current = false
    documentDirtyRef.current = false
    cameraDirtyRef.current = false
    saveInFlightRef.current = false
    pendingSaveRef.current = false
    lastSavedHashRef.current = null
    setIsNewDoc(false)
    setHydrated(false)
    setCanvasDoc(null)
    setState({ status: 'loading' })
  }, [key, editor])

  useEffect(() => {
    if (!me.$isLoaded) return // loading / unauthorized / unavailable
    if (!editor) return // wait for editor before snapshotting/creating
    if (canvasDoc) return // already ensured

    async function ensureDoc() {
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
        const match = canvases.find((c) => c.key === key)
        if (match) {
          setCanvasDoc(match)
          setState({ status: 'ready', docId: match.$jazz.id })
          // Loaded existing CanvasDoc - no logging
          setIsNewDoc(false)
          return
        }

        const initialSnapshot = JSON.stringify(ed.store.getStoreSnapshot('document'))
        const compressedInitialSnapshot = await compressString(initialSnapshot, 'initial snapshot')
        const owner = account.$jazz.owner
        const cam = ed.getCamera()
        const created = CanvasDoc.create(
          {
            key,
            snapshot: compressedInitialSnapshot,
            title: key,
            cameraX: cam.x,
            cameraY: cam.y,
            cameraZ: cam.z,
          },
          owner
        )
        ;(root.canvases as unknown as { $jazz: { push: (item: CanvasDocInstance) => void } }).$jazz.push(
          created as unknown as CanvasDocInstance,
        )
        setCanvasDoc(created as unknown as CanvasDocInstance)
        setState({ status: 'ready', docId: created.$jazz.id })
        setIsNewDoc(true)
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        setState({ status: 'error', error: message })
        console.error('ensureDoc error', e)
      }
    }

    ensureDoc()
  }, [me, key, editor, canvasDoc])

  // Hydrate TLDraw from snapshot when the subscribed doc is available
  useEffect(() => {
    if (!editor) return
    if (!canvasDoc) return
    if (hydrated) return
    const hydrate = async () => {
      isHydratingRef.current = true
      try {
        const raw = canvasDoc.snapshot as string | undefined
        if (raw) {
          const decompressed = await decompressString(raw)
          const snap = JSON.parse(decompressed)
          loadSnapshot(editor.store, snap, { forceOverwriteSessionState: true })
          const loadedCamera = {
            x: canvasDoc.cameraX ?? editor.getCamera().x,
            y: canvasDoc.cameraY ?? editor.getCamera().y,
            z: canvasDoc.cameraZ ?? editor.getCamera().z,
          }
          // Set lastSavedHash so first save doesn't force an identical write
          lastSavedHashRef.current = hashString(decompressed)
          setHydrated(true)
          cameraDirtyRef.current = false
          // Re-apply camera state after SlideEditor initialization (next tick)
          setTimeout(() => {
            editor.setCamera(loadedCamera)
          }, 0)
        } else {
          setHydrated(true)
        }
      } catch (e) {
        // hydrate error
      } finally {
        isHydratingRef.current = false
      }
    }

    hydrate()
  }, [editor, canvasDoc, hydrated])

  // Debounced autosave on changes, plus visibility/pagehide flush
  useEffect(() => {
    if (!editor) return
    if (!canvasDoc) return

    function hasCameraChanges(changes: {
      added?: Record<string, { typeName?: string }>
      updated?: Record<string, [unknown, { typeName?: string }]>
      removed?: Record<string, { typeName?: string }>
    }) {
      if (changes.added) {
        for (const record of Object.values(changes.added)) {
          if (record?.typeName === 'camera') return true
        }
      }
      if (changes.updated) {
        for (const pair of Object.values(changes.updated)) {
          const next = pair?.[1]
          if (next?.typeName === 'camera') return true
        }
      }
      if (changes.removed) {
        for (const record of Object.values(changes.removed)) {
          if (record?.typeName === 'camera') return true
        }
      }
      return false
    }

    function scheduleFlush() {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = window.setTimeout(() => {
        void flush()
      }, intervalMs)
    }

    async function flush() {
      if (!canWrite) return
      if (isHydratingRef.current) return
      if (saveInFlightRef.current) {
        pendingSaveRef.current = true
        return
      }
      if (!documentDirtyRef.current && !cameraDirtyRef.current) return
      if (!canvasDoc) return
      saveInFlightRef.current = true
      try {
        if (documentDirtyRef.current && editor) {
          const snapshotObj = editor.store.getStoreSnapshot('document')
          const stringified = JSON.stringify(snapshotObj)
          const compressed = await compressString(stringified, 'autosave snapshot')
          const currentHash = hashString(stringified)
          if (currentHash !== lastSavedHashRef.current) {
            canvasDoc.$jazz.set('snapshot', compressed)
            lastSavedHashRef.current = currentHash
          }
          documentDirtyRef.current = false
        }
        if (cameraDirtyRef.current && editor) {
          const cam = editor.getCamera()
          canvasDoc.$jazz.set('cameraX', cam.x)
          canvasDoc.$jazz.set('cameraY', cam.y)
          canvasDoc.$jazz.set('cameraZ', cam.z)
          cameraDirtyRef.current = false
        }
      } catch (e) {
        // save error
      } finally {
        saveInFlightRef.current = false
        if (pendingSaveRef.current) {
          pendingSaveRef.current = false
          scheduleFlush()
        }
      }
    }

    const unsubscribeDoc = editor.store.listen(
      () => {
        if (isHydratingRef.current) return
        documentDirtyRef.current = true
        scheduleFlush()
      },
      { scope: 'document', source: 'user' } as any
    )

    const unsubscribeSession = editor.store.listen(
      (entry) => {
        if (isHydratingRef.current) return
        const changes = entry.changes as {
          added?: Record<string, { typeName?: string }>
          updated?: Record<string, [unknown, { typeName?: string }]>
          removed?: Record<string, { typeName?: string }>
        }
        if (hasCameraChanges(changes)) {
          cameraDirtyRef.current = true
          scheduleFlush()
        }
      },
      { scope: 'session', source: 'user' } as any
    )

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
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
      unsubscribeDoc()
      unsubscribeSession()
      window.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [editor, canvasDoc, canWrite, intervalMs])

  const combined: CanvasPersistenceState = { ...(state as LoadingState), canvasDoc, isNewDoc, hydrated }
  return combined
}
