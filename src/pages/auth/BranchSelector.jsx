// =============================================================================
// FERZU POS — BranchSelector
// Selección de sucursal al iniciar sesión
// Fallback doble: user_branches → org branches (cubre casos de RLS)
// =============================================================================

import { useState, useEffect } from 'react';
import { Building2, MapPin, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { useNavigate } from 'react-router-dom';

export function BranchSelector() {
  const navigate  = useNavigate();
  const [branches, setBranches] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/login'); return; }

      // Intento 1: user_branches (puede quedar vacío por RLS en cuentas nuevas)
      const { data: ubData } = await supabase
        .from('user_branches')
        .select('branch_id, branches(id, name, address, city, is_active, metadata)')
        .eq('user_id', user.id);

      let activeBranches = (ubData || [])
        .map(r => r.branches)
        .filter(b => b?.is_active);

      // Intento 2 (fallback): buscar via organización directamente
      if (activeBranches.length === 0) {
        const { data: userData } = await supabase
          .from('users')
          .select('organization_id')
          .eq('id', user.id)
          .maybeSingle();

        if (userData?.organization_id) {
          const { data: orgBranches } = await supabase
            .from('branches')
            .select('id, name, address, city, is_active, metadata')
            .eq('organization_id', userData.organization_id)
            .eq('is_active', true);
          activeBranches = orgBranches || [];
        }
      }

      if (activeBranches.length === 0) {
        navigate('/onboarding');
        return;
      }

      if (activeBranches.length === 1) {
        localStorage.setItem('ferzu_branch_id',   activeBranches[0].id);
        localStorage.setItem('ferzu_branch_name', activeBranches[0].name);
        navigate('/pos');
        return;
      }

      setBranches(activeBranches);
      setLoading(false);
    }
    load();
  }, [navigate]);

  function selectBranch(branch) {
    localStorage.setItem('ferzu_branch_id',   branch.id);
    localStorage.setItem('ferzu_branch_name', branch.name);
    navigate('/pos');
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 size={24} className="animate-spin text-brand-500" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 to-brand-600 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Building2 size={36} className="text-white mx-auto mb-3" />
          <h2 className="text-2xl font-bold text-white">¿Desde qué sucursal?</h2>
          <p className="text-brand-200 text-sm mt-1">Selecciona la sucursal donde vas a trabajar hoy</p>
        </div>

        <div className="space-y-3">
          {branches.map(branch => (
            <button key={branch.id} onClick={() => selectBranch(branch)}
              className="w-full bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 rounded-2xl p-4 text-left transition-all hover:scale-[1.01] active:scale-[0.99] group">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white">{branch.name}</p>
                  <p className="text-brand-200 text-xs mt-0.5 flex items-center gap-1">
                    <MapPin size={10} />
                    {branch.city} · {branch.address}
                  </p>
                </div>
                <ChevronRight size={18} className="text-white/50 group-hover:text-white transition-colors" />
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={() => supabase.auth.signOut().then(() => navigate('/login'))}
          className="mt-6 w-full text-center text-brand-200 hover:text-white text-xs transition-colors">
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

export default BranchSelector;
