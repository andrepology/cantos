import { Component, type ReactNode } from 'react'

type Props = {
  onError: (error: any) => void
  children: ReactNode
}

type State = { hasError: boolean; error: any }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: any): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: any, info: any) {
    try {
      // eslint-disable-next-line no-console
      console.error('[ErrorBoundary] Caught error', { error, info })
      this.props.onError?.(error)
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return null
    }
    return this.props.children
  }
}


