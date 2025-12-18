import { useCallback } from 'react'
import { useEditor, type Editor } from 'tldraw'

/**
 * Converts screen coordinates (clientX, clientY) to tldraw page coordinates.
 * Handles different tldraw version API names and provides a fallback to viewport center.
 */
export function screenToPagePoint(editor: Editor, clientX: number, clientY: number) {
  const anyEditor = editor as any
  return (
    anyEditor?.screenToPage?.({ x: clientX, y: clientY }) ||
    anyEditor?.viewportScreenToPage?.({ x: clientX, y: clientY }) ||
    { x: editor.getViewportPageBounds().midX, y: editor.getViewportPageBounds().midY }
  )
}

/**
 * Hook that returns a memoized function to convert screen coordinates to page coordinates.
 */
export function useScreenToPagePoint() {
  const editor = useEditor()
  return useCallback(
    (clientX: number, clientY: number) => screenToPagePoint(editor, clientX, clientY),
    [editor]
  )
}
