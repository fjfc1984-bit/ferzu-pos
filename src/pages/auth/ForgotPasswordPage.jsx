// =============================================================================
// FERZU POS — ForgotPasswordPage
// Recuperación de contraseña por email
// =============================================================================

import { useState } from 'react';
import { Lock, ArrowRight, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { useNavigate } from 'react-router-dom';

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/reset-password` }
    );
    setLoading(false);
    if (err) { setError(err.message); } else { setSent(true); }
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 text-center">
          <CheckCircle2 size={40} className="text-brand-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Revisa tu correo</h2>
          <p className="text-sm text-gray-500 mb-6">
            Te enviamos un enlace para restablecer tu contraseña a <strong>{email}</strong>.
          </p>
          <button onClick={() => navigate('/login')}
            className="w-full h-11 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors">
            Volver al inicio de sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Lock size={24} className="text-white" />
          </div>
          <h1 className="text-white text-2xl font-bold">¿Olvidaste tu contraseña?</h1>
          <p className="text-brand-200 text-sm mt-1">Te enviamos un enlace de recuperación</p>
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
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Correo de tu cuenta</label>
              <input type="email" required autoFocus value={email}
                onChange={e => setEmail(e.target.value)} placeholder="usuario@empresa.com"
                className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-brand-400 transition-shadow" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full h-11 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors">
              {loading ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />}
              {loading ? 'Enviando...' : 'Enviar enlace'}
            </button>
          </form>
          <div className="mt-4 text-center">
            <button onClick={() => navigate('/login')} className="text-xs text-brand-600 hover:underline">
              ← Volver al inicio de sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
