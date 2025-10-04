export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    // console.log('isInteractiveTarget: target is not an Element:', target)
    return false
  }

  const tag = target.tagName
  const element = target as HTMLElement
  const dataInteractive = element.getAttribute('data-interactive')
  const closestInteractive = element.closest('[data-interactive]')



  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A' || tag === 'LABEL') {
    // console.log('isInteractiveTarget: true (input-like element)')
    return true
  }
  if (element.isContentEditable) {
    // console.log('isInteractiveTarget: true (contentEditable)')
    return true
  }
  if (closestInteractive) {
    // Check if we're in a drag-friendly container (like search interfaces)
    // that should allow dragging on whitespace while keeping inputs interactive
    const closestInteractiveAttr = closestInteractive.getAttribute('data-interactive')
    if (closestInteractiveAttr === 'search' || closestInteractiveAttr === 'text') {
      // Search containers are drag-friendly:
      // - Allow dragging on whitespace
      // - Only inputs themselves are considered interactive
      // console.log('isInteractiveTarget: false (drag-friendly container)')
      return false
    }
    // Other data-interactive containers block dragging
    // console.log('isInteractiveTarget: true (has data-interactive ancestor)')
    return true
  }

  // console.log('isInteractiveTarget: false')
  return false
}

export function isOverTextAtPoint(clientX: number, clientY: number): boolean {
  const doc: any = document
  const range = doc.caretRangeFromPoint?.(clientX, clientY)
  if (range && range.startContainer?.nodeType === Node.TEXT_NODE && range.startContainer.textContent?.trim()) {
    return true
  }
  const pos = doc.caretPositionFromPoint?.(clientX, clientY)
  if (pos && (pos as any).offsetNode?.nodeType === Node.TEXT_NODE && (pos as any).offsetNode.textContent?.trim()) {
    return true
  }
  return false
}

export function shouldDragOnWhitespaceInText(
  target: EventTarget | null,
  clientX: number,
  clientY: number,
  textElement?: HTMLElement | null
): boolean {
  if (isInteractiveTarget(target)) return false
  if (!textElement) return false
  const rect = textElement.getBoundingClientRect()
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
    return false
  }
  const style = getComputedStyle(textElement)
  const padTop = parseFloat(style.paddingTop || '0')
  const padRight = parseFloat(style.paddingRight || '0')
  const padBottom = parseFloat(style.paddingBottom || '0')
  const padLeft = parseFloat(style.paddingLeft || '0')
  const xIn = clientX - rect.left
  const yIn = clientY - rect.top
  const withinLeftPad = xIn <= padLeft
  const withinRightPad = xIn >= rect.width - padRight
  const withinTopPad = yIn <= padTop
  const withinBottomPad = yIn >= rect.height - padBottom
  return withinLeftPad || withinRightPad || withinTopPad || withinBottomPad
}

export function decodeHtmlEntities(input: string | undefined | null): string {
  if (!input) return ''
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(input, 'text/html')
    const text = doc.documentElement.textContent
    return text ?? input
  } catch {
    // Fallback: minimal replacements for common entities
    return String(input)
      .replace(/&nbsp;?/g, '\u00A0')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
  }
}
