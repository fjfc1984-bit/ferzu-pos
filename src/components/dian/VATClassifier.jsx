// =============================================================================
// FERZU POS — VATClassifier
// Componente: src/components/dian/VATClassifier.jsx
// Clasifica la tarifa de IVA de un producto usando IA (backend /api/dian/classify-vat)
// =============================================================================
// Props:
//   productName       string   — nombre del producto (requerido para activar el botón)
//   productCategory   string?  — categoría del producto (mejora precisión)
//   productDescription string? — descripción (mejora precisión)
//   currentRate       number   — tarifa actual (0 | 5 | 8 | 19)
//   onAccepted        fn(rate) — callback cuando el usuario acepta la sugerencia
//   disabled          bool?    — deshabilita el clasificador (ej: mientras se guarda)
// =============================================================================

import React, { useState } from 'react';
import {
  Sparkles, CheckCircle2, X, Loader2,
  AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { api } from '../../lib/api.js';

// ─── Estilos por nivel de confianza ──────────────────────────────────────────
const CONFIDENCE_STYLES = {
  high:   { badge: 'bg-green-100 text-green-700 border-green-200', label: 'Alta confianza'  },
  medium: { badge: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Confianza media' },
  low:    { badge: 'bg-red-100   text-red-600   border-red-200',   label: 'Baja confianza'  },
};

// ─── Etiquetas legibles de tarifas ───────────────────────────────────────────
export const RATE_LABELS = {
  0:  '0% — Exento / Excluido',
  5:  '5% — Tarifa diferencial',
  8:  '8% INC — Restaurantes',
  19: '19% — Tarifa general',
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function VATClassifier({
  productName,
  productCategory,
  productDescription,
  currentRate,
  onAccepted,
  disabled = false,
}) {
  const [status,       setStatus]       = useState('idle'); // idle | loading | done | error
  const [result,       setResult]       = useState(null);
  const [showReasoning, setShowReasoning] = useState(false);

  // No renderizar nada si no hay nombre — el botón no tiene utilidad
  if (!productName?.trim()) return null;

  // ─── Llamada a la API ───────────────────────────────────────────────────────
  async function classify() {
    setStatus('loading');
    setResult(null);
    setShowReasoning(false);

    try {
      const { data } = await api.post('/dian/classify-vat', {
        products: [{
          name:        productName.trim(),
          category:    productCategory   || undefined,
          description: productDescription || undefined,
        }],
      });

      const r = data?.results?.[0];
      if (!r) throw new Error('Sin resultado de clasificación');

      // Normalizar el campo de tarifa (la IA puede devolver 'rate' o 'suggestedRate')
      r.resolvedRate = r.suggestedRate ?? r.rate ?? 0;

      setResult(r);
      setStatus('done');
    } catch (err) {
      console.error('[VATClassifier]', err);
      setStatus('error');
    }
  }

  // ─── Aceptar sugerencia ─────────────────────────────────────────────────────
  function accept() {
    if (result) {
      onAccepted(result.resolvedRate);
      dismiss();
    }
  }

  // ─── Descartar resultado ────────────────────────────────────────────────────
  function dismiss() {
    setResult(null);
    setStatus('idle');
    setShowReasoning(false);
  }

  const confidenceStyle = result
    ? (CONFIDENCE_STYLES[result.confidence] || CONFIDENCE_STYLES.medium)
    : null;

  const rateChanged = result && result.resolvedRate !== Number(currentRate);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-2">

      {/* ── Botón de clasificación (visible en idle/error) ── */}
      {status !== 'done' && (
        <button
          type="button"
          onClick={classify}
          disabled={disabled || status === 'loading'}
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium
                     text-brand-700 bg-brand-50 hover:bg-brand-100
                     border border-brand-200 rounded-xl
                     transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          {status === 'loading' ? (
            <><Loader2 size={13} className="animate-spin" /> Consultando IA…</>
          ) : (
            <><Sparkles size={13} /> Clasificar tarifa IVA con IA</>
          )}
        </button>
      )}

      {/* ── Mensaje de error ── */}
      {status === 'error' && (
        <div className="flex items-center gap-2 text-xs text-red-600
                        bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          <AlertTriangle size={13} className="shrink-0" />
          <span>No se pudo clasificar. Verifica tu conexión e intenta de nuevo.</span>
          <button
            type="button"
            onClick={() => setStatus('idle')}
            className="ml-auto text-red-400 hover:text-red-600">
            ✕
          </button>
        </div>
      )}

      {/* ── Card de resultado ── */}
      {status === 'done' && result && (
        <div className="border border-brand-200 bg-brand-50 rounded-xl p-3 space-y-2.5">

          {/* Cabecera: sugerencia + badge de confianza */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <Sparkles size={13} className="text-brand-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-brand-800">
                  IA sugiere: {RATE_LABELS[result.resolvedRate] ?? `${result.resolvedRate}%`}
                </p>
                <p className="text-[10px] text-brand-500 mt-0.5">
                  {rateChanged
                    ? `Diferente a la tarifa actual (${RATE_LABELS[currentRate] ?? `${currentRate}%`})`
                    : 'Coincide con la tarifa actual'}
                </p>
              </div>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0
                             ${confidenceStyle.badge}`}>
              {confidenceStyle.label}
            </span>
          </div>

          {/* Razonamiento colapsable */}
          {result.reasoning && (
            <div>
              <button
                type="button"
                onClick={() => setShowReasoning(v => !v)}
                className="flex items-center gap-1 text-[10px] text-brand-500 hover:text-brand-700">
                {showReasoning ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                {showReasoning ? 'Ocultar razonamiento' : 'Ver razonamiento'}
              </button>
              {showReasoning && (
                <p className="mt-1.5 text-[10px] text-brand-700 bg-white border border-brand-100
                              rounded-lg px-2.5 py-1.5 leading-relaxed">
                  {result.reasoning}
                </p>
              )}
            </div>
          )}

          {/* Acciones */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={accept}
              className="flex items-center gap-1.5 px-3 py-1.5
                         bg-brand-600 hover:bg-brand-700 text-white
                         text-xs font-semibold rounded-lg transition-colors">
              <CheckCircle2 size={12} />
              Aplicar {result.resolvedRate}%
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="flex items-center gap-1.5 px-3 py-1.5
                         text-gray-500 hover:text-gray-700
                         text-xs rounded-lg transition-colors">
              <X size={12} />
              Ignorar
            </button>
            {result.needsReview && (
              <span className="ml-auto flex items-center gap-1 text-[10px] text-amber-600">
                <AlertTriangle size={10} />
                Requiere verificación manual
              </span>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
