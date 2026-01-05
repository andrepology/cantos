import { LABEL_FONT_FAMILY } from '../arena/constants'

/**
 * Singleton canvas context for text measurement to avoid repeated DOM operations.
 */
let measurementContext: CanvasRenderingContext2D | null = null

function getMeasurementContext(): CanvasRenderingContext2D | null {
  if (measurementContext) return measurementContext
  const canvas = document.createElement('canvas')
  measurementContext = canvas.getContext('2d')
  return measurementContext
}

/**
 * Measures the width of a text string with specified font properties.
 */
export function measureTextWidth(
  text: string,
  fontSize: number,
  fontFamily: string,
  fontWeight: string | number = 400
): number {
  if (!text) return 0
  const ctx = getMeasurementContext()
  if (!ctx) return 0

  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`
  return ctx.measureText(text).width
}

/**
 * Calculates caret position based on click coordinates and font settings.
 */
export function getCaretPositionFromClick(
  text: string,
  clickX: number,
  fontSize: number,
  fontFamily: string = LABEL_FONT_FAMILY
): number {
  if (!text) return 0
  const ctx = getMeasurementContext()
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
  }
  return text.length
}

/**
 * Advanced caret calculation that accounts for letter spacing and font weight.
 */
export function getCaretPositionWithSpacing(
  text: string,
  clickX: number,
  fontSize: number,
  fontFamily: string,
  letterSpacingPx: number,
  fontWeight: string | number = 600
): number {
  if (!text) return 0
  const ctx = getMeasurementContext()
  if (!ctx) return text.length

  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`
  let cumulativeWidth = 0

  for (let i = 0; i < text.length; i++) {
    const charWidth = ctx.measureText(text[i]).width + letterSpacingPx
    if (clickX < cumulativeWidth + charWidth / 2) {
      return i
    }
    cumulativeWidth += charWidth
  }

  return text.length
}

/**
 * Calculates caret position by measuring the width of text segments in the DOM.
 */
export function getCaretFromDOMWidth(
  container: HTMLElement,
  text: string,
  clickX: number
): number | null {
  if (!container || !text) return null

  const range = document.createRange()
  const textNode = container.firstChild
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return null

  let bestIndex = 0
  let minDiff = Infinity

  for (let i = 0; i <= text.length; i++) {
    range.setStart(textNode, 0)
    range.setEnd(textNode, i)
    const rect = range.getBoundingClientRect()
    const diff = Math.abs(rect.width - clickX)

    if (diff < minDiff) {
      minDiff = diff
      bestIndex = i
    } else if (diff > minDiff) {
      // Widths are monotonic, so we can stop once diff starts increasing
      break
    }
  }

  return bestIndex
}
