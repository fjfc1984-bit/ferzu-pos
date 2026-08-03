// =============================================================================
// FERZU POS — OnboardingWizard
// Setup inicial de nueva organización (5 pasos)
// =============================================================================

import React, { useState, useEffect } from 'react';
import {
  ChevronRight, ChevronLeft, Building2, MapPin, FileText, Package,
  CheckCircle2, Loader2, Scissors, Utensils, ShoppingCart, Wrench, Store, Zap
} from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/api.js';
import { usePOS } from '../../context/POSContext.jsx';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

// ---------------------------------------------------------------------------
// Datos estáticos — ciudades Colombia
// ---------------------------------------------------------------------------
const CIUDADES_CO = [
  { ciudad: 'Bogotá',           depto: 'Cundinamarca'       },
  { ciudad: 'Medellín',         depto: 'Antioquia'          },
  { ciudad: 'Cali',             depto: 'Valle del Cauca'    },
  { ciudad: 'Barranquilla',     depto: 'Atlántico'          },
  { ciudad: 'Cartagena',        depto: 'Bolívar'            },
  { ciudad: 'Cúcuta',           depto: 'Norte de Santander' },
  { ciudad: 'Soledad',          depto: 'Atlántico'          },
  { ciudad: 'Ibagué',           depto: 'Tolima'             },
  { ciudad: 'Bucaramanga',      depto: 'Santander'          },
  { ciudad: 'Soacha',           depto: 'Cundinamarca'       },
  { ciudad: 'Santa Marta',      depto: 'Magdalena'          },
  { ciudad: 'Villavicencio',    depto: 'Meta'               },
  { ciudad: 'Bello',            depto: 'Antioquia'          },
  { ciudad: 'Pereira',          depto: 'Risaralda'          },
  { ciudad: 'Manizales',        depto: 'Caldas'             },
  { ciudad: 'Pasto',            depto: 'Nariño'             },
  { ciudad: 'Neiva',            depto: 'Huila'              },
  { ciudad: 'Armenia',          depto: 'Quindío'            },
  { ciudad: 'Montería',         depto: 'Córdoba'            },
  { ciudad: 'Valledupar',       depto: 'Cesar'              },
  { ciudad: 'Itagüí',           depto: 'Antioquia'          },
  { ciudad: 'Buenaventura',     depto: 'Valle del Cauca'    },
  { ciudad: 'Palmira',          depto: 'Valle del Cauca'    },
  { ciudad: 'Floridablanca',    depto: 'Santander'          },
  { ciudad: 'Sincelejo',        depto: 'Sucre'              },
  { ciudad: 'Popayán',          depto: 'Cauca'              },
  { ciudad: 'Envigado',         depto: 'Antioquia'          },
  { ciudad: 'Barrancabermeja',  depto: 'Santander'          },
  { ciudad: 'Dosquebradas',     depto: 'Risaralda'          },
  { ciudad: 'Riohacha',         depto: 'La Guajira'         },
  { ciudad: 'Tunja',            depto: 'Boyacá'             },
  { ciudad: 'Quibdó',           depto: 'Chocó'              },
  { ciudad: 'Florencia',        depto: 'Caquetá'            },
  { ciudad: 'Yumbo',            depto: 'Valle del Cauca'    },
  { ciudad: 'Zipaquirá',        depto: 'Cundinamarca'       },
  { ciudad: 'Girardot',         depto: 'Cundinamarca'       },
  { ciudad: 'Facatativá',       depto: 'Cundinamarca'       },
  { ciudad: 'Chía',             depto: 'Cundinamarca'       },
  { ciudad: 'Mosquera',         depto: 'Cundinamarca'       },
  { ciudad: 'Madrid',           depto: 'Cundinamarca'       },
  { ciudad: 'Fusagasugá',       depto: 'Cundinamarca'       },
  { ciudad: 'Rionegro',         depto: 'Antioquia'          },
  { ciudad: 'Sabaneta',         depto: 'Antioquia'          },
  { ciudad: 'Apartadó',         depto: 'Antioquia'          },
  { ciudad: 'Turbo',            depto: 'Antioquia'          },
  { ciudad: 'Maicao',           depto: 'La Guajira'         },
  { ciudad: 'Magangué',         depto: 'Bolívar'            },
  { ciudad: 'Lorica',           depto: 'Córdoba'            },
  { ciudad: 'Cereté',           depto: 'Córdoba'            },
  { ciudad: 'Sahagún',          depto: 'Córdoba'            },
];

const NICHES = [
  { key: 'restaurant', label: 'Restaurante', icon: Utensils,    desc: 'Mesas, cocina, comandas'          },
  { key: 'barbershop', label: 'Barbería',    icon: Scissors,    desc: 'Citas, estilistas, comisiones'    },
  { key: 'minimarket', label: 'Minimarket',  icon: ShoppingCart, desc: 'Inventario, balanza, lotes'      },
  { key: 'workshop',   label: 'Taller',      icon: Wrench,      desc: 'Órdenes de trabajo, repuestos'   },
  { key: 'retail',     label: 'Tienda',      icon: Store,       desc: 'Ventas, inventario, clientes'     },
  { key: 'mixed',      label: 'Otro / Mixto', icon: Zap,        desc: 'Configura a tu medida'            },
];

// ---------------------------------------------------------------------------
// Sub-componentes privados del wizard
// ---------------------------------------------------------------------------
function OnboardingStep({ title, icon, children }) {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center">
          {React.cloneElement(icon, { size: 18 })}
        </div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 mb-1.5 block">{label}</label>
      <input
        type={type} value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-brand-400 transition-shadow"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// OnboardingWizard — componente principal
// ---------------------------------------------------------------------------
export function OnboardingWizard() {
  const navigate = useNavigate();
  const { dispatch: posDispatch } = usePOS();
  const [step,   setStep]   = useState(1);
  const [saving, setSaving] = useState(false);
  const TOTAL_STEPS = 5;

  // Guard: si el negocio ya está configurado, saltar al POS
  useEffect(() => {
    async function checkAlreadySetup() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id, organizations(onboarding_completed)')
        .eq('id', user.id)
        .single();

      const orgId     = userData?.organization_id;
      const doneSetup = userData?.organizations?.onboarding_completed;
      if (!orgId || !doneSetup) return;

      const { count } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('is_active', true);

      if (count > 0) navigate('/branch-select', { replace: true });
    }
    checkAlreadySetup();
  }, [navigate]);

  const [org, setOrg] = useState({
    business_name: '', nit: '', phone: '', email: '',
    business_type: '',
    branch_name: 'Sede Principal', address: '', city: '', department: '',
    dian_resolution_number: '', dian_prefix: '', dian_from_number: '',
    dian_to_number: '', dian_resolution_date: '', pta_provider: 'alegra', skip_dian: false,
    first_product_name: '', first_product_price: '', first_product_sku: '',
  });

  function update(fields) { setOrg(o => ({ ...o, ...fields })); }
  function next() { if (step < TOTAL_STEPS) setStep(s => s + 1); }
  function back() { if (step > 1) setStep(s => s - 1); }

  const canNext = {
    1: org.business_name && org.nit && org.phone,
    2: org.business_type,
    3: org.branch_name && org.address && org.city,
    4: org.skip_dian || (org.dian_resolution_number && org.dian_prefix && org.dian_from_number && org.dian_to_number && org.dian_resolution_date),
    5: true,
  };

  async function handleFinish() {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No hay sesión activa. Vuelve a iniciar sesión.');

      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${API_BASE}/onboarding/setup`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          business_name:          org.business_name,
          nit:                    org.nit,
          phone:                  org.phone,
          email:                  org.email,
          business_type:          org.business_type,
          branch_name:            org.branch_name,
          address:                org.address,
          city:                   org.city,
          department:             org.department,
          skip_dian:              org.skip_dian,
          dian_resolution_number: org.dian_resolution_number,
          dian_prefix:            org.dian_prefix,
          dian_from_number:       org.dian_from_number,
          dian_to_number:         org.dian_to_number,
          dian_resolution_date:   org.dian_resolution_date,
          pta_provider:           org.pta_provider,
          first_product_name:     org.first_product_name,
          first_product_price:    org.first_product_price,
          first_product_sku:      org.first_product_sku,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Error al configurar la organización');

      localStorage.setItem('ferzu_branch_id',   result.branchId);
      localStorage.setItem('ferzu_branch_name', result.branchName);
      posDispatch({ type: 'SET_BRANCH', payload: result.branchId });
      toast.success('¡Organización configurada! Bienvenido a FERZU POS 🎉');
      navigate('/pos');
    } catch (err) {
      toast.error(err.message || 'Error al guardar. Intenta de nuevo.');
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-sm font-medium text-gray-500">Configuración inicial</h1>
            <span className="text-sm text-gray-400">Paso {step} de {TOTAL_STEPS}</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full">
            <div className="h-1.5 bg-brand-500 rounded-full transition-all duration-500"
              style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Paso 1: Empresa */}
          {step === 1 && (
            <OnboardingStep title="Tu empresa" icon={<Building2 className="text-brand-500" />}>
              <div className="space-y-4">
                <Field label="Nombre del negocio *" value={org.business_name}
                  onChange={v => update({ business_name: v })} placeholder="Ej: Restaurante El Buen Sabor" />
                <Field label="NIT *" value={org.nit}
                  onChange={v => update({ nit: v })} placeholder="900.123.456-7" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Teléfono *" value={org.phone}
                    onChange={v => update({ phone: v })} placeholder="300 123 4567" />
                  <Field label="Correo" value={org.email} type="email"
                    onChange={v => update({ email: v })} placeholder="info@empresa.com" />
                </div>
              </div>
            </OnboardingStep>
          )}

          {/* Paso 2: Tipo de negocio */}
          {step === 2 && (
            <OnboardingStep title="¿Qué tipo de negocio es?" icon={<Store className="text-brand-500" />}>
              <div className="grid grid-cols-2 gap-3">
                {NICHES.map(niche => {
                  const Icon = niche.icon;
                  const selected = org.business_type === niche.key;
                  return (
                    <button key={niche.key} onClick={() => update({ business_type: niche.key })}
                      className={`text-left p-3 rounded-2xl border-2 transition-all ${
                        selected ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-200'
                      }`}>
                      <Icon size={20} className={selected ? 'text-brand-600' : 'text-gray-400'} />
                      <p className={`font-medium text-sm mt-1.5 ${selected ? 'text-brand-800' : 'text-gray-700'}`}>{niche.label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{niche.desc}</p>
                    </button>
                  );
                })}
              </div>
            </OnboardingStep>
          )}

          {/* Paso 3: Sucursal */}
          {step === 3 && (
            <OnboardingStep title="Sucursal principal" icon={<MapPin className="text-brand-500" />}>
              <div className="space-y-4">
                <Field label="Nombre de la sucursal" value={org.branch_name}
                  onChange={v => update({ branch_name: v })} placeholder="Sede Principal" />
                <Field label="Dirección *" value={org.address}
                  onChange={v => update({ address: v })} placeholder="Calle 123 # 45-67" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-600">Ciudad *</label>
                    <select value={org.city}
                      onChange={e => {
                        const opt = CIUDADES_CO.find(c => c.ciudad === e.target.value);
                        update({ city: e.target.value, department: opt?.depto || org.department });
                      }}
                      className="h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white text-gray-900">
                      <option value="">Selecciona ciudad…</option>
                      {CIUDADES_CO.map(c => (
                        <option key={c.ciudad} value={c.ciudad}>{c.ciudad}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-600">Departamento</label>
                    <input readOnly value={org.department} placeholder="(auto)"
                      className="h-10 px-3 rounded-xl border border-gray-200 text-sm bg-gray-50 text-gray-500 cursor-not-allowed" />
                  </div>
                </div>
              </div>
            </OnboardingStep>
          )}

          {/* Paso 4: DIAN */}
          {step === 4 && (
            <OnboardingStep title="Facturación electrónica DIAN" icon={<FileText className="text-brand-500" />}>
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                  💡 Necesitas una resolución de facturación vigente del portal DIAN. Si aún no la tienes, puedes omitir este paso.
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={org.skip_dian}
                    onChange={e => update({ skip_dian: e.target.checked })} className="rounded" />
                  <span className="text-sm text-gray-600">Omitir por ahora (configurar después)</span>
                </label>
                {!org.skip_dian && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="N° resolución" value={org.dian_resolution_number}
                        onChange={v => update({ dian_resolution_number: v })} placeholder="18760000001" />
                      <Field label="Prefijo" value={org.dian_prefix}
                        onChange={v => update({ dian_prefix: v })} placeholder="FE" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Desde" value={org.dian_from_number}
                        onChange={v => update({ dian_from_number: v })} placeholder="1" type="number" />
                      <Field label="Hasta" value={org.dian_to_number}
                        onChange={v => update({ dian_to_number: v })} placeholder="100000" type="number" />
                    </div>
                    <Field label="Fecha resolución" value={org.dian_resolution_date}
                      onChange={v => update({ dian_resolution_date: v })} type="date" />
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1.5 block">Proveedor tecnológico (PTA)</label>
                      <div className="flex gap-2">
                        {['alegra', 'siigo', 'custom'].map(p => (
                          <button key={p} onClick={() => update({ pta_provider: p })}
                            className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors capitalize ${
                              org.pta_provider === p ? 'bg-brand-600 text-white border-brand-600' : 'bg-gray-50 text-gray-600 border-gray-200'
                            }`}>
                            {p === 'custom' ? 'Otro' : p.charAt(0).toUpperCase() + p.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </OnboardingStep>
          )}

          {/* Paso 5: Primer producto */}
          {step === 5 && (
            <OnboardingStep title="Añade tu primer producto" icon={<Package className="text-brand-500" />}>
              <div className="space-y-4">
                <div className="bg-brand-50 border border-brand-200 rounded-xl p-3 text-xs text-brand-800">
                  ✨ Opcional. Puedes agregar todos tus productos desde el módulo de Inventario.
                </div>
                <Field label="Nombre del producto" value={org.first_product_name}
                  onChange={v => update({ first_product_name: v })} placeholder="Ej: Café americano" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Precio (COP)" value={org.first_product_price}
                    onChange={v => update({ first_product_price: v })} placeholder="5000" type="number" />
                  <Field label="SKU / Código" value={org.first_product_sku}
                    onChange={v => update({ first_product_sku: v })} placeholder="CAF-001" />
                </div>
              </div>
            </OnboardingStep>
          )}

          {/* Navegación */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            {step > 1 ? (
              <button onClick={back}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                <ChevronLeft size={16} /> Atrás
              </button>
            ) : <div />}

            {step < TOTAL_STEPS ? (
              <button onClick={next} disabled={!canNext[step]}
                className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors">
                Siguiente <ChevronRight size={16} />
              </button>
            ) : (
              <button onClick={handleFinish} disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {saving ? 'Configurando...' : '¡Empezar a vender!'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default OnboardingWizard;
