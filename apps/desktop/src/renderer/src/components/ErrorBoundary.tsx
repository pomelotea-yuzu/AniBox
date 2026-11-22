/**
 * ErrorBoundary — 全局错误边界
 * 捕获 React 渲染错误，避免整个应用白屏
 */
import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[AniBox] ErrorBoundary caught:', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="min-h-screen bg-anibox-bg flex flex-col items-center justify-center p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ef4444"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-neutral-200 mb-2">出了点问题</h2>
          <p className="text-sm text-neutral-400 max-w-md mb-4">
            AniBox 遇到了一个渲染错误，这通常是暂时的。
          </p>
          {this.state.error && (
            <pre className="text-xs text-neutral-500 bg-neutral-900 rounded-lg p-3 max-w-lg mb-4 overflow-auto text-left max-h-32">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex gap-3">
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 text-sm bg-anibox-accent hover:bg-anibox-accent-hover text-white rounded transition-colors"
            >
              重试
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded transition-colors"
            >
              重新加载
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
