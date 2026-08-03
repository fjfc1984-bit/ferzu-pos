// =============================================================================
// FERZU POS — RegisterPage
// Registro de nuevo negocio
// =============================================================================

import { useState } from 'react';
import { Eye, EyeOff, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/api.js';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';

export function RegisterPage() {
  const navigate = useNavigate();
  const [form,    setForm]    = useState({ name: '', email: '', password: '', confirm: '' });
  const [show,    setShow]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) { setError('Las contraseñas no coinciden'); return; }
    if (form.password.length < 8)       { setError('La contraseña debe tener al menos 8 caracteres'); return; }

    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email:    form.email.trim().toLowerCase(),
        password: form.password,
        options:  { data: { full_name: form.name.trim() } },
      });
      if (authError) throw authError;

      if (data?.user) {
        await supabase.from('users').upsert({
          id:        data.user.id,
          email:     data.user.email,
          full_name: form.name.trim(),
          role:      'owner',
        }, { onConflict: 'id' });
      }

      api.post('/auth/welcome-email', {
        email: form.email.trim().toLowerCase(),
        name:  form.name.trim(),
      }).catch(() => {});

      toast.success('¡Cuenta creada! Configura tu negocio.');
      navigate('/onboarding');
    } catch (err) {
      const msg = err.message || 'Error al crear la cuenta';
      setError(msg.includes('already registered') ? 'Ya existe una cuenta con ese correo. Inicia sesión.' : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-emerald-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-3 backdrop-blur-sm shadow-xl">
            <span className="text-white text-2xl font-black">F</span>
          </div>
          <h1 className="text-white text-2xl font-bold">Crea tu cuenta</h1>
          <p className="text-brand-300 text-sm mt-1">Registra tu negocio en FERZU POS</p>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-2xl">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
              <AlertCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-600">{typeof error === 'string' ? error : 'Error desconocido'}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Tu nombre completo</label>
              <input type="text" required autoFocus value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Carlos Gómez"
                className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-brand-400 transition-shadow" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Correo electrónico</label>
              <input type="email" required autoComplete="email" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="correo@tunegocio.com"
                className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-brand-400 transition-shadow" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Contraseña</label>
              <div className="relative">
                <input type={show ? 'text' : 'password'} required autoComplete="new-password"
                  value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
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
              <input type={show ? 'text' : 'password'} required autoComplete="new-password"
                value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                placeholder="Repite la contraseña"
                className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-brand-400 transition-shadow" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full h-11 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-brand-600/25 mt-2">
              {loading ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />}
              {loading ? 'Creando cuenta...' : 'Crear cuenta y continuar'}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">
              ¿Ya tienes cuenta?{' '}
              <Link to="/login" className="text-brand-600 font-medium hover:underline">Iniciar sesión</Link>
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

export default RegisterPage;
