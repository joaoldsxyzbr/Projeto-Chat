import { Component } from 'react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { falhou: false }
  }

  static getDerivedStateFromError() {
    return { falhou: true }
  }

  componentDidCatch(error, info) {
    console.error('Falha ao renderizar o Projeto Chat:', error, info)
  }

  render() {
    if (!this.state.falhou) return this.props.children

    return (
      <main className="app-error" role="alert">
        <section className="app-error-card">
          <div className="app-error-icon" aria-hidden="true">↻</div>
          <h1>Não foi possível abrir o chat</h1>
          <p>O app encontrou um erro inesperado. Recarregue para buscar a versão mais recente.</p>
          <button type="button" className="primary-button" onClick={() => window.location.reload()}>
            Recarregar
          </button>
        </section>
      </main>
    )
  }
}

export default ErrorBoundary
