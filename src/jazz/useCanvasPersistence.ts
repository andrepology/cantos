import { useEffect, useRef, useState } from 'react'
import type { Editor } from 'tldraw'
import { getSnapshot, loadSnapshot } from 'tldraw'
import { useAccount } from 'jazz-tools/react'
import { co } from 'jazz-tools'
import { Account, CanvasDoc, Root } from './schema'

type LoadingState = { status: 'loading' } | { status: 'ready'; docId: string } | { status: 'error'; error: string }

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
          account.$jazz.set('root', { canvases: [] })
          console.log(debugPrefix, 'Initialized account.root with empty canvases')
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
          return
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
      }, 1000)
    }

    // subscribe once per editor/doc
    if (!unsubscribeRef.current) {
      unsubscribeRef.current = editor.store.listen(() => {
        scheduleSave()
      })
    }

    return () => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
    }
  }, [editor, canvasDoc, canWrite])

  return state
}


