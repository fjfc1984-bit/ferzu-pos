// =============================================================================
// FERZU POS — ErrorBoundary
// Solo se activa cuando ocurre un error real (percance).
// Durante operación normal tiene costo CERO.
// =============================================================================
import { Component } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

// Guardar snapshot del error en localStorage para diagnóstico offline
function saveLocalSnapshot(errorInfo) {
  try {
    const history = JSON.parse(localStorage.getItem('ferzu_error_log') || '[]')
    history.unshift(errorInfo)
    // Máximo 20 entradas para no llenar el storage
    localStorage.setItem('ferzu_error_log', JSON.stringify(history.slice(0, 20)))
  } catch (_) { /* no hacer nada si localStorage falla */ }
}

// Enviar al backend para persistencia y alertas
async function reportToBackend(errorInfo) {
  try {
    await fetch(`${API}/errors`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(errorInfo),
    })
  } catch (_) { /* si el backend también está caído, ya tenemos el snapshot local */ }
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, errorId: null, errorMessage: '' }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError:     true,
      errorMessage: error?.message || 'Error desconocido',
    }
  }

  componentDidCatch(error, info) {
    const errorId = `fe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const errorInfo = {
      errorId,
      source:       'frontend',
      message:      error?.message || 'Error desconocido',
      stack:        error?.stack?.substring(0, 1500) || '',
      componentStack: info?.componentStack?.substring(0, 1000) || '',
      url:          window.location.href,
      userAgent:    navigator.userAgent,
      timestamp:    new Date().toISOString(),
    }

    this.setState({ errorId })

    // 1. Backup local inmediato (offline-safe)
    saveLocalSnapshot(errorInfo)

    // 2. Reporte al backend (best-effort, no bloquea UI)
    reportToBackend(errorInfo)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-gray-900 border border-red-500/30 rounded-2xl p-8 text-center">
          {/* Ícono */}
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>

          <h1 className="text-xl font-bold text-white mb-2">Algo salió mal</h1>
          <p className="text-gray-400 text-sm mb-6">
            El sistema encontró un error inesperado. Ya guardamos un reporte automático.
          </p>

          {this.state.errorMessage && (
            <div className="bg-gray-800 rounded-lg p-3 mb-6 text-left">
              <p className="text-red-300 text-xs font-mono break-all">
                {this.state.errorMessage}
              </p>
            </div>
          )}

          {this.state.errorId && (
            <p className="text-gray-600 text-xs mb-6">
              ID del error: <span className="font-mono text-gray-500">{this.state.errorId}</span>
            </p>
          )}

          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Recargar la app
            </button>
            <button
              onClick={() => { window.location.href = '/pos' }}
              className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Ir al POS
            </button>
          </div>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
