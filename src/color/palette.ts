import { FastAverageColor } from 'fast-average-color'

export type GeneratedPalette = {
  background: string
  color: string
  alternative: string
  accents: string[]
}

export type ExtractOptions = {
  algorithm?: 'simple' | 'sqrt' | 'dominant'
  ignoreWhite?: boolean
  textContrastRatio?: number // Target contrast for text (default: 3.5, lower = subtle, higher = accessible)
  textSaturation?: number // Saturation for text color (default: 0.6, 0-1 scale)
  hueShift?: number // Degrees to shift text hue from background (default: 25, ±1-60°)
}

// --- Minimal color helpers (RGB/hex, luminance, contrast, lightness adjust) ---

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function hexToRgb(hex: string): [number, number, number] {
  const s = hex.replace('#', '')
  const v = s.length === 3
    ? s.split('').map((c) => parseInt(c + c, 16))
    : [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
  return v as [number, number, number]
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (x: number) => x.toString(16).padStart(2, '0')
  return `#${toHex(clamp(Math.round(r), 0, 255))}${toHex(clamp(Math.round(g), 0, 255))}${toHex(clamp(Math.round(b), 0, 255))}`
}

// Relative luminance per WCAG
function srgbToLinear(c: number): number {
  const cs = c / 255
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4)
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const R = srgbToLinear(r)
  const G = srgbToLinear(g)
  const B = srgbToLinear(b)
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

function contrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const L1 = relativeLuminance(rgb1)
  const L2 = relativeLuminance(rgb2)
  const lighter = Math.max(L1, L2)
  const darker = Math.min(L1, L2)
  return (lighter + 0.05) / (darker + 0.05)
}

// Very small and pragmatic HSL lightness adjustment for text candidates
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }
  return [h * 360, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const C = (1 - Math.abs(2 * l - 1)) * s
  const Hp = (h % 360) / 60
  const X = C * (1 - Math.abs((Hp % 2) - 1))
  let r1 = 0, g1 = 0, b1 = 0
  if (0 <= Hp && Hp < 1) { r1 = C; g1 = X; b1 = 0 }
  else if (1 <= Hp && Hp < 2) { r1 = X; g1 = C; b1 = 0 }
  else if (2 <= Hp && Hp < 3) { r1 = 0; g1 = C; b1 = X }
  else if (3 <= Hp && Hp < 4) { r1 = 0; g1 = X; b1 = C }
  else if (4 <= Hp && Hp < 5) { r1 = X; g1 = 0; b1 = C }
  else { r1 = C; g1 = 0; b1 = X }
  const m = l - C / 2
  return [
    clamp(Math.round((r1 + m) * 255), 0, 255),
    clamp(Math.round((g1 + m) * 255), 0, 255),
    clamp(Math.round((b1 + m) * 255), 0, 255),
  ]
}

function adjustLightnessToMeetContrast(candidate: [number, number, number], background: [number, number, number], target: number): [number, number, number] {
  // Binary search on HSL lightness to hit target contrast, preserving hue & saturation
  let [h, s, l] = rgbToHsl(candidate[0], candidate[1], candidate[2])
  
  const bgLum = relativeLuminance(background)
  
  // Determine if we should go darker or lighter than background
  // For light backgrounds, we need to go darker for contrast
  let lo = 0, hi = 1
  
  // Check which direction gives us contrast
  const darkRgb = hslToRgb(h, s, 0.1)
  const lightRgb = hslToRgb(h, s, 0.9)
  const darkContrast = contrastRatio(darkRgb, background)
  const lightContrast = contrastRatio(lightRgb, background)
  
  // Prefer the direction that can achieve higher contrast
  if (darkContrast > lightContrast) {
    hi = 0.5 // Search darker range
  } else {
    lo = 0.5 // Search lighter range
  }
  
  let best = candidate
  let bestRatio = contrastRatio(candidate, background)
  let bestDistance = Math.abs(bestRatio - target)
  
  // Binary search for exact target
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    const rgbTry = hslToRgb(h, s, mid)
    const ratio = contrastRatio(rgbTry, background)
    const distance = Math.abs(ratio - target)
    
    // Track closest to target
    if (distance < bestDistance || (distance === bestDistance && ratio >= target)) {
      best = rgbTry
      bestRatio = ratio
      bestDistance = distance
    }
    
    // Adjust search range
    if (ratio < target) {
      // Need more contrast - move away from background luminance
      const candLum = relativeLuminance(rgbTry)
      if (candLum > bgLum) {
        hi = mid // Go darker
      } else {
        lo = mid // Go lighter
      }
    } else {
      // Have enough contrast - can move closer to background
      const candLum = relativeLuminance(rgbTry)
      if (candLum > bgLum) {
        lo = mid // Get lighter (closer to bg)
      } else {
        hi = mid // Get darker (closer to bg)
      }
    }
  }
  
  return best
}

function channelRange([r, g, b]: [number, number, number]): number {
  const maxc = Math.max(r, g, b)
  const minc = Math.min(r, g, b)
  return (maxc - minc) / 255
}

function ensureHex(s: string): string {
  return s.startsWith('#') ? s : rgbToHex(...hexToRgb(s))
}

// --- Main API ---

export async function extractPaletteFromImage(url: string, opts: ExtractOptions = {}): Promise<GeneratedPalette> {
  const fac = new FastAverageColor()
  try {
    // If URL is cross-origin, prefer using local proxy during dev/preview/prod
    const useProxy = typeof window !== 'undefined' && /^https?:\/\//.test(url) && !url.startsWith(location.origin)
    const proxied = useProxy ? `/api/proxy-image?url=${encodeURIComponent(url)}` : url
    const result = await fac.getColorAsync(proxied, {
      algorithm: opts.algorithm ?? 'sqrt',
      ignoreWhite: opts.ignoreWhite ?? true,
      mode: 'precision',
      crossOrigin: 'anonymous',
      silent: true,
    } as any)

    // Extract options with defaults
    const textContrastRatio = opts.textContrastRatio ?? 1.0
    const textSaturation = clamp(opts.textSaturation ?? 0.10, 0, 1)
    const hueShift = clamp(opts.hueShift ?? 0, 0, 60)

    let bgRgb = hexToRgb(ensureHex(result.hex))

    // Ensure high lightness for backgrounds
    const [bgH, bgS, bgL] = rgbToHsl(bgRgb[0], bgRgb[1], bgRgb[2])
    const minLightness = 0.5 // Very light backgrounds
    if (bgL < minLightness) {
      bgRgb = hslToRgb(bgH, bgS, minLightness)
    }
    const backgroundHex = rgbToHex(bgRgb[0], bgRgb[1], bgRgb[2])

    // --- Text Color: Hue-shifted with saturation ---
    // Shift hue and boost saturation for chromatic text
    const textHue = (bgH + hueShift) % 360
    const textSatBase = hslToRgb(textHue, textSaturation, 0.6) // Start at mid-lightness
    const textRgb = adjustLightnessToMeetContrast(textSatBase, bgRgb, textContrastRatio)
    const colorHex = rgbToHex(textRgb[0], textRgb[1], textRgb[2])

    // --- Alternative: Hue-shifted in opposite direction ---
    const altHue = (bgH - hueShift + 360) % 360
    const altSatBase = hslToRgb(altHue, textSaturation * 0.85, 0.5) // Slightly less saturated
    const altRgb = adjustLightnessToMeetContrast(altSatBase, bgRgb, textContrastRatio * 0.85)
    const alternativeHex = rgbToHex(altRgb[0], altRgb[1], altRgb[2])

    // --- Accents: Analogous harmony with varied saturation ---
    // Create harmonious accents using analogous relationships (gentle hue shifts)
    const accentHues = [
      (bgH + 45) % 360,  // Warmer analogous
      (bgH - 45 + 360) % 360,  // Cooler analogous
      (bgH + 160) % 360, // Gentle complementary (not exactly opposite)
    ]
    
    const accents: string[] = []
    for (let i = 0; i < accentHues.length; i++) {
      const h = accentHues[i]
      // Vary saturation for visual interest while maintaining harmony
      const sat = clamp(0.5 + (i * 0.15), 0.5, 0.8)
      const baseRgb = hslToRgb(h, sat, 0.5)
      const accentRgb = adjustLightnessToMeetContrast(baseRgb, bgRgb, 3.0) // Minimum readability
      accents.push(rgbToHex(accentRgb[0], accentRgb[1], accentRgb[2]))
    }

    return {
      background: backgroundHex,
      color: colorHex,
      alternative: alternativeHex,
      accents,
    }
  } catch (e) {
    // Fallback palette
    return {
      background: '#ffffff',
      color: '#111111',
      alternative: '#6b7280',
      accents: ['#2563eb'],
    }
  } finally {
    fac.destroy()
  }
}

// Global cache for color extraction to prevent repeated processing
// Similar pattern to useAspectRatioCache
const colorCache = new Map<string, { color: string; timestamp: number }>()
const inFlightColorRequests = new Set<string>()
const COLOR_CACHE_TTL = 30 * 60 * 1000 // 30 minutes
const COLOR_CACHE_VERSION = 2 // Increment to invalidate old cache

// Simplified version that returns just the average color as hex
// Note: Unlike extractPaletteFromImage, this doesn't use the proxy for external images
// FastAverageColor handles CORS directly with crossOrigin: 'anonymous'
export async function extractAverageColorFromImage(url: string): Promise<string> {
  // Create versioned cache key to invalidate old cached colors
  const cacheKey = `${COLOR_CACHE_VERSION}:${url}`

  // Check cache first
  const cached = colorCache.get(cacheKey)
  const now = Date.now()
  if (cached && (now - cached.timestamp) < COLOR_CACHE_TTL) {
    console.log(`💾 CACHE HIT for ${url}: ${cached.color}`)
    return cached.color
  }

  // Prevent duplicate in-flight requests
  if (inFlightColorRequests.has(url)) {
    console.log(`⏳ Already extracting ${url}, waiting...`)
    // Wait a bit and retry cache (simple polling)
    await new Promise(resolve => setTimeout(resolve, 50))
    const retryCached = colorCache.get(cacheKey)
    if (retryCached && (now - retryCached.timestamp) < COLOR_CACHE_TTL) {
      console.log(`💾 CACHE HIT (after wait) for ${url}: ${retryCached.color}`)
      return retryCached.color
    }
    // If still not cached, proceed (shouldn't happen often)
  }

  console.log(`🎨 Starting extraction for ${url}`)
  inFlightColorRequests.add(url)

  const fac = new FastAverageColor()
  try {
    const result = await fac.getColorAsync(url, {
      algorithm: 'sqrt',
      ignoreWhite: true,
      mode: 'precision',
      crossOrigin: 'anonymous',
      silent: true,
    } as any)

    // Get the raw color
    let color = ensureHex(result.hex)

    // If the color is too light (close to white), make it more saturated
    const rgb = hexToRgb(color)
    const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2])

    // If lightness is too high (>0.85), boost saturation and reduce lightness
    if (l > 0.85) {
      const newRgb = hslToRgb(h, Math.min(s + 0.3, 1), Math.max(l - 0.3, 0.2))
      color = rgbToHex(newRgb[0], newRgb[1], newRgb[2])
      console.log(`🎨 Brightened ${ensureHex(result.hex)} → ${color}`)
    }

    // Cache the result
    colorCache.set(cacheKey, { color, timestamp: now })
    console.log(`✅ SUCCESS extracted color for ${url}: ${color}`)

    // Clean up old entries periodically
    if (colorCache.size > 200) {
      const cutoff = now - COLOR_CACHE_TTL
      let cleaned = 0
      for (const [key, entry] of colorCache.entries()) {
        if (entry.timestamp < cutoff) {
          colorCache.delete(key)
          cleaned++
        }
      }
      if (cleaned > 0) {
        console.log(`🧹 Cleaned ${cleaned} expired cache entries`)
      }
    }

    return color
  } catch (e) {
    // Cache the fallback color to avoid repeated failures
    const fallbackColor = '#f3f4f6'
    colorCache.set(cacheKey, { color: fallbackColor, timestamp: now })
    console.log(`❌ FAILED to extract color for ${url}, using fallback: ${fallbackColor}`)
    return fallbackColor
  } finally {
    fac.destroy()
    inFlightColorRequests.delete(url)
  }
}

export default extractPaletteFromImage


