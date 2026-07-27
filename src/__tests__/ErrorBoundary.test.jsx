// =============================================================================
// FERZU POS — Tests de ErrorBoundary
// Verifica que el boundary captura errores y muestra la UI de fallback.
// =============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from '../components/ErrorBoundary'

// Componente que lanza un error intencional para activar el boundary
function BombComponent() {
  throw new Error('Error de prueba controlado')
}

// Suprimir console.error durante estas pruebas
// (React imprime detalles del error en consola por diseño)
const originalConsoleError = console.error
beforeEach(() => {
  console.error = vi.fn()
  // Stub fetch para que reportToBackend no falle en jsdom
  global.fetch = vi.fn().mockResolvedValue({ ok: true })
})
afterEach(() => {
  console.error = originalConsoleError
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('renderiza los hijos normalmente cuando no hay error', () => {
    render(
      <ErrorBoundary>
        <p>Contenido normal de FERZU POS</p>
      </ErrorBoundary>
    )
    expect(screen.getByText('Contenido normal de FERZU POS')).toBeInTheDocument()
  })

  it('muestra la UI de fallback cuando un hijo lanza un error', () => {
    render(
      <ErrorBoundary>
        <BombComponent />
      </ErrorBoundary>
    )
    expect(screen.getByText('Algo salió mal')).toBeInTheDocument()
  })

  it('muestra el mensaje de error en el fallback', () => {
    render(
      <ErrorBoundary>
        <BombComponent />
      </ErrorBoundary>
    )
    expect(screen.getByText('Error de prueba controlado')).toBeInTheDocument()
  })

  it('llama a fetch para reportar el error al backend', () => {
    render(
      <ErrorBoundary>
        <BombComponent />
      </ErrorBoundary>
    )
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/errors'),
      expect.objectContaining({ method: 'POST' })
    )
  })
})
