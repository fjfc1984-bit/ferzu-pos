// =============================================================================
// FERZU POS — NicheContextBar
// Barra visual que confirma al usuario en qué nicho y sucursal está operando.
//
// Uso explícito:  <NicheContextBar moduleLabel="Citas" />
// Uso en AppShell: <NicheContextBar /> → detecta moduleLabel por ruta
//
// Usa inline styles para evitar purging de clases Tailwind dinámicas.
// =============================================================================

import { useLocation }    from 'react-router-dom'
import { useBranchNiche } from '../hooks/useBranchNiche.js'
import { usePOS }         from '../context/POSContext.jsx'

const NICHE_CONFIG = {
  barbershop: { icon: '✂️', label: 'Barbería / Spa',    color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  workshop:   { icon: '🔧', label: 'Taller Automotriz', color: '#c2410c', bg: '#fff7ed', border: '#fed7aa' },
  restaurant: { icon: '🍽️', label: 'Restaurante',       color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  minimarket: { icon: '🛒', label: 'Minimarket',         color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  general:    { icon: '🏪', label: 'Negocio General',    color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' },
}

// Mapa pathname → label de módulo (para uso automático en AppShell)
const ROUTE_LABELS = {
  '/dashboard':         'Dashboard',
  '/pos':               'Punto de Venta',
  '/inventory':         'Inventario',
  '/customers':         'Clientes',
  '/barbershop':        'Agenda de Citas',
  '/workshop':          'Órdenes de Trabajo',
  '/kitchen':           'Cocina',
  '/minimarket':        'Minimarket',
  '/dian':              'Facturación DIAN',
  '/dian/setup':        'Configuración DIAN',
  '/reporte':           'Reporte Diario',
  '/analytics':         'Analítica Ejecutiva',
  '/retencion':         'Retención de Clientes',
  '/alertas':           'Alertas',
  '/turnos':            'Turnos',
  '/sucursales':        'Sucursales',
  '/settings':          'Configuración',
  '/integraciones':     'Integraciones',
}

export default function NicheContextBar({ moduleLabel }) {
  const { branchNiche } = useBranchNiche()
  const { branchId }    = usePOS()
  const location        = useLocation()

  // Fallback a localStorage si el contexto aún no cargó
  const effectiveBranchId   = branchId   || localStorage.getItem('ferzu_branch_id')
  const effectiveBranchName = localStorage.getItem('ferzu_branch_name') || 'Sucursal'
  const effectiveNiche      = branchNiche || localStorage.getItem('ferzu_branch_niche') || 'general'

  // Si no hay sucursal activa → no renderizar (ej: onboarding, branch-select)
  if (!effectiveBranchId) return null

  // Label de módulo: prop explícita > detección por ruta
  const resolvedLabel = moduleLabel || ROUTE_LABELS[location.pathname] || null

  const cfg = NICHE_CONFIG[effectiveNiche] || NICHE_CONFIG.general

  return (
    <div style={{
      display:         'flex',
      alignItems:      'center',
      gap:             '10px',
      padding:         '7px 16px',
      borderBottom:    `1px solid ${cfg.border}`,
      backgroundColor: cfg.bg,
      fontSize:        '12px',
      flexShrink:      0,
    }}>
      {/* Dot animado */}
      <span style={{ position: 'relative', display: 'inline-flex', width: 8, height: 8, flexShrink: 0 }}>
        <span style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          backgroundColor: cfg.color, opacity: 0.35,
          animation: 'nicheping 1.5s cubic-bezier(0,0,0.2,1) infinite',
        }} />
        <span style={{
          position: 'relative', display: 'inline-flex', width: 8, height: 8,
          borderRadius: '50%', backgroundColor: cfg.color,
        }} />
      </span>

      {/* Niche */}
      <span style={{ fontWeight: 600, color: cfg.color }}>
        {cfg.icon} {cfg.label}
      </span>

      <span style={{ color: cfg.color, opacity: 0.35 }}>·</span>

      {/* Sucursal */}
      <span style={{ color: cfg.color, opacity: 0.7, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {effectiveBranchName}
      </span>

      {resolvedLabel && (
        <>
          <span style={{ color: cfg.color, opacity: 0.35 }}>·</span>
          <span style={{ color: cfg.color, opacity: 0.6, fontWeight: 500 }}>{resolvedLabel}</span>
        </>
      )}

      <div style={{ flex: 1 }} />

      {/* Badge compacto */}
      <span style={{
        fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
        padding: '2px 7px', borderRadius: 999,
        border: `1px solid ${cfg.border}`, color: cfg.color, opacity: 0.55,
        flexShrink: 0,
      }}>
        Contexto activo
      </span>

      {/* keyframes — nombre único para evitar colisión */}
      <style>{`
        @keyframes nicheping {
          75%, 100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
