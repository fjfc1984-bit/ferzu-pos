// =============================================================================
// FERZU POS — NicheContextBar
// Barra visual que confirma al usuario en qué nicho y sucursal está operando.
// Uso: <NicheContextBar moduleLabel="Citas" />
// Usa inline styles para evitar purging de clases Tailwind dinámicas.
// =============================================================================

import { useBranchNiche } from '../hooks/useBranchNiche.js'
import { usePOS }         from '../context/POSContext.jsx'

const NICHE_CONFIG = {
  barbershop: { icon: '✂️', label: 'Barbería / Spa',      color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  workshop:   { icon: '🔧', label: 'Taller Automotriz',   color: '#c2410c', bg: '#fff7ed', border: '#fed7aa' },
  restaurant: { icon: '🍽️', label: 'Restaurante',         color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  minimarket: { icon: '🛒', label: 'Minimarket',           color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  general:    { icon: '🏪', label: 'Negocio General',      color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' },
}

export default function NicheContextBar({ moduleLabel }) {
  const { branchNiche }  = useBranchNiche()
  const { branchId }     = usePOS()

  // Fallback a localStorage si el contexto aún no cargó
  const effectiveBranchId    = branchId    || localStorage.getItem('ferzu_branch_id')
  const effectiveBranchName  = localStorage.getItem('ferzu_branch_name') || 'Sucursal'
  const effectiveNiche       = branchNiche || localStorage.getItem('ferzu_branch_niche') || 'general'

  if (!effectiveBranchId) return null

  const cfg = NICHE_CONFIG[effectiveNiche] || NICHE_CONFIG.general

  return (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      gap:            '10px',
      padding:        '8px 14px',
      borderRadius:   '14px',
      border:         `1px solid ${cfg.border}`,
      backgroundColor: cfg.bg,
      marginBottom:   '12px',
      fontSize:       '13px',
    }}>
      {/* Dot animado */}
      <span style={{ position: 'relative', display: 'inline-flex', width: 10, height: 10, flexShrink: 0 }}>
        <span style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          backgroundColor: cfg.color, opacity: 0.4,
          animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite',
        }} />
        <span style={{
          position: 'relative', display: 'inline-flex', width: 10, height: 10,
          borderRadius: '50%', backgroundColor: cfg.color,
        }} />
      </span>

      {/* Niche */}
      <span style={{ fontWeight: 600, color: cfg.color }}>
        {cfg.icon} {cfg.label}
      </span>

      <span style={{ color: cfg.color, opacity: 0.4 }}>·</span>

      {/* Sucursal */}
      <span style={{ color: cfg.color, opacity: 0.75, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {effectiveBranchName}
      </span>

      {moduleLabel && (
        <>
          <span style={{ color: cfg.color, opacity: 0.4 }}>·</span>
          <span style={{ color: cfg.color, opacity: 0.6 }}>{moduleLabel}</span>
        </>
      )}

      <div style={{ flex: 1 }} />

      {/* Badge */}
      <span style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
        padding: '2px 8px', borderRadius: 999,
        border: `1px solid ${cfg.border}`, color: cfg.color, opacity: 0.65,
      }}>
        Contexto activo
      </span>

      {/* keyframes para el ping */}
      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
