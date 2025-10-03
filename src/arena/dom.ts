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
    if (closestInteractiveAttr === 'search') {
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


