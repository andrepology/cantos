import { LABEL_FONT_FAMILY } from '../../arena/constants'

export function getCaretPositionFromClick(
  text: string,
  clickX: number,
  fontSize: number,
  fontFamily: string = LABEL_FONT_FAMILY
): number {
  if (!text) return 0
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return text.length

  ctx.font = `${fontSize}px ${fontFamily}`
  let cumulativeWidth = 0
  for (let i = 0; i <= text.length; i++) {
    const charWidth = i < text.length ? ctx.measureText(text[i]).width : 0
    const charCenter = cumulativeWidth + charWidth / 2
    if (clickX <= charCenter) {
      return i
    }
    cumulativeWidth += charWidth
    if (i === text.length - 1) {
      return text.length
    }
  }
  return text.length
}

