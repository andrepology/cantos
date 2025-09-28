export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    console.log('isInteractiveTarget: target is not an Element:', target)
    return false
  }

  const tag = target.tagName
  const element = target as HTMLElement
  const dataInteractive = element.getAttribute('data-interactive')
  const closestInteractive = element.closest('[data-interactive]')

  console.log('isInteractiveTarget check:', {
    tag,
    dataInteractive,
    closestInteractive: closestInteractive?.getAttribute('data-interactive'),
    isInputLike: tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A' || tag === 'LABEL',
    isContentEditable: element.isContentEditable,
    hasClosestInteractive: !!closestInteractive
  })

  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A' || tag === 'LABEL') {
    console.log('isInteractiveTarget: true (input-like element)')
    return true
  }
  if (element.isContentEditable) {
    console.log('isInteractiveTarget: true (contentEditable)')
    return true
  }
  if (closestInteractive) {
    console.log('isInteractiveTarget: true (has data-interactive ancestor)')
    return true
  }

  console.log('isInteractiveTarget: false')
  return false
}


