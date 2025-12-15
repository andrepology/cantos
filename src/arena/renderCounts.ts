type RenderCountsState = {
  counts: Record<string, number>
  intervalId: number | null
}

const GLOBAL_KEY = '__cantosRenderCounts__'

function getState(): RenderCountsState {
  const g = globalThis as any
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = { counts: {}, intervalId: null } satisfies RenderCountsState
  }
  return g[GLOBAL_KEY] as RenderCountsState
}

function startLogger(): void {
  if (!import.meta.env.DEV) return
  const state = getState()
  if (state.intervalId != null) return

  state.intervalId = window.setInterval(() => {
    const entries = Object.entries(state.counts)
    if (entries.length === 0) return
    entries.sort((a, b) => b[1] - a[1])
    // eslint-disable-next-line no-console
    console.log('[renderCounts]/sec', Object.fromEntries(entries))
    state.counts = {}
  }, 1000)
}

export function recordRender(name: string): void {
  if (!import.meta.env.DEV) return
  const state = getState()
  state.counts[name] = (state.counts[name] ?? 0) + 1
  startLogger()
}

