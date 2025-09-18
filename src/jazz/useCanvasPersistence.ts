import { useEffect, useRef, useState } from 'react'
import type { Editor } from 'tldraw'
import { getSnapshot, loadSnapshot } from 'tldraw'
import { useAccount } from 'jazz-tools/react'
import { co } from 'jazz-tools'
import { Account, CanvasDoc, Root } from './schema'

type LoadingState = { status: 'loading' } | { status: 'ready'; docId: string } | { status: 'error'; error: string }
export type CanvasPersistenceState = LoadingState & { canvasDoc: CanvasDocInstance | null }

type AccountInstance = co.loaded<typeof Account>
type RootInstance = co.loaded<typeof Root>
type CanvasDocInstance = co.loaded<typeof CanvasDoc>

export function useCanvasPersistence(editor: Editor | null, key: string, intervalMs = 2000) {
  const [state, setState] = useState<LoadingState>({ status: 'loading' })
  const { me } = useAccount(Account, { resolve: { root: { canvases: { $each: true } } } })
  const [canvasDoc, setCanvasDoc] = useState<CanvasDocInstance | null>(null)
  const debugPrefix = '[JazzPersistence]'
  const canWrite = Boolean(me && canvasDoc && (me as unknown as { canWrite?: (cv: CanvasDocInstance) => boolean }).canWrite?.(canvasDoc))
  const initedRef = useRef(false)
  const hydratedRef = useRef(false)
  const saveTimeoutRef = useRef<number | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  // Reset guards / subscriptions when the persistence key or editor changes
  useEffect(() => {
    // clear any pending debounce
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = null
    // unsubscribe from any previous editor store listener
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }
    // reset local flags so we can re-hydrate for new key/editor
    initedRef.current = false
    hydratedRef.current = false
    setCanvasDoc(null)
  }, [key, editor])

  useEffect(() => {
    if (me === undefined) return // loading
    if (me === null) return // not signed in
    if (!editor) return // wait for editor before snapshotting/creating
    if (initedRef.current) return // already ensured

    async function ensureDoc() {
      const ed = editor
      if (!ed) return
      try {
        const account = me as AccountInstance
        // After resolve, if there's still no root, initialize it once
        if (account.root === null) {
          account.$jazz.set('root', Root.create({ canvases: co.list(CanvasDoc).create([]) }))
          console.log(debugPrefix, 'Initialized account.root as Root with empty canvases')
        }
        const root = account.root as RootInstance
        if (!root) return
        const canvases = root.canvases as ReadonlyArray<CanvasDocInstance>
        console.log(debugPrefix, 'Root canvases', { count: canvases.length, keys: canvases.map(c => c.key) })
        const match = canvases.find((c) => c.key === key)
        if (match) {
          setCanvasDoc(match)
          setState({ status: 'ready', docId: match.$jazz.id })
          console.log(debugPrefix, 'Loaded existing CanvasDoc', { key, id: match.$jazz.id })
          initedRef.current = true
          try { window.localStorage.setItem(`jazz:canvas:${key}`, match.$jazz.id) } catch {}
          return
        }

        // Fallback: if list link is missing, try recovering by stored id
        try {
          const storedId = window.localStorage.getItem(`jazz:canvas:${key}`)
          if (storedId) {
            const recovered = await CanvasDoc.load(storedId)
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

        const snapshot = JSON.stringify(getSnapshot(ed.store))
        const owner = account.$jazz.owner
        const created = CanvasDoc.create({ key, snapshot, title: key }, owner)
        ;(root.canvases as unknown as { $jazz: { push: (item: CanvasDocInstance) => void } }).$jazz.push(
          created as unknown as CanvasDocInstance,
        )
        setCanvasDoc(created as unknown as CanvasDocInstance)
        setState({ status: 'ready', docId: created.$jazz.id })
        console.log(debugPrefix, 'Created CanvasDoc', { key, id: created.$jazz.id, bytes: snapshot.length })
        initedRef.current = true
        try { window.localStorage.setItem(`jazz:canvas:${key}`, created.$jazz.id) } catch {}
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        setState({ status: 'error', error: message })
        console.error(debugPrefix, 'ensureDoc error', e)
      }
    }

    ensureDoc()
  }, [me, key, editor])

  // Hydrate TLDraw from snapshot when the subscribed doc is available
  useEffect(() => {
    if (!editor) return
    if (!canvasDoc) return
    if (hydratedRef.current) return
    try {
      const raw = canvasDoc.snapshot as string | undefined
      if (raw) {
        const snap = JSON.parse(raw)
        loadSnapshot(editor.store, snap)
        console.log(debugPrefix, 'Hydrated editor from CanvasDoc', { id: canvasDoc.$jazz.id, bytes: raw.length })
        hydratedRef.current = true
      }
    } catch (e) {
      console.warn(debugPrefix, 'hydrate error', e)
    }
  }, [editor, canvasDoc])

  // Debounced autosave after inactivity
  useEffect(() => {
    if (!editor) return
    if (!canvasDoc) return

    const scheduleSave = () => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = window.setTimeout(() => {
        if (!canWrite) return
        try {
          const snapshot = JSON.stringify(getSnapshot(editor.store))
          const prev = (canvasDoc.snapshot ?? '') as string
          if (snapshot !== prev) {
            canvasDoc.$jazz.set('snapshot', snapshot)
            console.log(debugPrefix, 'Autosaved CanvasDoc', { id: canvasDoc.$jazz.id, bytes: snapshot.length })
          }
        } catch (e) {
          console.warn(debugPrefix, 'autosave error', e)
        }
      }, 100) // Very short debounce to batch rapid changes
    }

    // (Re)subscribe on dependency change so closure captures latest values
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }
    unsubscribeRef.current = editor.store.listen(() => {
      scheduleSave()
    })

    return () => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
    }
  }, [editor, canvasDoc, canWrite, intervalMs])

  const combined: CanvasPersistenceState = { ...(state as LoadingState), canvasDoc }
  return combined
}


