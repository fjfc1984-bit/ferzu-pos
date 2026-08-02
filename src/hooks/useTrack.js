// =============================================================================
// FERZU POS — useTrack hook
// Registra eventos de uso de forma fire-and-forget.
// No bloquea UI — los errores se silencian para no afectar la experiencia.
// =============================================================================
// Uso:
//   const track = useTrack()
//   track('module_view', 'pos')
//   track('sale_completed', 'pos', { total: 50000, items: 3 })
// =============================================================================

import { useCallback }  from 'react'
import { useAuth }      from '../context/AuthContext'
import api              from '../api'

// Caché de sesión: evitar registrar el mismo evento más de una vez por sesión
const _sent = new Set()

export function useTrack() {
  const { user, organizationId } = useAuth()

  const track = useCallback((event_type, module_name, metadata) => {
    // Solo trackear si hay sesión activa
    if (!user || !organizationId) return

    // Deduplicar module_view por sesión (evitar spam al navegar)
    if (event_type === 'module_view') {
      const key = `${event_type}:${module_name}`
      if (_sent.has(key)) return
      _sent.add(key)
    }

    // Fire-and-forget — no await, no bloqueo
    api.post('/analytics/track', {
      event_type,
      module: module_name || undefined,
      metadata: metadata  || undefined,
    }).catch(() => {
      // Silent: analytics nunca rompe la UX
    })
  }, [user, organizationId])

  return track
}

export default useTrack
