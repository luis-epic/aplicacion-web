import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('OPECONCA Campo no pudo renderizar la interfaz.', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="error-boundary" role="alert">
          <div>
            <span className="eyebrow">Recuperación segura</span>
            <h1>No pudimos mostrar OPECONCA Campo</h1>
            <p>Tus datos locales permanecen en este dispositivo. Vuelve a cargar para intentarlo de nuevo.</p>
            <button className="primary-button" onClick={() => window.location.reload()} type="button">
              Volver a cargar
            </button>
          </div>
        </main>
      )
    }

    return this.props.children
  }
}
