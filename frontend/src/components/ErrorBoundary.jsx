/**
 * Error boundary component — catches React rendering errors gracefully.
 */
import { Component } from 'react'

class ErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-8">
          <div className="max-w-md text-center">
            <div className="text-red-400 text-6xl mb-4">⚠</div>
            <h1 className="text-xl font-mono text-zinc-100 mb-2">Something went wrong</h1>
            <p className="text-zinc-400 mb-4 text-sm">{this.state.error?.message}</p>
            <button
              onClick={() => window.location.href = '/'}
              className="px-4 py-2 bg-zinc-800 text-zinc-200 rounded hover:bg-zinc-700 font-mono text-sm"
            >
              Go Home
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
