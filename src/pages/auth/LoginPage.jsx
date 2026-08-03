// =============================================================================
// FERZU POS — LoginPage
// Autenticación con Supabase Auth
// =============================================================================

import { useState } from 'react';
import { Eye, EyeOff, LogIn, Loader2, AlertCircle, Zap } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { useNavigate, Link } from 'react-router-dom';

export function LoginPage() {
  const navigate = useNavigate();
  const [form,    setForm]    = useState({ email: '', password: '' });
  const [show,    setShow]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email:    form.email.trim().toLowerCase(),
      password: form.password,
    });

    if (authError) {
      setLoading(false);
      setError(
        authError.message.includes('Invalid login')
          ? 'Correo o contraseña incorrectos'
          : authError.message
      );
      return;
    }

    const { data: userData } = await supabase
      .from('users')
      .select('organization_id, role, organizations(onboarding_completed)')
      .eq('id', data.user.id)
      .single();

    setLoading(false);

    const hasOrg    = !!userData?.organization_id;
    const doneSetup = !!userData?.organizations?.onboarding_completed;

    if (hasOrg && doneSetup) {
      navigate('/branch-select');
    } else {
      navigate('/onboarding');
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white/10 rounded-3xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
            <Zap size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">FERZU POS</h1>
          <p className="text-brand-200 text-sm mt-1">Sistema de punto de venta inteligente</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">Iniciar sesión</h2>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
              <AlertCircle size={14} className="text-red-500 shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Correo electrónico</label>
              <input
                type="email" required autoComplete="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="usuario@empresa.com"
                className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-brand-400 transition-shadow"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Contraseña</label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'} required autoComplete="current-password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                  className="w-full h-11 border border-gray-200 rounded-xl px-3 pr-10 text-sm outline-none focus:ring-2 focus:ring-brand-400 transition-shadow"
                />
                <button type="button" onClick={() => setShow(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full h-11 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors">
              {loading ? <Loader2 size={17} className="animate-spin" /> : <LogIn size={17} />}
              {loading ? 'Verificando...' : 'Entrar'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link to="/forgot-password" className="text-xs text-brand-600 hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

          <div className="mt-5 pt-4 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">
              ¿Sin cuenta?{' '}
              <Link to="/register" className="text-brand-600 font-medium hover:underline">
                Registrar organización
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-brand-300 text-[11px] mt-6">
          Datos protegidos bajo Ley 1581 de 2012 · Colombia
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
