/**
 * Aspect measurement utilities for Arena blocks.
 * 
 * Measures image aspect ratios during sync (before Jazz write),
 * so the UI never sees unmeasured blocks. This eliminates reflow.
 * 
 * Key principle: measure once during fetch, store in Jazz forever.
 */

// Types for blocks that may need measurement
export type MeasurableBlock = {
  blockId: string
  type: 'image' | 'media' | 'link' | 'pdf' | 'text' | 'channel'
  thumbUrl?: string
  displayUrl?: string
  embedWidth?: number
  embedHeight?: number
  aspect?: number
  aspectSource?: 'measured'
}

export type MeasuredBlock<T extends MeasurableBlock = MeasurableBlock> = T & {
  aspect: number
  aspectSource: 'measured'
}

// Constants
const MEASUREMENT_TIMEOUT_MS = 8000
const DEFAULT_ASPECT = 1 // Square fallback for unmeasurable blocks
const SKIP_MEASUREMENT = true // DEBUG: set to false to enable actual measurement

/**
 * Measure aspect ratio from an image URL.
 * Uses Image() element - works cross-origin without CORS.
 * Returns null on failure or timeout.
 */
export function measureImageAspect(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const img = new Image()
    
    const timeout = setTimeout(() => {
      img.onload = null
      img.onerror = null
      resolve(null)
    }, MEASUREMENT_TIMEOUT_MS)
    
    img.onload = () => {
      clearTimeout(timeout)
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve(img.naturalWidth / img.naturalHeight)
      } else {
        resolve(null)
      }
    }
    
    img.onerror = () => {
      clearTimeout(timeout)
      resolve(null)
    }
    
    img.src = url
  })
}

/**
 * Get the best URL for aspect measurement.
 * Prefers thumb (smallest/fastest), falls back to display.
 */
export function getMeasurementUrl(block: MeasurableBlock): string | null {
  return block.thumbUrl ?? block.displayUrl ?? null
}

/**
 * Check if block type requires aspect measurement.
 */
export function needsAspectMeasurement(type: string): boolean {
  return ['image', 'media', 'link', 'pdf'].includes(type)
}

/**
 * Check if block already has a measured aspect.
 */
export function hasMeasuredAspect(block: MeasurableBlock): boolean {
  return (
    block.aspectSource === 'measured' &&
    typeof block.aspect === 'number' &&
    Number.isFinite(block.aspect) &&
    block.aspect > 0
  )
}

/**
 * Extract aspect from embed dimensions (for media blocks).
 * Returns null if dimensions not available.
 */
export function getEmbedAspect(block: MeasurableBlock): number | null {
  if (
    block.embedWidth &&
    block.embedHeight &&
    block.embedWidth > 0 &&
    block.embedHeight > 0
  ) {
    return block.embedWidth / block.embedHeight
  }
  return null
}

/**
 * Measure aspect for a single block.
 * 
 * Resolution order:
 * 1. Already measured → return existing
 * 2. Has embed dimensions (media) → use those (no network)
 * 3. Has image URL → measure from thumbnail
 * 4. Fallback → 1:1 square
 */
export async function measureBlockAspect<T extends MeasurableBlock>(
  block: T,
  existingAspect?: { aspect?: number; aspectSource?: string }
): Promise<MeasuredBlock<T>> {
  // 1. Already measured in Jazz?
  if (existingAspect?.aspectSource === 'measured' && existingAspect.aspect) {
    return {
      ...block,
      aspect: existingAspect.aspect,
      aspectSource: 'measured',
    }
  }

  // 2. Doesn't need measurement (text, channel)?
  if (!needsAspectMeasurement(block.type)) {
    return {
      ...block,
      aspect: DEFAULT_ASPECT,
      aspectSource: 'measured',
    }
  }

  // 3. Has embed dimensions (media)?
  const embedAspect = getEmbedAspect(block)
  if (embedAspect !== null) {
    return {
      ...block,
      aspect: embedAspect,
      aspectSource: 'measured',
    }
  }

  // 4. Measure from image URL
  const url = getMeasurementUrl(block)
  if (url) {
    const measured = await measureImageAspect(url)
    if (measured !== null) {
      return {
        ...block,
        aspect: measured,
        aspectSource: 'measured',
      }
    }
  }

  // 5. Fallback to square
  return {
    ...block,
    aspect: DEFAULT_ASPECT,
    aspectSource: 'measured',
  }
}

/**
 * Measure aspects for a batch of blocks in parallel.
 * Respects existing measurements to avoid redundant work.
 * 
 * NOTE: Due to Jazz IndexedDB timing issues, existingBlocks is often empty
 * on page reload. See ASPECT_CACHE_DIAGNOSIS.md for solutions.
 */
export async function measureBlockAspects<T extends MeasurableBlock>(
  blocks: T[],
  existingBlocks?: Map<string, { aspect?: number; aspectSource?: string }>
): Promise<MeasuredBlock<T>[]> {
  const timer = `measure-batch-${blocks.length}-blocks`
  console.time(timer)

  // DEBUG: Skip actual measurement
  if (SKIP_MEASUREMENT) {
    const result = blocks.map(block => ({
      ...block,
      aspect: DEFAULT_ASPECT,
      aspectSource: 'measured' as const,
    }))
    console.timeEnd(timer)
    return result
  }

  const needsMeasurement = blocks.filter(b => needsAspectMeasurement(b.type)).length
  const alreadyMeasured = blocks.filter(b => {
    const existing = existingBlocks?.get(b.blockId)
    return existing?.aspectSource === 'measured' && existing.aspect
  }).length
  
  if (needsMeasurement > 0) {
    console.log(`[measureBlockAspects] Batch of ${blocks.length}. Needs measurement: ${needsMeasurement}. Cache hits: ${alreadyMeasured}. Real fetches: ${needsMeasurement - alreadyMeasured}`)
  }

  const result = await Promise.all(
    blocks.map(async (block) => {
      const existing = existingBlocks?.get(block.blockId)
      if (existing?.aspectSource === 'measured' && existing.aspect) {
        return { ...block, aspect: existing.aspect, aspectSource: 'measured' as const }
      }
      return measureBlockAspect(block, existing)
    })
  )

  console.timeEnd(timer)
  return result
}