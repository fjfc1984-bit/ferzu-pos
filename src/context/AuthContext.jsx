// =============================================================================
// FERZU POS — AuthContext
// Contexto global de autenticación, sesión, PIN lock e inactividad
// =============================================================================

import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { Zap } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { PINLockScreen } from '../pages/auth/PINLockScreen.jsx';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,           setUser]           = useState(null);
  const [organizationId, setOrganizationId] = useState(null);
  const [branchId,       setBranchId]       = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [showPINLock,    setShowPINLock]    = useState(false);

  // Temporizador de inactividad: 5 minutos → mostrar PIN
  const inactivityTimer = useRef(null);
  const INACTIVITY_MS   = 5 * 60 * 1000;

  function resetInactivityTimer() {
    clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      setShowPINLock(true);
    }, INACTIVITY_MS);
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await loadUserProfile(session.user.id);
        resetInactivityTimer();
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setOrganizationId(null);
        setBranchId(null);
        clearTimeout(inactivityTimer.current);
      } else if (session?.user) {
        await loadUserProfile(session.user.id);
        resetInactivityTimer();
      }
    });

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, resetInactivityTimer, { passive: true }));

    return () => {
      subscription.unsubscribe();
      clearTimeout(inactivityTimer.current);
      events.forEach(e => window.removeEventListener(e, resetInactivityTimer));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadUserProfile(userId) {
    const { data } = await supabase
      .from('users')
      .select(`
        id, full_name, email, role,
        organization_id,
        organizations(id, business_name, business_type, onboarding_completed, plan_id, enabled_modules, trial_ends_at),
        user_branches(branch_id)
      `)
      .eq('id', userId)
      .single();

    if (data) {
      setUser(data);
      setOrganizationId(data.organization_id);
      const storedBranch = localStorage.getItem('ferzu_branch_id');
      if (storedBranch) {
        setBranchId(storedBranch);
      } else if (data.user_branches?.[0]?.branch_id) {
        const firstBranch = data.user_branches[0].branch_id;
        setBranchId(firstBranch);
        localStorage.setItem('ferzu_branch_id', firstBranch);
      }
    }
  }

  async function signOut() {
    localStorage.removeItem('ferzu_branch_id');
    localStorage.removeItem('ferzu_branch_name');
    await supabase.auth.signOut();
  }

  function handlePINUnlock(unlockedUser) {
    setShowPINLock(false);
    if (unlockedUser) setUser(unlockedUser);
    resetInactivityTimer();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Zap size={32} className="text-brand-500 mx-auto mb-3 animate-pulse" />
          <p className="text-sm text-gray-400">Cargando FERZU...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{
      user, organizationId, branchId, setBranchId,
      signOut,
      logout: signOut,
      isAuthenticated: !!user,
      loading: false,
      pinLocked: showPINLock,
      isAdmin: user?.role === 'owner' || user?.role === 'admin',
    }}>
      {children}
      {showPINLock && user && (
        <PINLockScreen
          currentUser={user}
          onUnlock={handlePINUnlock}
        />
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
