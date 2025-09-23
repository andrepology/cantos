export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A' || tag === 'LABEL') return true
  if ((target as HTMLElement).isContentEditable) return true
  if (target.closest('[data-interactive]')) return true
  return false
}


