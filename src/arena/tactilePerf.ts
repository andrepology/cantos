import type { CardLayout } from './hooks/useTactileLayout'

// Toggle for all tactile perf instrumentation. Set to false locally to disable
// recording and minimize overhead without touching TactileCard / TactileDeck.
export const TACTILE_PERF_ENABLED = true

type TimingKind = 'layout' | 'culling' | 'scrollBounds'

interface TimingStatsInternal {
  count: number
  totalMs: number
  maxMs: number
  recent: number[]
}

export interface TimingStatsSnapshot {
  count: number
  avgMs: number
  maxMs: number
}

export interface CardSampleSnapshot {
  id: number
  renders: number
  layoutChanges: number
  handlerChanges: number
}

export interface TactilePerfSnapshot {
  deckRenderCount: number
  cardSamples: CardSampleSnapshot[]
  layout: TimingStatsSnapshot
  culling: TimingStatsSnapshot
  scrollBounds: TimingStatsSnapshot
  lastMorphDurationMs: number | null
}

interface CardHandlers {
  onClick?: unknown
  onPointerDown?: unknown
  onPointerMove?: unknown
  onPointerUp?: unknown
}

interface CardStateInternal {
  renders: number
  layoutChanges: number
  handlerChanges: number
  lastLayout?: CardLayout
  lastHandlers?: CardHandlers
}

const MAX_RECENT_SAMPLES = 120

function createTimingStats(): TimingStatsInternal {
  return {
    count: 0,
    totalMs: 0,
    maxMs: 0,
    recent: [],
  }
}

const perfState = {
  deckRenderCount: 0,
  cards: new Map<number, CardStateInternal>(),
  layout: createTimingStats(),
  culling: createTimingStats(),
  scrollBounds: createTimingStats(),
  lastMorphDurationMs: null as number | null,
}

export function resetTactilePerf(): void {
  if (!TACTILE_PERF_ENABLED) return
  perfState.deckRenderCount = 0
  perfState.cards.clear()
  perfState.layout = createTimingStats()
  perfState.culling = createTimingStats()
  perfState.scrollBounds = createTimingStats()
  perfState.lastMorphDurationMs = null
}

export function recordDeckRender(): void {
  if (!TACTILE_PERF_ENABLED) return
  perfState.deckRenderCount += 1
}

function getOrCreateCardState(id: number): CardStateInternal {
  let entry = perfState.cards.get(id)
  if (!entry) {
    entry = {
      renders: 0,
      layoutChanges: 0,
      handlerChanges: 0,
    }
    perfState.cards.set(id, entry)
  }
  return entry
}

function layoutsDiffer(a?: CardLayout, b?: CardLayout): boolean {
  if (!a || !b) return a !== b
  return (
    a.x !== b.x ||
    a.y !== b.y ||
    a.width !== b.width ||
    a.height !== b.height ||
    a.scale !== b.scale ||
    a.opacity !== b.opacity ||
    a.zIndex !== b.zIndex ||
    a.rotation !== b.rotation
  )
}

function handlersDiffer(a?: CardHandlers, b?: CardHandlers): boolean {
  if (!a || !b) return a !== b
  return (
    a.onClick !== b.onClick ||
    a.onPointerDown !== b.onPointerDown ||
    a.onPointerMove !== b.onPointerMove ||
    a.onPointerUp !== b.onPointerUp
  )
}

export function recordCardRender(
  id: number,
  layout: CardLayout | undefined,
  handlers: CardHandlers
): void {
  if (!TACTILE_PERF_ENABLED) return
  const state = getOrCreateCardState(id)
  state.renders += 1

  if (layoutsDiffer(state.lastLayout, layout)) {
    state.layoutChanges += 1
    state.lastLayout = layout
  }

  if (handlersDiffer(state.lastHandlers, handlers)) {
    state.handlerChanges += 1
    state.lastHandlers = handlers
  }
}

function recordTiming(kind: TimingKind, durationMs: number): void {
  if (!TACTILE_PERF_ENABLED) return
  const bucket = perfState[kind]
  bucket.count += 1
  bucket.totalMs += durationMs
  if (durationMs > bucket.maxMs) bucket.maxMs = durationMs
  bucket.recent.push(durationMs)
  if (bucket.recent.length > MAX_RECENT_SAMPLES) {
    bucket.recent.shift()
  }
}

export function recordLayoutTiming(durationMs: number): void {
  recordTiming('layout', durationMs)
}

export function recordCullingTiming(durationMs: number): void {
  recordTiming('culling', durationMs)
}

export function recordScrollBoundsTiming(durationMs: number): void {
  recordTiming('scrollBounds', durationMs)
}

export function setLastMorphDuration(durationMs: number): void {
  if (!TACTILE_PERF_ENABLED) return
  perfState.lastMorphDurationMs = durationMs
}

function snapshotTiming(stats: TimingStatsInternal): TimingStatsSnapshot {
  return {
    count: stats.count,
    avgMs: stats.count === 0 ? 0 : stats.totalMs / stats.count,
    maxMs: stats.maxMs,
  }
}

export function getTactilePerfSnapshot(sampleIds: number[] = [0, 50, 250, 499]): TactilePerfSnapshot {
  if (!TACTILE_PERF_ENABLED) {
    return {
      deckRenderCount: 0,
      cardSamples: [],
      layout: { count: 0, avgMs: 0, maxMs: 0 },
      culling: { count: 0, avgMs: 0, maxMs: 0 },
      scrollBounds: { count: 0, avgMs: 0, maxMs: 0 },
      lastMorphDurationMs: null,
    }
  }

  const samples: CardSampleSnapshot[] = []

  for (const id of sampleIds) {
    const state = perfState.cards.get(id)
    if (!state) continue
    samples.push({
      id,
      renders: state.renders,
      layoutChanges: state.layoutChanges,
      handlerChanges: state.handlerChanges,
    })
  }

  return {
    deckRenderCount: perfState.deckRenderCount,
    cardSamples: samples,
    layout: snapshotTiming(perfState.layout),
    culling: snapshotTiming(perfState.culling),
    scrollBounds: snapshotTiming(perfState.scrollBounds),
    lastMorphDurationMs: perfState.lastMorphDurationMs,
  }
}


