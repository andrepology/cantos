import { useEffect, useState } from 'react'
import { fetchArenaChannel } from './api'
import type { Card } from './types'

export type UseArenaState = {
  loading: boolean
  error: string | null
  cards: Card[]
}

export function useArenaChannel(slug: string | undefined): UseArenaState {
  const [state, setState] = useState<UseArenaState>({ loading: false, error: null, cards: [] })

  useEffect(() => {
    let cancelled = false
    if (!slug) {
      setState({ loading: false, error: null, cards: [] })
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    fetchArenaChannel(slug)
      .then((cards) => !cancelled && setState({ loading: false, error: null, cards }))
      .catch((e) => !cancelled && setState({ loading: false, error: e.message ?? 'Error', cards: [] }))
    return () => {
      cancelled = true
    }
  }, [slug])

  return state
}


