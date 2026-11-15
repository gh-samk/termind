import { Component, type ReactNode } from 'react'

/** Fängt unerwartete Renderfehler ab, statt eine weiße Seite zu zeigen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error(error)
  }
  render() {
    if (!this.state.failed) return this.props.children
    const de = navigator.language?.toLowerCase().startsWith('de')
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="font-medium">{de ? 'Da ist etwas schiefgelaufen.' : 'Something went wrong.'}</p>
        <button className="press h-10 rounded-[10px] border border-line bg-surface px-4 text-sm font-medium shadow-xs" onClick={() => location.reload()}>
          {de ? 'Seite neu laden' : 'Reload page'}
        </button>
      </div>
    )
  }
}
