// Lightweight request scheduler with global concurrency + pacing and retry/backoff.
// Intended for calling public APIs like Are.na from the browser.

export type ArenaFetchInit = RequestInit & {
  immediate?: boolean // bypass rate limiting for interactive flows (e.g., search)
  maxRetries?: number
  retryOn?: (res: Response | null, error: unknown) => boolean
}

const MAX_CONCURRENT = 1 // Conservative: single request at a time
const MIN_INTERVAL_MS = 300 // 250/min = 4.17/sec → 240ms; use 300ms for safety
const DEFAULT_MAX_RETRIES = 3 // Lower retries given sensitive endpoints

let activeCount = 0
let lastStartTs = 0

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function acquireSlot(): Promise<void> {
  // Spin with small sleeps until a slot opens and pacing window passes
  // Keep this simple for browser environments.
  for (;;) {
    const now = Date.now()
    const sinceLast = now - lastStartTs
    const canStart = activeCount < MAX_CONCURRENT && sinceLast >= MIN_INTERVAL_MS
    if (canStart) {
      activeCount += 1
      lastStartTs = Date.now()
      return
    }
    const waitMs = Math.max(20, MIN_INTERVAL_MS - sinceLast)
    await sleep(waitMs)
  }
}

function releaseSlot(): void {
  activeCount = Math.max(0, activeCount - 1)
}

function computeRetryDelay(attempt: number, retryAfterHeader?: string | null): number {
  // Respect Retry-After if provided (seconds or HTTP-date)
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader)
    if (!Number.isNaN(seconds) && seconds > 0) return Math.min(15000, seconds * 1000)
    const dateTs = Date.parse(retryAfterHeader)
    if (!Number.isNaN(dateTs)) {
      const ms = Math.max(0, dateTs - Date.now())
      if (ms > 0) return Math.min(15000, ms)
    }
  }
  const base = 400
  const max = 8000
  const jitter = Math.floor(Math.random() * 200)
  const exp = Math.min(max, base * Math.pow(2, attempt))
  return exp + jitter
}

function isDefaultRetriable(res: Response | null, error: unknown): boolean {
  if (error) return true // network error
  if (!res) return true
  if (res.status === 429) return true
  // Are.na: 403s from rate limiting (blocks/channels endpoints are sensitive)
  if (res.status === 403) return true
  if (res.status >= 500 && res.status <= 599) return true
  return false
}

export async function arenaFetch(input: RequestInfo | URL, init: ArenaFetchInit = {}): Promise<Response> {
  const { maxRetries = DEFAULT_MAX_RETRIES, retryOn = isDefaultRetriable, immediate = false, ...rest } = init

  let lastError: unknown = null
  let lastResponse: Response | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Skip rate limiting for immediate requests (e.g., interactive search)
    if (!immediate) {
      await acquireSlot()
    }
    try {
      lastError = null
      const res = await fetch(input, rest)
      lastResponse = res
      if (!retryOn(res, null)) {
        return res
      }
      // If retriable and not ok, schedule retry
      if (res.ok) {
        return res
      }
    } catch (e) {
      lastError = e
      lastResponse = null
      if (!retryOn(null, e)) {
        throw e
      }
    } finally {
      if (!immediate) {
        releaseSlot()
      }
    }

    // Compute backoff
    const retryAfter = lastResponse?.headers?.get('retry-after') ?? null
    const delay = computeRetryDelay(attempt, retryAfter)
    await sleep(delay)
  }

  // Exhausted retries
  if (lastResponse) return lastResponse
  throw lastError ?? new Error('arenaFetch failed with unknown error')
}


