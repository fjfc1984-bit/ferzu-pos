// =============================================================================
// FERZU POS — PINLockScreen
// Se muestra cuando la caja lleva 5 min inactiva o al cambiar de cajero
// =============================================================================

import { useState, useEffect } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import toast from 'react-hot-toast';

export function PINLockScreen({ onUnlock, currentUser }) {
  const [digits,  setDigits]  = useState([]);
  const [shake,   setShake]   = useState(false);
  const [loading, setLoading] = useState(false);
  const PIN_LENGTH = 4;

  const [attempts,      setAttempts]      = useState(0);
  const [lockedUntil,   setLockedUntil]   = useState(null);
  const [lockCountdown, setLockCountdown] = useState(0);
  const LOCK_AFTER = 5;
  const LOCK_MS    = 5 * 60 * 1000;

  useEffect(() => {
    if (!lockedUntil) return;
    const tick = setInterval(() => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockedUntil(null);
        setLockCountdown(0);
        setAttempts(0);
      } else {
        setLockCountdown(remaining);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [lockedUntil]);

  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'DEL'];

  function handleKey(k) {
    if (loading || lockedUntil) return;
    if (k === 'DEL') { setDigits(d => d.slice(0, -1)); return; }
    if (digits.length >= PIN_LENGTH) return;
    const next = [...digits, k];
    setDigits(next);
    if (next.length === PIN_LENGTH) verifyPIN(next.join(''));
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key >= '0' && e.key <= '9') handleKey(Number(e.key));
      if (e.key === 'Backspace') handleKey('DEL');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [digits, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  async function verifyPIN(pin) {
    setLoading(true);
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE}/auth/verify-pin`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ pin }),
      });
      const json = await res.json();
      if (json.valid) {
        onUnlock(json.user);
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setShake(true);
        setDigits([]);
        setTimeout(() => setShake(false), 600);
        if (newAttempts >= LOCK_AFTER) {
          const until = Date.now() + LOCK_MS;
          setLockedUntil(until);
          setLockCountdown(LOCK_MS / 1000);
          toast.error('Demasiados intentos. Bloqueado 5 minutos.');
        }
      }
    } catch {
      toast.error('Error de conexión');
      setDigits([]);
    } finally {
      setLoading(false);
    }
  }

  const locked = !!lockedUntil;

  return (
    <div className="fixed inset-0 bg-gray-950/95 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-brand-600 flex items-center justify-center text-2xl font-bold text-white mx-auto mb-3">
          {currentUser?.full_name?.[0]?.toUpperCase() || '?'}
        </div>
        <p className="text-white font-semibold mb-1">{currentUser?.full_name || 'Cajero'}</p>
        <p className="text-gray-400 text-sm mb-6">Ingresa tu PIN para continuar</p>

        <div className={`flex justify-center gap-3 mb-6 transition-transform ${shake ? 'animate-shake' : ''}`}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
              i < digits.length ? 'bg-brand-400 border-brand-400 scale-110' : 'bg-transparent border-gray-500'
            }`} />
          ))}
        </div>

        {locked ? (
          <div className="text-red-400 text-sm flex items-center gap-2 justify-center">
            <Lock size={15} /> Bloqueado. Contacta al administrador.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 w-56 mx-auto">
            {keys.map((k, i) => {
              if (k === null) return <div key={i} />;
              return (
                <button key={i} onClick={() => handleKey(k)} disabled={loading}
                  className={`h-14 rounded-2xl font-semibold text-lg transition-all active:scale-90 ${
                    k === 'DEL' ? 'bg-gray-800 text-gray-400 hover:bg-gray-700 text-sm' : 'bg-gray-800 text-white hover:bg-gray-700'
                  }`}>
                  {k === 'DEL' ? '⌫' : k}
                </button>
              );
            })}
          </div>
        )}

        {loading && (
          <div className="mt-4 flex items-center justify-center gap-2 text-gray-400 text-sm">
            <Loader2 size={14} className="animate-spin" /> Verificando...
          </div>
        )}
        {locked && (
          <p className="mt-3 text-red-400 text-xs font-medium">
            🔒 Bloqueado — intenta de nuevo en {Math.floor(lockCountdown / 60)}:{String(lockCountdown % 60).padStart(2, '0')} min
          </p>
        )}
        {!locked && attempts > 0 && (
          <p className="mt-3 text-red-400 text-xs">
            PIN incorrecto · {LOCK_AFTER - attempts} intento(s) restante(s)
          </p>
        )}

        <button
          onClick={async () => {
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (user) await supabase.from('users').update({ pin_hash: null }).eq('id', user.id);
            } catch { /* continúa */ }
            await supabase.auth.signOut();
            window.location.href = '/login';
          }}
          className="mt-6 text-gray-500 hover:text-gray-300 text-xs underline underline-offset-2 transition-colors">
          Olvidé mi PIN · Cerrar sesión
        </button>
      </div>
    </div>
  );
}

export default PINLockScreen;
