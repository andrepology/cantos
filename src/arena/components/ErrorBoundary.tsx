import { Component, type ReactNode } from 'react'

type Props = {
  onError: (error: any) => void
  onReset?: () => void
  resetKeys?: any[]
  children: ReactNode
}

type State = { hasError: boolean; error: any }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: any): State {
    return { hasError: true, error }
  }

  componentDidUpdate(prevProps: Props) {
    // Reset error boundary when resetKeys change
    if (this.state.hasError && this.props.resetKeys) {
      const keysChanged = prevProps.resetKeys?.some((key, i) => key !== this.props.resetKeys?.[i])
      if (keysChanged) {
        this.props.onReset?.()
        this.setState({ hasError: false, error: null })
      }
    }
  }

  componentDidCatch(error: any, info: any) {
    try {
      // eslint-disable-next-line no-console
      // Caught error - no logging
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


