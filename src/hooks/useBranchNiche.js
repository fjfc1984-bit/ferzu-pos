// =============================================================================
// FERZU POS — useBranchNiche
// Hook para acceder al niche de la branch activa desde cualquier componente.
// Uso: const { branchNiche, isNiche } = useBranchNiche()
//
// branchNiche: 'general' | 'barbershop' | 'restaurant' | 'workshop' | 'minimarket'
// isNiche(key): true si el niche actual coincide con `key`
// nicheLabel:   nombre legible del niche
// =============================================================================

import { usePOS } from '../context/POSContext'

export const NICHE_LABELS = {
  general:    'General',
  barbershop: 'Barbería / Spa',
  restaurant: 'Restaurante',
  workshop:   'Taller',
  minimarket: 'Minimarket',
}

export function useBranchNiche() {
  const { branchNiche } = usePOS()
  const niche = branchNiche || localStorage.getItem('ferzu_branch_niche') || 'general'

  return {
    branchNiche:  niche,
    nicheLabel:   NICHE_LABELS[niche] || 'General',
    isNiche:      (key) => niche === key,
    isGeneral:    niche === 'general',
    // Helper para construir ?niche= en las llamadas a la API
    nicheParam:   niche !== 'general' ? `&niche=${niche}` : '',
  }
}
