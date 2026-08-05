// =============================================================================
// FERZU POS — ResetPasswordPage
// Cambio de contraseña tras clic en el email de recuperación
// Supabase redirige a /reset-password con el token en la URL
// =============================================================================

import { useState, useEffect } from 'react';
import { Shield, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { useNavigate } from 'react-router-dom';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [show,     setShow]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [ready,    setReady]    = useState(false);
  const [done,     setDone]     = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return; }
    if (password.length < 8)  { setError('La contraseña debe tener al menos 8 caracteres'); return; }

    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (err) {
      setError(err.message);
    } else {
      setDone(true);
      await supabase.auth.signOut();
      setTimeout(() => navigate('/login'), 2500);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 text-center">
          <CheckCircle2 size={44} className="text-emerald-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">¡Contraseña actualizada!</h2>
          <p className="text-sm text-gray-500">Redirigiendo al inicio de sesión...</p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 text-center">
          <Loader2 size={36} className="text-brand-500 animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-600 font-medium mb-1">Verificando enlace...</p>
          <p className="text-xs text-gray-400">Si el enlace expiró, solicita uno nuevo.</p>
          <button onClick={() => navigate('/forgot-password')}
            className="mt-5 text-xs text-brand-600 hover:underline">
            Solicitar nuevo enlace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-3 backdrop-blur-sm">
            <Shield size={24} className="text-white" />
          </div>
          <h1 className="text-white text-2xl font-bold">Nueva contraseña</h1>
          <p className="text-brand-200 text-sm mt-1">Elige una contraseña segura</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-6">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
              <AlertCircle size={14} className="text-red-500 shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Nueva contraseña</label>
              <div className="relative">
                <input type={show ? 'text' : 'password'} required autoFocus
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full h-11 border border-gray-200 rounded-xl px-3 pr-10 text-sm outline-none focus:ring-2 focus:ring-brand-400 transition-shadow" />
                <button type="button" onClick={() => setShow(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Confirmar contraseña</label>
              <input type={show ? 'text' : 'password'} required
                value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Repite la contraseña"
                className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-brand-400 transition-shadow" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full h-11 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors">
              {loading ? <Loader2 size={17} className="animate-spin" /> : <Shield size={17} />}
              {loading ? 'Actualizando...' : 'Cambiar contraseña'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ResetPasswordPage;
