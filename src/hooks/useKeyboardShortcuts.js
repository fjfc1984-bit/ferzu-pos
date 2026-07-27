/**
 * FERZU POS — Atajos de teclado globales
 *
 * F2  → Nueva venta (ir a POSPage)
 * F4  → Cobrar (abrir modal de pago en el POS activo)
 * ESC → Cancelar / cerrar modal activo
 * F5  → Refrescar datos del dashboard
 * F8  → Abrir escáner de código de barras
 * F10 → Abre/cierra menú lateral
 *
 * Uso en el componente raíz:
 *   useKeyboardShortcuts({ onNewSale, onCheckout, onEscape, onRefresh, onScan, onMenu })
 *
 * Los atajos se desactivan cuando el foco está en un <input> o <textarea>
 * para no interferir con la escritura del cajero.
 */

import { useEffect } from 'react'

const SHORTCUT_MAP = {
  F2:  'onNewSale',
  F4:  'onCheckout',
  Escape: 'onEscape',
  F5:  'onRefresh',
  F8:  'onScan',
  F10: 'onMenu',
}

export function useKeyboardShortcuts(handlers = {}) {
  useEffect(() => {
    function handleKey(e) {
      // No interferir con inputs / textareas / selects
      const tag = document.activeElement?.tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
        // ESC sí aplica aunque estés en un input (para cerrar modales)
        if (e.key !== 'Escape') return
      }

      const action = SHORTCUT_MAP[e.key]
      if (!action) return

      const fn = handlers[action]
      if (typeof fn === 'function') {
        e.preventDefault()
        fn(e)
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handlers])
}

/**
 * Hook que registra UN solo atajo de forma simple.
 * Uso: useSingleShortcut('Escape', () => setOpen(false))
 */
export function useSingleShortcut(key, fn, deps = []) {
  useEffect(() => {
    function handler(e) {
      if (e.key !== key) return
      const tag = document.activeElement?.tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && key !== 'Escape') return
      e.preventDefault()
      fn(e)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps])
}
