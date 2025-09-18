export type LayoutMode = 'auto' | 'stack' | 'row' | 'column'

export type LayoutTarget = {
  x: number
  y: number
  width: number
  height: number
  z: number
  visible: boolean
}

export const ROW_ENTER = 1.6
export const ROW_EXIT = 1.45
export const COL_ENTER = 0.625
export const COL_EXIT = 0.69

export function autodetectMode(viewportW: number, viewportH: number): Exclude<LayoutMode, 'auto'> {
  const ar = viewportW / Math.max(1, viewportH)
  if (ar >= ROW_ENTER) return 'row'
  if (ar <= COL_ENTER) return 'column'
  return 'stack'
}

export function computeCardSize(viewportW: number, viewportH: number) {
  const cardW = Math.min(320, Math.max(60, Math.min(viewportW, viewportH) * 0.9))
  const cardH = cardW
  return { cardW, cardH }
}

export function computeLayoutTargets(args: {
  mode: Exclude<LayoutMode, 'auto'>
  viewportW: number
  viewportH: number
  count: number
  gap: number
  cardW: number
  cardH: number
  currentIndex: number
  scrollOffset: number
}) {
  const { mode, viewportW: vw, viewportH: vh, count, gap, cardW, cardH, currentIndex, scrollOffset } = args
  const targets: LayoutTarget[] = []

  if (count <= 0) return targets

  if (mode === 'stack') {
    const depth = 6
    const base = Math.max(0, Math.min(count - 1, currentIndex))
    for (let i = 0; i < count; i++) {
      const d = i - base
      const visible = d >= 0 && d <= depth
      const z = visible ? 1000 - d : 0
      const y = -d * 2
      const x = 0
      targets.push({ x: vw / 2 - cardW / 2 + x, y: vh / 2 - cardH / 2 + y, width: cardW, height: cardH, z, visible })
    }
    return targets
  }

  if (mode === 'row') {
    let x = (vw - cardW) / 2
    for (let i = 0; i < count; i++) {
      const left = x - scrollOffset
      const visible = left + cardW > 0 && left < vw
      targets.push({ x: left, y: (vh - cardH) / 2, width: cardW, height: cardH, z: 1, visible })
      x += cardW + (i < count - 1 ? gap : 0)
    }
    return targets
  }

  // column
  let y = (vh - cardH) / 2
  for (let i = 0; i < count; i++) {
    const top = y - scrollOffset
    const visible = top + cardH > 0 && top < vh
    targets.push({ x: (vw - cardW) / 2, y: top, width: cardW, height: cardH, z: 1, visible })
    y += cardH + (i < count - 1 ? gap : 0)
  }
  return targets
}


