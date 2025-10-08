import { useCallback, useRef, useState } from 'react'

interface CacheEntry {
  ratio: number
  timestamp: number
  accessCount: number
}

export interface UseAspectRatioCacheResult {
  getAspectRatio: (blockId: string) => number | null
  setAspectRatio: (blockId: string, ratio: number) => void
  ensureAspectRatio: (blockId: string, getSourceUrl: () => string | undefined, getMetadataRatio?: () => number | null) => void
  aspectVersion: number
  clearExpired: () => void
}

/**
 * Shared aspect ratio cache for Arena blocks.
 * Uses blockId (string) as keys to unify caching between deck cards and block shapes.
 * Includes size limits and time-based expiration to prevent unbounded growth.
 */
export function useAspectRatioCache(): UseAspectRatioCacheResult {
  // Global cache shared across all hook instances
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map())
  const [version, setVersion] = useState(0)
  const inFlightRef = useRef<Set<string>>(new Set())
  const pendingBumpRef = useRef(false)

  // Microtask scheduler util (once per tick for version bumps)
  const scheduleMicrotask = (fn: () => void) => {
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(fn as any)
    } else {
      Promise.resolve().then(fn).catch(() => setTimeout(fn, 0))
    }
  }

  const scheduleVersionBump = useCallback(() => {
    if (pendingBumpRef.current) return
    pendingBumpRef.current = true
    scheduleMicrotask(() => {
      pendingBumpRef.current = false
      setVersion(v => v + 1)
    })
  }, [])

  // Cache limits
  const MAX_SIZE = 500
  const TTL_MS = 15 * 60 * 1000 // 15 minutes

  const getAspectRatio = useCallback((blockId: string): number | null => {
    const entry = cacheRef.current.get(blockId)
    if (!entry) return null

    const now = Date.now()
    if (now - entry.timestamp > TTL_MS) {
      cacheRef.current.delete(blockId)
      return null
    }

    // Update access count and timestamp
    entry.accessCount++
    entry.timestamp = now

    return entry.ratio
  }, [])

  const setAspectRatio = useCallback((blockId: string, ratio: number) => {
    // Avoid synchronous state updates in render; coalesce bumps per tick
    const now = Date.now()

    // Enforce size limit using LRU eviction
    if (cacheRef.current.size >= MAX_SIZE) {
      // Find least recently accessed entry
      let oldestId: string | null = null
      let oldestTime = now
      let oldestAccess = Infinity

      for (const [id, entry] of cacheRef.current.entries()) {
        if (entry.accessCount < oldestAccess ||
            (entry.accessCount === oldestAccess && entry.timestamp < oldestTime)) {
          oldestId = id
          oldestTime = entry.timestamp
          oldestAccess = entry.accessCount
        }
      }

      if (oldestId) {
        cacheRef.current.delete(oldestId)
      }
    }

    cacheRef.current.set(blockId, {
      ratio,
      timestamp: now,
      accessCount: 1
    })

    scheduleVersionBump()
  }, [])

  const ensureAspectRatio = useCallback((blockId: string, getSourceUrl: () => string | undefined, getMetadataRatio?: () => number | null) => {
    // Already cached and valid?
    if (getAspectRatio(blockId) !== null) return

    // Prevent spawning duplicate image loads on each render while resizing
    if (inFlightRef.current.has(blockId)) return

    // Try metadata first
    const metadataRatio = getMetadataRatio?.()
    if (metadataRatio && Number.isFinite(metadataRatio) && metadataRatio > 0) {
      setAspectRatio(blockId, metadataRatio)
      return
    }

    // Load from image URL
    const src = getSourceUrl()
    if (!src) return

    try {
      inFlightRef.current.add(blockId)
      const img = new Image()
      img.decoding = 'async' as any
      img.loading = 'eager' as any
      img.onload = () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          const ratio = img.naturalWidth / img.naturalHeight
          setAspectRatio(blockId, ratio)
        }
        inFlightRef.current.delete(blockId)
      }
      img.onerror = () => {
        inFlightRef.current.delete(blockId)
      }
      img.src = src
    } catch (error) {
      // Failed to load image for aspect ratio - no logging
      inFlightRef.current.delete(blockId)
    }
  }, [getAspectRatio, setAspectRatio])

  const clearExpired = useCallback(() => {
    const now = Date.now()
    const toDelete: string[] = []

    for (const [id, entry] of cacheRef.current.entries()) {
      if (now - entry.timestamp > TTL_MS) {
        toDelete.push(id)
      }
    }

    toDelete.forEach(id => cacheRef.current.delete(id))
    if (toDelete.length > 0) {
      scheduleVersionBump()
    }
  }, [])

  return {
    getAspectRatio,
    setAspectRatio,
    ensureAspectRatio,
    aspectVersion: version,
    clearExpired
  }
}
