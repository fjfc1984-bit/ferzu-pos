// =============================================================================
// FERZU POS — BatchVATClassifier
// Archivo: src/components/dian/BatchVATClassifier.jsx
// =============================================================================
// Modal de clasificación IVA masiva.
// Flujo:
//   1. "Clasificar IVA" → muestra productos sin tarifa (vat_rate = 0)
//   2. Llama a POST /api/dian/batch-classify en lotes de hasta 50
//   3. Muestra resultados con confianza y permite aceptar / sobrescribir
//   4. "Aplicar" guarda vat_rate en Supabase para cada producto aceptado
// =============================================================================

import React, { useState, useMemo } from 'react';
import {
  Sparkles, X, Loader2, CheckCircle2, AlertTriangle,
  ChevronDown, Check, Info, XCircle, Save,
} from 'lucide-react';
import { api }      from '../../lib/api.js';
import { supabase } from '../../lib/supabase.js';
import toast        from 'react-hot-toast';

// ── Constantes ────────────────────────────────────────────────────────────────
const RATE_LABELS = {
  0:  '0% — Exento',
  5:  '5% — Diferencial',
  8:  '8% INC — Restaurante',
  19: '19% — General',
};

const CONFIDENCE_STYLES = {
  high:   { bg: 'bg-green-100 text-green-700 border-green-200', label: 'Alta'   },
  medium: { bg: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Media'  },
  low:    { bg: 'bg-red-100   text-red-600   border-red-200',   label: 'Baja'   },
};

// =============================================================================
// BatchVATClassifier — Componente principal
// =============================================================================
// Props:
//   products        — lista de todos los productos (del ProductList)
//   onClose         — cerrar el modal
//   onSaved         — callback cuando se guardaron cambios (para recargar lista)
// =============================================================================
export default function BatchVATClassifier({ products, onClose, onSaved }) {
  // ── Fase: 'preview' | 'classifying' | 'review' | 'saving' | 'done' ────────
  const [phase,    setPhase]    = useState('preview');
  const [results,  setResults]  = useState([]); // resultados de la IA
  const [accepted, setAccepted] = useState({}); // { productId: true/false }
  const [overrides, setOverrides] = useState({}); // { productId: '0'|'5'|'8'|'19' }
  const [progress,  setProgress]  = useState({ done: 0, total: 0 });
  const [saveCount, setSaveCount] = useState(0);

  // Solo productos con vat_rate = 0 o null
  const unclassified = useMemo(
    () => products.filter(p => !p.vat_rate || Number(p.vat_rate) === 0),
    [products]
  );

  // ── Clasificar con IA ──────────────────────────────────────────────────────
  async function classify() {
    if (unclassified.length === 0) return;
    setPhase('classifying');
    setProgress({ done: 0, total: unclassified.length });

    // Dividir en lotes de 50 (límite del endpoint)
    const BATCH = 50;
    const allResults = [];

    for (let i = 0; i < unclassified.length; i += BATCH) {
      const batch = unclassified.slice(i, i + BATCH);
      try {
        const { data } = await api.post('/dian/batch-classify', {
          products: batch.map(p => ({
            name:        p.name,
            category:    p.category_name || p.category?.name,
            description: p.description,
          })),
        });

        // Enriquecer con datos del producto original
        const enriched = (data.results || []).map((r, idx) => ({
          ...r,
          productId:   batch[idx]?.id,
          productName: batch[idx]?.name,
        }));
        allResults.push(...enriched);
      } catch (err) {
        // Si un lote falla, marcar esos productos como error
        batch.forEach(p => allResults.push({
          productId:   p.id,
          productName: p.name,
          vatRate:     0,
          confidence:  'low',
          reason:      'Error al clasificar — verifica manualmente',
          needsReview: true,
          _error:      true,
        }));
      }

      setProgress({ done: Math.min(i + BATCH, unclassified.length), total: unclassified.length });
    }

    setResults(allResults);

    // Pre-seleccionar como aceptados todos los de alta confianza
    const preAccepted = {};
    allResults.forEach(r => {
      preAccepted[r.productId] = r.confidence === 'high' && !r._error;
    });
    setAccepted(preAccepted);

    setPhase('review');
  }

  // ── Aceptar / rechazar individual ──────────────────────────────────────────
  function toggleAccepted(productId) {
    setAccepted(prev => ({ ...prev, [productId]: !prev[productId] }));
  }

  // ── Seleccionar/deseleccionar todos ────────────────────────────────────────
  function selectAll(value) {
    const all = {};
    results.forEach(r => { if (!r._error) all[r.productId] = value; });
    setAccepted(all);
  }

  // ── Override de tarifa individual ──────────────────────────────────────────
  function setOverride(productId, rate) {
    setOverrides(prev => ({ ...prev, [productId]: rate }));
    setAccepted(prev => ({ ...prev, [productId]: true }));
  }

  // ── Guardar en Supabase ────────────────────────────────────────────────────
  async function save() {
    const toSave = results.filter(r => accepted[r.productId] && !r._error);
    if (toSave.length === 0) {
      toast('Selecciona al menos un producto para aplicar', { icon: 'ℹ️' });
      return;
    }

    setPhase('saving');
    let saved = 0;
    let failed = 0;

    for (const r of toSave) {
      const rate = Number(overrides[r.productId] ?? r.vatRate ?? r.vat_rate ?? 0);
      try {
        const { error } = await supabase
          .from('products')
          .update({ vat_rate: rate })
          .eq('id', r.productId);
        if (error) throw error;
        saved++;
      } catch {
        failed++;
      }
    }

    setSaveCount(saved);
    setPhase('done');

    if (saved > 0) {
      toast.success(`${saved} producto${saved !== 1 ? 's' : ''} actualizados con IVA correcto`);
      onSaved?.();
    }
    if (failed > 0) {
      toast.error(`${failed} producto${failed !== 1 ? 's' : ''} no se pudieron guardar`);
    }
  }

  // ── Estadísticas de resultados ─────────────────────────────────────────────
  const acceptedCount = Object.values(accepted).filter(Boolean).length;
  const highConfCount = results.filter(r => r.confidence === 'high').length;

  // =============================================================================
  // RENDER
  // =============================================================================
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-50 rounded-xl flex items-center justify-center">
              <Sparkles size={15} className="text-brand-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Clasificación IVA Masiva</h2>
              <p className="text-[10px] text-gray-400">
                {phase === 'preview'  && `${unclassified.length} producto${unclassified.length !== 1 ? 's' : ''} sin tarifa IVA asignada`}
                {phase === 'classifying' && `Analizando ${progress.done}/${progress.total} productos…`}
                {phase === 'review'   && `${results.length} clasificados · ${acceptedCount} seleccionados`}
                {phase === 'saving'   && 'Guardando cambios…'}
                {phase === 'done'     && `${saveCount} productos actualizados`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* ── Cuerpo ── */}
        <div className="flex-1 overflow-y-auto">

          {/* ═══ PHASE: PREVIEW ═══════════════════════════════════════════════ */}
          {phase === 'preview' && (
            <div className="p-5 space-y-4">
              {unclassified.length === 0 ? (
                <div className="text-center py-10">
                  <CheckCircle2 size={36} className="mx-auto mb-3 text-green-300" />
                  <p className="text-sm font-medium text-gray-700">Todos los productos tienen tarifa IVA</p>
                  <p className="text-xs text-gray-400 mt-1">No hay nada que clasificar en este momento.</p>
                </div>
              ) : (
                <>
                  <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 text-sm text-brand-700">
                    <p className="font-semibold mb-1 flex items-center gap-1.5">
                      <Info size={13} />
                      ¿Qué hace esto?
                    </p>
                    <p className="text-xs leading-relaxed">
                      La IA analizará cada producto según su nombre y categoría, y sugerirá la tarifa
                      de IVA correcta según el Estatuto Tributario colombiano (0%, 5%, 8% INC, 19%).
                      Tú decides cuáles aceptar antes de guardar.
                    </p>
                  </div>

                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                      <p className="text-xs font-medium text-gray-500">
                        Productos a clasificar ({unclassified.length})
                      </p>
                    </div>
                    <div className="divide-y divide-gray-50 max-h-52 overflow-y-auto">
                      {unclassified.map(p => (
                        <div key={p.id} className="flex items-center justify-between px-3 py-2">
                          <div>
                            <p className="text-xs font-medium text-gray-800">{p.name}</p>
                            {p.sku && <p className="text-[10px] text-gray-400 font-mono">{p.sku}</p>}
                          </div>
                          <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                            Sin IVA
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══ PHASE: CLASSIFYING ═══════════════════════════════════════════ */}
          {phase === 'classifying' && (
            <div className="flex flex-col items-center justify-center py-16 px-5 gap-5">
              <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center">
                <Loader2 size={24} className="animate-spin text-brand-500" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-800">
                  Clasificando con IA…
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {progress.done} de {progress.total} productos analizados
                </p>
              </div>
              {/* Barra de progreso */}
              <div className="w-full max-w-xs bg-gray-100 rounded-full h-2">
                <div
                  className="h-2 bg-brand-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {/* ═══ PHASE: REVIEW ════════════════════════════════════════════════ */}
          {phase === 'review' && (
            <div className="p-5 space-y-4">
              {/* Resumen rápido */}
              <div className="grid grid-cols-3 gap-3">
                <StatCard value={results.length}    label="Clasificados"      color="brand" />
                <StatCard value={highConfCount}     label="Alta confianza"    color="green" />
                <StatCard value={results.filter(r => r.needsReview).length} label="Revisar" color="amber" />
              </div>

              {/* Acciones masivas */}
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => selectAll(true)}
                  className="px-3 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700
                             border border-brand-200 rounded-lg transition-colors font-medium">
                  Seleccionar todos
                </button>
                <button
                  onClick={() => selectAll(false)}
                  className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600
                             border border-gray-200 rounded-lg transition-colors font-medium">
                  Deseleccionar todos
                </button>
                <span className="ml-auto text-gray-400">{acceptedCount} seleccionados</span>
              </div>

              {/* Lista de resultados */}
              <div className="space-y-2">
                {results.map(r => {
                  const isAccepted = !!accepted[r.productId];
                  const conf = CONFIDENCE_STYLES[r.confidence] || CONFIDENCE_STYLES.medium;
                  const appliedRate = overrides[r.productId] ?? r.vatRate ?? r.vat_rate ?? 0;

                  return (
                    <div
                      key={r.productId}
                      className={`border rounded-xl p-3 transition-all ${
                        r._error
                          ? 'border-red-200 bg-red-50 opacity-60'
                          : isAccepted
                          ? 'border-brand-200 bg-brand-50/40'
                          : 'border-gray-200 bg-white'
                      }`}>
                      <div className="flex items-start gap-3">
                        {/* Checkbox */}
                        {!r._error && (
                          <button
                            onClick={() => toggleAccepted(r.productId)}
                            className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5
                                        border-2 transition-colors ${
                              isAccepted
                                ? 'bg-brand-600 border-brand-600 text-white'
                                : 'border-gray-300 bg-white'
                            }`}>
                            {isAccepted && <Check size={11} strokeWidth={3} />}
                          </button>
                        )}
                        {r._error && <XCircle size={18} className="text-red-400 shrink-0 mt-0.5" />}

                        {/* Nombre + badge confianza */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-gray-800 truncate">{r.productName}</span>
                            {!r._error && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${conf.bg}`}>
                                {conf.label}
                              </span>
                            )}
                          </div>
                          {r.reason && (
                            <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">{r.reason}</p>
                          )}
                        </div>

                        {/* Selector de tarifa */}
                        {!r._error && (
                          <div className="shrink-0">
                            <select
                              value={overrides[r.productId] ?? String(r.vatRate ?? r.vat_rate ?? 0)}
                              onChange={e => setOverride(r.productId, e.target.value)}
                              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5
                                         outline-none focus:ring-2 focus:ring-brand-400 bg-white
                                         font-medium text-gray-700">
                              {Object.entries(RATE_LABELS).map(([rate, label]) => (
                                <option key={rate} value={rate}>{label}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ PHASE: SAVING ════════════════════════════════════════════════ */}
          {phase === 'saving' && (
            <div className="flex flex-col items-center justify-center py-16 px-5 gap-4">
              <Loader2 size={28} className="animate-spin text-brand-500" />
              <p className="text-sm text-gray-600">Guardando tarifas IVA en la base de datos…</p>
            </div>
          )}

          {/* ═══ PHASE: DONE ══════════════════════════════════════════════════ */}
          {phase === 'done' && (
            <div className="flex flex-col items-center justify-center py-16 px-5 gap-4 text-center">
              <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center">
                <CheckCircle2 size={28} className="text-green-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {saveCount} producto{saveCount !== 1 ? 's' : ''} actualizados
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Las tarifas IVA han sido guardadas. Ya puedes emitir facturas electrónicas correctas.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer con acciones ── */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            {phase === 'done' ? 'Cerrar' : 'Cancelar'}
          </button>

          <div className="flex items-center gap-2">
            {phase === 'preview' && unclassified.length > 0 && (
              <button
                onClick={classify}
                className="flex items-center gap-2 px-5 py-2 bg-brand-600 hover:bg-brand-700
                           text-white text-sm font-semibold rounded-xl transition-colors">
                <Sparkles size={14} />
                Clasificar {unclassified.length} productos
              </button>
            )}

            {phase === 'review' && (
              <button
                onClick={save}
                disabled={acceptedCount === 0}
                className="flex items-center gap-2 px-5 py-2 bg-brand-600 hover:bg-brand-700
                           disabled:opacity-50 disabled:cursor-not-allowed
                           text-white text-sm font-semibold rounded-xl transition-colors">
                <Save size={14} />
                Aplicar {acceptedCount} seleccionados
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// StatCard — Chip de estadística
// =============================================================================
function StatCard({ value, label, color }) {
  const colors = {
    brand: 'bg-brand-50 text-brand-700',
    green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-700',
  };
  return (
    <div className={`rounded-xl p-3 ${colors[color]}`}>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[10px] font-medium mt-0.5 opacity-70">{label}</p>
    </div>
  );
}
