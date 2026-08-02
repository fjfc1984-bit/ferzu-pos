// =============================================================================
// FERZU POS — Wizard de Configuración DIAN (post-pago)
// Ruta: /dian/setup
// 4 pasos: NIT → Resolución → PTA → Activar
// =============================================================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, ChevronRight, ChevronLeft, CheckCircle2,
  Loader2, ShieldCheck, Hash, Calendar, Building2,
  Zap, AlertTriangle, Check, ExternalLink,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import toast from 'react-hot-toast';

// Proveedores Tecnológicos Autorizados (PTAs) por la DIAN
const PTA_OPTIONS = [
  {
    id:   'siigo',
    name: 'Siigo',
    desc: 'El más popular en Colombia. API REST, soporte 24/7.',
    url:  'https://siigo.com',
  },
  {
    id:   'alegra',
    name: 'Alegra',
    desc: 'Fácil integración. Muy usado por pymes y emprendedores.',
    url:  'https://alegra.com',
  },
  {
    id:   'factura_tech',
    name: 'FacturaTech',
    desc: 'PTA especializado, precios competitivos para volumen.',
    url:  'https://facturatech.co',
  },
  {
    id:   'edicom',
    name: 'Edicom',
    desc: 'Solución empresarial con EDI. Para grandes volúmenes.',
    url:  'https://edicomgroup.com',
  },
  {
    id:   'otro',
    name: 'Otro PTA',
    desc: 'Tengo otro proveedor habilitado por la DIAN.',
    url:  null,
  },
];

const STEPS = [
  { key: 'nit',        label: 'NIT del negocio'   },
  { key: 'resolucion', label: 'Resolución DIAN'   },
  { key: 'pta',        label: 'Proveedor (PTA)'   },
  { key: 'activar',    label: 'Activar'            },
];

export default function DianSetupWizard() {
  const navigate = useNavigate();
  const { organizationId } = useAuth();

  const [step,    setStep]    = useState(0);
  const [saving,  setSaving]  = useState(false);
  const [orgData, setOrgData] = useState(null);

  // Formulario completo
  const [form, setForm] = useState({
    nit:                 '',
    nit_dv:              '',
    resolution_number:   '',
    prefix:              '',
    from_number:         '',
    to_number:           '',
    resolution_date:     '',
    resolution_end_date: '',
    pta_provider:        '',
    environment:         'test',
  });

  const [nitResult, setNitResult] = useState(null);
  const [nitLoading, setNitLoading] = useState(false);

  // Pre-cargar NIT si ya existe en la organización
  useEffect(() => {
    api.get('/dian/config').then(({ data }) => {
      if (data.org?.nit) {
        setForm(f => ({ ...f, nit: data.org.nit, nit_dv: data.org.nit_dv || '' }));
        setNitResult({ nit: data.org.nit, dv: data.org.nit_dv, isValid: true });
      }
      setOrgData(data.org);
      if (data.config) {
        // Ya tiene config — pre-llenar formulario
        const c = data.config;
        setForm(f => ({
          ...f,
          resolution_number:   c.resolution_number   || '',
          prefix:              c.prefix              || '',
          from_number:         c.from_number         || '',
          to_number:           c.to_number           || '',
          resolution_date:     c.resolution_date     ? c.resolution_date.slice(0,10)     : '',
          resolution_end_date: c.resolution_end_date ? c.resolution_end_date.slice(0,10) : '',
          pta_provider:        c.pta_provider        || '',
          environment:         c.environment         || 'test',
        }));
      }
    }).catch(() => {});
  }, []);

  function updateForm(key, value) {
    setForm(f => ({ ...f, [key]: value }));
  }

  // ── Paso 1: Validar NIT ────────────────────────────────────────────────────
  async function validateNIT() {
    const nit = form.nit.replace(/\D/g, '');
    if (!nit || nit.length < 5) { toast.error('Ingresa el NIT sin dígito verificador'); return; }
    setNitLoading(true);
    try {
      const { data } = await api.get(`/dian/validate-nit/${nit}`);
      setNitResult(data);
      setForm(f => ({ ...f, nit: data.nit, nit_dv: String(data.dv) }));
      if (data.isValid) toast.success(`NIT válido: ${data.formatted}`);
    } catch {
      toast.error('Error validando NIT');
    } finally {
      setNitLoading(false);
    }
  }

  // ── Guardar configuración final ───────────────────────────────────────────
  async function saveConfig() {
    setSaving(true);
    try {
      await api.post('/dian/setup', {
        ...form,
        from_number: Number(form.from_number),
        to_number:   Number(form.to_number),
      });
      toast.success('¡Facturación electrónica activada!');
      navigate('/dian');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error guardando configuración');
    } finally {
      setSaving(false);
    }
  }

  // ── Validaciones por paso ─────────────────────────────────────────────────
  function canNext() {
    if (step === 0) return nitResult?.isValid;
    if (step === 1) {
      return form.resolution_number && form.from_number &&
             form.to_number && form.resolution_end_date &&
             Number(form.from_number) < Number(form.to_number);
    }
    if (step === 2) return !!form.pta_provider;
    return true;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center">
            <FileText size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-900">Configurar Facturación Electrónica DIAN</h1>
            <p className="text-xs text-gray-400">Completa los 4 pasos para empezar a facturar electrónicamente</p>
          </div>
        </div>
      </div>

      {/* Stepper */}
      <div className="bg-white border-b border-gray-100 px-6 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.key}>
              <div className={`flex items-center gap-1.5 ${i <= step ? 'text-brand-700' : 'text-gray-300'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-colors ${
                  i < step  ? 'bg-brand-600 border-brand-600 text-white'
                  : i === step ? 'border-brand-600 text-brand-700'
                  : 'border-gray-200 text-gray-300'
                }`}>
                  {i < step ? <Check size={12} /> : i + 1}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${i <= step ? 'text-brand-700' : 'text-gray-400'}`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 ${i < step ? 'bg-brand-400' : 'bg-gray-200'}`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 flex items-start justify-center px-6 py-10">
        <div className="w-full max-w-xl">

          {/* ── Paso 1: NIT ── */}
          {step === 0 && (
            <StepCard
              icon={<ShieldCheck size={20} className="text-brand-600" />}
              title="NIT de tu negocio"
              desc="Ingresa el NIT sin el dígito verificador — lo calcularemos automáticamente."
            >
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1.5">NIT (sin dígito verificador)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={form.nit}
                      onChange={e => { updateForm('nit', e.target.value.replace(/\D/g, '')); setNitResult(null); }}
                      onKeyDown={e => e.key === 'Enter' && validateNIT()}
                      placeholder="Ej: 890903938"
                      className="flex-1 h-10 px-3 border border-gray-200 rounded-xl text-sm font-mono
                                 outline-none focus:ring-2 focus:ring-brand-400"
                    />
                    <button
                      onClick={validateNIT}
                      disabled={!form.nit || nitLoading}
                      className="px-4 h-10 bg-brand-600 hover:bg-brand-700 disabled:opacity-50
                                 text-white text-sm font-semibold rounded-xl flex items-center gap-2">
                      {nitLoading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                      Validar
                    </button>
                  </div>
                </div>

                {nitResult && (
                  <div className={`rounded-xl p-4 border-2 ${
                    nitResult.isValid ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      {nitResult.isValid
                        ? <CheckCircle2 size={15} className="text-green-600" />
                        : <AlertTriangle size={15} className="text-red-500" />
                      }
                      <span className={`text-sm font-bold ${nitResult.isValid ? 'text-green-700' : 'text-red-600'}`}>
                        {nitResult.isValid ? 'NIT válido' : 'NIT inválido'}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-gray-700">
                      <strong>NIT-DV:</strong> {nitResult.nit}-{nitResult.dv}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-1">{nitResult.message}</p>
                  </div>
                )}

                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                  <p className="text-[11px] text-blue-600 leading-relaxed">
                    <strong>¿Dónde encuentro mi NIT?</strong> En el RUT (Registro Único Tributario) de la DIAN.
                    Puedes consultarlo en <span className="font-mono">muisca.dian.gov.co</span> con tu cédula de ciudadanía.
                  </p>
                </div>
              </div>
            </StepCard>
          )}

          {/* ── Paso 2: Resolución ── */}
          {step === 1 && (
            <StepCard
              icon={<Hash size={20} className="text-brand-600" />}
              title="Datos de tu Resolución DIAN"
              desc="Estos datos están en la resolución que la DIAN te emitió para facturar electrónicamente."
            >
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Nº de Resolución</label>
                    <input
                      type="text"
                      value={form.resolution_number}
                      onChange={e => updateForm('resolution_number', e.target.value)}
                      placeholder="Ej: 18764046808777"
                      className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm font-mono
                                 outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Prefijo (opcional)</label>
                    <input
                      type="text"
                      value={form.prefix}
                      onChange={e => updateForm('prefix', e.target.value.toUpperCase())}
                      placeholder="Ej: FE, FV (o vacío)"
                      className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm font-mono
                                 outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Desde (número)</label>
                    <input
                      type="number"
                      value={form.from_number}
                      onChange={e => updateForm('from_number', e.target.value)}
                      placeholder="Ej: 1"
                      min="1"
                      className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm font-mono
                                 outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Hasta (número)</label>
                    <input
                      type="number"
                      value={form.to_number}
                      onChange={e => updateForm('to_number', e.target.value)}
                      placeholder="Ej: 5000"
                      min="1"
                      className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm font-mono
                                 outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">
                      <Calendar size={11} className="inline mr-1" />
                      Fecha de expedición
                    </label>
                    <input
                      type="date"
                      value={form.resolution_date}
                      onChange={e => updateForm('resolution_date', e.target.value)}
                      className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm
                                 outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">
                      <Calendar size={11} className="inline mr-1 text-amber-500" />
                      Fecha de vencimiento <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={form.resolution_end_date}
                      onChange={e => updateForm('resolution_end_date', e.target.value)}
                      required
                      className="w-full h-10 px-3 border border-amber-300 rounded-xl text-sm
                                 outline-none focus:ring-2 focus:ring-amber-400 bg-amber-50"
                    />
                  </div>
                </div>

                {form.from_number && form.to_number && Number(form.from_number) >= Number(form.to_number) && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertTriangle size={11} /> El número "desde" debe ser menor que "hasta"
                  </p>
                )}

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    <strong>¿Aún no tienes resolución DIAN?</strong> Debes solicitarla en <span className="font-mono">muisca.dian.gov.co</span> →
                    Factura Electrónica → Solicitar Habilitación. Tu PTA también puede ayudarte con este trámite.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1.5">Ambiente de facturación</label>
                  <div className="flex gap-2">
                    {[['test','🧪 Habilitación (pruebas)'],['1','🚀 Producción']].map(([val, lab]) => (
                      <button
                        key={val}
                        onClick={() => updateForm('environment', val)}
                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold border-2 transition-colors ${
                          form.environment === val
                            ? val === '1' ? 'border-green-500 bg-green-50 text-green-700' : 'border-brand-500 bg-brand-50 text-brand-700'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}>
                        {lab}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </StepCard>
          )}

          {/* ── Paso 3: PTA ── */}
          {step === 2 && (
            <StepCard
              icon={<Building2 size={20} className="text-brand-600" />}
              title="Proveedor Tecnológico Autorizado"
              desc="El PTA firma y transmite tus facturas a la DIAN. Selecciona el que estás usando o planeas usar."
            >
              <div className="space-y-2">
                {PTA_OPTIONS.map(pta => (
                  <button
                    key={pta.id}
                    onClick={() => updateForm('pta_provider', pta.id)}
                    className={`w-full flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-colors ${
                      form.pta_provider === pta.id
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                      form.pta_provider === pta.id ? 'border-brand-500 bg-brand-500' : 'border-gray-300'
                    }`}>
                      {form.pta_provider === pta.id && <Check size={10} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-900">{pta.name}</span>
                        {pta.url && (
                          <a
                            href={pta.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-[10px] text-brand-500 flex items-center gap-0.5 hover:underline">
                            Ver sitio <ExternalLink size={9} />
                          </a>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5">{pta.desc}</p>
                    </div>
                  </button>
                ))}

                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mt-3">
                  <p className="text-[11px] text-blue-600">
                    <strong>Nota:</strong> Tu PTA es quien conecta FERZU con la DIAN. Necesitarás crear una cuenta con ellos
                    y configurar las credenciales API en el panel de integraciones de FERZU (próximamente).
                  </p>
                </div>
              </div>
            </StepCard>
          )}

          {/* ── Paso 4: Confirmar ── */}
          {step === 3 && (
            <StepCard
              icon={<Zap size={20} className="text-brand-600" />}
              title="Confirmar y activar"
              desc="Revisa los datos antes de activar la facturación electrónica."
            >
              <div className="space-y-3">
                <SummaryRow label="NIT"           value={`${form.nit}-${form.nit_dv}`} />
                <SummaryRow label="Resolución"    value={form.resolution_number} />
                <SummaryRow label="Prefijo"       value={form.prefix || '(sin prefijo)'} />
                <SummaryRow label="Rango"         value={`${form.from_number} – ${form.to_number} (${Number(form.to_number)-Number(form.from_number)+1} facturas)`} />
                <SummaryRow label="Vence"         value={form.resolution_end_date} />
                <SummaryRow label="PTA"           value={PTA_OPTIONS.find(p => p.id === form.pta_provider)?.name || form.pta_provider} />
                <SummaryRow label="Ambiente"      value={form.environment === '1' ? '🚀 Producción' : '🧪 Habilitación (pruebas)'} />

                {form.environment === '1' && (
                  <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-start gap-2">
                    <AlertTriangle size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-[11px] text-amber-700">
                      <strong>Ambiente de producción:</strong> Las facturas emitidas serán documentos legales reales.
                      Asegúrate de haber completado el proceso de habilitación con la DIAN y tu PTA antes de proceder.
                    </p>
                  </div>
                )}

                <button
                  onClick={saveConfig}
                  disabled={saving}
                  className="w-full h-12 bg-brand-600 hover:bg-brand-700 disabled:opacity-60
                             text-white font-bold rounded-2xl flex items-center justify-center gap-2
                             transition-colors mt-4">
                  {saving
                    ? <><Loader2 size={18} className="animate-spin" /> Activando…</>
                    : <><Zap size={18} /> Activar Facturación Electrónica</>
                  }
                </button>
              </div>
            </StepCard>
          )}

          {/* Navegación */}
          <div className="flex items-center justify-between mt-6">
            <button
              onClick={() => step > 0 ? setStep(s => s - 1) : navigate('/dian')}
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-500 hover:text-gray-700
                         border border-gray-200 rounded-xl hover:border-gray-300 transition-colors">
              <ChevronLeft size={15} />
              {step === 0 ? 'Cancelar' : 'Atrás'}
            </button>

            {step < 3 && (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canNext()}
                className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold
                           bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white
                           rounded-xl transition-colors">
                Siguiente
                <ChevronRight size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Componentes auxiliares ────────────────────────────────────────────────────

function StepCard({ icon, title, desc, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-900">{value}</span>
    </div>
  );
}
