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
const SKIP_MEASUREMENT = false // DEBUG: set to false to enable actual measurement
const LOG_MEASUREMENT_DIAGNOSTICS = true // DEBUG: logs ResourceTiming + per-image timings
const MEASUREMENT_MAX_CONCURRENCY: number | null = 8 // DEBUG: set (e.g. 6/8) to add an app-level queue and compare vs "let browser queue"

type ResourceTimingSnapshot = {
  nextHopProtocol?: string
  transferSize?: number
  encodedBodySize?: number
  decodedBodySize?: number
  duration?: number
  redirectStart?: number
  redirectEnd?: number
  fetchStart?: number
  domainLookupStart?: number
  domainLookupEnd?: number
  connectStart?: number
  connectEnd?: number
  secureConnectionStart?: number
  requestStart?: number
  responseStart?: number
  responseEnd?: number
  startTime?: number
  workerStart?: number
}

type EnvSnapshot = {
  visibilityState?: DocumentVisibilityState
  hasFocus?: boolean
  effectiveType?: string
  rtt?: number
  downlink?: number
  saveData?: boolean
}

function getEnvSnapshot(): EnvSnapshot {
  const navConn = typeof navigator !== 'undefined' ? ((navigator as any).connection as any) : undefined
  return {
    visibilityState: typeof document !== 'undefined' ? document.visibilityState : undefined,
    hasFocus: typeof document !== 'undefined' ? document.hasFocus() : undefined,
    effectiveType: navConn?.effectiveType,
    rtt: navConn?.rtt,
    downlink: navConn?.downlink,
    saveData: navConn?.saveData,
  }
}

function getLatestImgResourceTiming(url: string): ResourceTimingSnapshot | null {
  try {
    const entries = performance.getEntriesByName(url).filter((e) => {
      const rt = e as PerformanceResourceTiming
      return rt && (rt as any).initiatorType === 'img'
    }) as PerformanceResourceTiming[]

    if (entries.length === 0) return null
    const rt = entries[entries.length - 1]

    return {
      nextHopProtocol: rt.nextHopProtocol,
      transferSize: rt.transferSize,
      encodedBodySize: rt.encodedBodySize,
      decodedBodySize: rt.decodedBodySize,
      duration: rt.duration,
      redirectStart: rt.redirectStart,
      redirectEnd: rt.redirectEnd,
      fetchStart: rt.fetchStart,
      domainLookupStart: rt.domainLookupStart,
      domainLookupEnd: rt.domainLookupEnd,
      connectStart: rt.connectStart,
      connectEnd: rt.connectEnd,
      secureConnectionStart: rt.secureConnectionStart,
      requestStart: rt.requestStart,
      responseStart: rt.responseStart,
      responseEnd: rt.responseEnd,
      startTime: rt.startTime,
      workerStart: (rt as any).workerStart,
    }
  } catch {
    return null
  }
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))
  return sorted[idx]
}

function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

/**
 * Measure aspect ratio from an image URL.
 * Uses Image() element - works cross-origin without CORS.
 * Returns null on failure or timeout.
 */
export function measureImageAspect(url: string, diagLabel?: string): Promise<number | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    ;(img as any).loading = 'eager'
    // Hint to the browser scheduler; useful to A/B in DevTools (Priority column).
    ;(img as any).fetchPriority = 'high'
    
    const start = performance.now()
    const envAtStart = LOG_MEASUREMENT_DIAGNOSTICS ? getEnvSnapshot() : undefined
    
    const timeout = setTimeout(() => {
      img.onload = null
      img.onerror = null
      if (LOG_MEASUREMENT_DIAGNOSTICS) {
        const elapsedMs = performance.now() - start
        const rt = getLatestImgResourceTiming(url)
        console.log('[measureImageAspect] timeout', {
          diagLabel,
          elapsedMs,
          url,
          envAtStart,
          envNow: getEnvSnapshot(),
          resourceTiming: rt,
        })
      }
      resolve(null)
    }, MEASUREMENT_TIMEOUT_MS)
    
    img.onload = () => {
      clearTimeout(timeout)
      if (LOG_MEASUREMENT_DIAGNOSTICS) {
        const elapsedMs = performance.now() - start
        const rt = getLatestImgResourceTiming(url)
        console.log('[measureImageAspect] loaded', {
          diagLabel,
          elapsedMs,
          url,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          envAtStart,
          envNow: getEnvSnapshot(),
          resourceTiming: rt,
        })
      }
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve(img.naturalWidth / img.naturalHeight)
      } else {
        resolve(null)
      }
    }
    
    img.onerror = () => {
      clearTimeout(timeout)
      if (LOG_MEASUREMENT_DIAGNOSTICS) {
        const elapsedMs = performance.now() - start
        const rt = getLatestImgResourceTiming(url)
        console.log('[measureImageAspect] error', {
          diagLabel,
          elapsedMs,
          url,
          envAtStart,
          envNow: getEnvSnapshot(),
          resourceTiming: rt,
        })
      }
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
    const measured = await measureImageAspect(url, `${block.type}:${block.blockId}`)
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
 */
export async function measureBlockAspects<T extends MeasurableBlock>(
  blocks: T[],
  existingBlocks?: Map<string, { aspect?: number; aspectSource?: string }>
): Promise<MeasuredBlock<T>[]> {
  const timer = `measure-batch-${blocks.length}-blocks`
  console.time(timer)
  const batchStart = LOG_MEASUREMENT_DIAGNOSTICS ? performance.now() : 0
  const envBatchStart = LOG_MEASUREMENT_DIAGNOSTICS ? getEnvSnapshot() : undefined

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

  const elapsedById = LOG_MEASUREMENT_DIAGNOSTICS ? new Map<string, number>() : null
  let active = 0
  let maxActive = 0

  const runOne = async (block: T) => {
    const existing = existingBlocks?.get(block.blockId)
    if (existing?.aspectSource === 'measured' && existing.aspect) {
      return { ...block, aspect: existing.aspect, aspectSource: 'measured' as const }
    }

    const t0 = LOG_MEASUREMENT_DIAGNOSTICS ? performance.now() : 0
    try {
      return await measureBlockAspect(block, existing)
    } finally {
      if (LOG_MEASUREMENT_DIAGNOSTICS && elapsedById) {
        elapsedById.set(block.blockId, performance.now() - t0)
      }
    }
  }

  const measureWithConcurrency = async (items: T[], concurrency: number): Promise<MeasuredBlock<T>[]> => {
    const results: Array<MeasuredBlock<T>> = new Array(items.length)
    let i = 0

    const worker = async () => {
      while (true) {
        const idx = i++
        if (idx >= items.length) return
        active += 1
        maxActive = Math.max(maxActive, active)
        try {
          results[idx] = await runOne(items[idx])
        } finally {
          active -= 1
        }
      }
    }

    const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker())
    await Promise.all(workers)
    return results
  }

  const result =
    MEASUREMENT_MAX_CONCURRENCY && MEASUREMENT_MAX_CONCURRENCY > 0
      ? await measureWithConcurrency(blocks, MEASUREMENT_MAX_CONCURRENCY)
      : await Promise.all(blocks.map(runOne))

  if (LOG_MEASUREMENT_DIAGNOSTICS) {
    const batchElapsedMs = performance.now() - batchStart
    const protocolCounts = new Map<string, number>()
    const hostCounts = new Map<string, number>()
    for (const b of blocks) {
      const url = getMeasurementUrl(b)
      if (!url) continue
      const rt = getLatestImgResourceTiming(url)
      const proto = rt?.nextHopProtocol || '(unknown)'
      protocolCounts.set(proto, (protocolCounts.get(proto) ?? 0) + 1)
      const host = getHostname(url) || '(unknown-host)'
      hostCounts.set(host, (hostCounts.get(host) ?? 0) + 1)
    }

    const perBlockElapsed = elapsedById ? Array.from(elapsedById.values()) : []
    perBlockElapsed.sort((a, b) => a - b)

    console.log('[measureBlockAspects] diagnostics', {
      blocks: blocks.length,
      batchElapsedMs,
      envBatchStart,
      envBatchEnd: getEnvSnapshot(),
      maxActive,
      appConcurrency: MEASUREMENT_MAX_CONCURRENCY,
      perBlockMs: {
        min: perBlockElapsed[0] ?? null,
        p50: percentile(perBlockElapsed, 0.5),
        p90: percentile(perBlockElapsed, 0.9),
        p95: percentile(perBlockElapsed, 0.95),
        max: perBlockElapsed[perBlockElapsed.length - 1] ?? null,
      },
      protocolCounts: Object.fromEntries(protocolCounts),
      hostCounts: Object.fromEntries(hostCounts),
      note:
        'If nextHopProtocol is (unknown), check DevTools Network → enable the Protocol column; cross-origin resources may have limited timing unless Timing-Allow-Origin is set.',
    })
  }

  console.timeEnd(timer)
  return result
}
