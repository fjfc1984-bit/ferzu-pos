import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'

/**
 * Hook: gestiona las propuestas de IA (ai_proposals) para una sucursal.
 * Cumple la regla Human-in-the-loop: la IA solo propone, el humano aprueba.
 */
export function useAIProposals(branchId) {
  const [proposals, setProposals]   = useState([])
  const [isApproving, setApproving] = useState(false)

  // Cargar propuestas pendientes
  useEffect(() => {
    if (!branchId) return
    let mounted = true

    const load = async () => {
      const { data } = await supabase
        .from('ai_proposals')
        .select('*')
        .eq('branch_id', branchId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(20)
      if (mounted && data) setProposals(data)
    }

    load()

    // Suscripción Realtime — nombre único por instancia para evitar
    // "cannot add postgres_changes callbacks after subscribe()" cuando
    // el componente remonta antes de que removeChannel complete.
    const channelName = `ai_proposals:${branchId}:${Date.now()}`
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ai_proposals',
        filter: `branch_id=eq.${branchId}`,
      }, () => load())
      .subscribe()

    return () => { mounted = false; supabase.removeChannel(channel) }
  }, [branchId])

  const approve = useCallback(async ({ proposalId, notes = '' }) => {
    setApproving(true)
    try {
      await supabase
        .from('ai_proposals')
        .update({ status: 'approved', reviewed_at: new Date().toISOString(), review_notes: notes })
        .eq('id', proposalId)
      setProposals(prev => prev.filter(p => p.id !== proposalId))
    } finally {
      setApproving(false)
    }
  }, [])

  const reject = useCallback(async ({ proposalId, reason = '' }) => {
    setApproving(true)
    try {
      await supabase
        .from('ai_proposals')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString(), review_notes: reason })
        .eq('id', proposalId)
      setProposals(prev => prev.filter(p => p.id !== proposalId))
    } finally {
      setApproving(false)
    }
  }, [])

  return { proposals, approve, reject, isApproving }
}
