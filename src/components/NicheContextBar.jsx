// =============================================================================
// FERZU POS — NicheContextBar
// Barra visual que confirma al usuario en qué nicho y sucursal está operando.
// Uso: <NicheContextBar /> — sin props, lee el contexto global.
// =============================================================================

import { useBranchNiche } from '../hooks/useBranchNiche.js'
import { usePOS }         from '../context/POSContext.jsx'

const NICHE_CONFIG = {
  barbershop: {
    icon:    '✂️',
    label:   'Barbería / Spa',
    bg:      'bg-violet-50',
    border:  'border-violet-200',
    text:    'text-violet-700',
    dot:     'bg-violet-500',
  },
  workshop: {
    icon:    '🔧',
    label:   'Taller Automotriz',
    bg:      'bg-orange-50',
    border:  'border-orange-200',
    text:    'text-orange-700',
    dot:     'bg-orange-500',
  },
  restaurant: {
    icon:    '🍽️',
    label:   'Restaurante',
    bg:      'bg-red-50',
    border:  'border-red-200',
    text:    'text-red-700',
    dot:     'bg-red-500',
  },
  minimarket: {
    icon:    '🛒',
    label:   'Minimarket',
    bg:      'bg-green-50',
    border:  'border-green-200',
    text:    'text-green-700',
    dot:     'bg-green-500',
  },
  general: {
    icon:    '🏪',
    label:   'General',
    bg:      'bg-blue-50',
    border:  'border-blue-200',
    text:    'text-blue-700',
    dot:     'bg-blue-500',
  },
}

/**
 * NicheContextBar — barra de contexto activo.
 * @param {string} [moduleLabel] - Etiqueta del módulo para mostrar (ej. "Citas", "Órdenes de Trabajo").
 *                                  Si se omite, se muestra solo el niche.
 */
export default function NicheContextBar({ moduleLabel }) {
  const { branchNiche }           = useBranchNiche()
  const { branchName, branchId }  = usePOS()

  if (!branchId) return null   // sin sucursal activa → no mostrar

  const cfg = NICHE_CONFIG[branchNiche] || NICHE_CONFIG.general

  return (
    <div className={`flex items-center gap-3 px-4 py-2 rounded-2xl border ${cfg.bg} ${cfg.border} mb-4`}>
      {/* Dot de estado activo */}
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.dot} opacity-50`} />
        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${cfg.dot}`} />
      </span>

      {/* Niche icon + label */}
      <span className={`text-sm font-semibold ${cfg.text} flex items-center gap-1.5`}>
        <span>{cfg.icon}</span>
        <span>{cfg.label}</span>
      </span>

      {/* Separador */}
      <span className={`text-xs ${cfg.text} opacity-40`}>·</span>

      {/* Sucursal */}
      <span className={`text-xs ${cfg.text} opacity-70 font-medium truncate max-w-[160px]`}>
        {branchName || 'Sucursal'}
      </span>

      {/* Módulo opcional */}
      {moduleLabel && (
        <>
          <span className={`text-xs ${cfg.text} opacity-40`}>·</span>
          <span className={`text-xs ${cfg.text} opacity-60`}>{moduleLabel}</span>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Badge de contexto activo */}
      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${cfg.border} ${cfg.text} opacity-60`}>
        Contexto activo
      </span>
    </div>
  )
}
