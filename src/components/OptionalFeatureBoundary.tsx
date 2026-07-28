import { Component, type ErrorInfo, type ReactNode } from 'react'

interface OptionalFeatureBoundaryProps {
  children: ReactNode
  featureName: string
  onClose: () => void
}

interface OptionalFeatureBoundaryState {
  hasError: boolean
}

export class OptionalFeatureBoundary extends Component<
  OptionalFeatureBoundaryProps,
  OptionalFeatureBoundaryState
> {
  state: OptionalFeatureBoundaryState = { hasError: false }

  static getDerivedStateFromError(): OptionalFeatureBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`No se pudo cargar ${this.props.featureName}.`, error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="optional-feature-error" role="alert">
          <strong>No pudimos abrir {this.props.featureName}</strong>
          <p>La aplicación y tu checklist siguen funcionando con normalidad.</p>
          <button className="secondary-button" onClick={this.props.onClose} type="button">Cerrar</button>
        </section>
      )
    }

    return this.props.children
  }
}
