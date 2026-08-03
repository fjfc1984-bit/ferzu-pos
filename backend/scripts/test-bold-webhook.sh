#!/usr/bin/env bash
# =============================================================================
# FERZU POS — Script manual para probar el webhook Bold con sandbox
#
# USO:
#   1. Configurar BOLD_SECRET_KEY en Railway (el secret de tu cuenta Bold sandbox)
#   2. Ejecutar: bash backend/scripts/test-bold-webhook.sh
#
# PREREQUISITOS:
#   - curl instalado
#   - BOLD_SECRET_KEY exportada como variable de entorno
#   - El backend en Railway debe estar corriendo
#
# ENTORNO SANDBOX vs PRODUCCIÓN:
#   Para sandbox: cambiar BACKEND_URL por http://localhost:3001 o la URL de Railway
# =============================================================================

BACKEND_URL="${BACKEND_URL:-https://ferzu-backend-production.up.railway.app}"
BOLD_SECRET_KEY="${BOLD_SECRET_KEY:-}"
ORG_ID="${TEST_ORG_ID:-}"
PLAN_ID="${TEST_PLAN_ID:-pro}"

# ─── Validaciones ────────────────────────────────────────────────────────────

if [ -z "$BOLD_SECRET_KEY" ]; then
  echo "❌ ERROR: BOLD_SECRET_KEY no está configurada."
  echo "   Ejecuta: export BOLD_SECRET_KEY='tu-secret-de-bold'"
  echo "   Encuéntrala en: panel.bold.co → Configuración → API → Secret Key"
  exit 1
fi

if [ -z "$ORG_ID" ]; then
  echo "❌ ERROR: TEST_ORG_ID no está configurada."
  echo "   Ejecuta: export TEST_ORG_ID='uuid-de-tu-org-en-supabase'"
  echo "   Lo encuentras en: Supabase → Table editor → organizations → id"
  exit 1
fi

# ─── Construir payload APPROVED ──────────────────────────────────────────────

TRANSACTION_ID="test-txn-$(date +%s)"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

PAYLOAD=$(cat <<EOF
{
  "type": "TRANSACTION_UPDATED",
  "data": {
    "id": "${TRANSACTION_ID}",
    "status": "APPROVED",
    "amount": 149000,
    "currency": "COP",
    "created_at": "${TIMESTAMP}",
    "metadata": {
      "organization_id": "${ORG_ID}",
      "plan_id": "${PLAN_ID}"
    }
  }
}
EOF
)

# ─── Calcular firma HMAC-SHA256 ──────────────────────────────────────────────

SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$BOLD_SECRET_KEY" -hex | awk '{print $2}')
SIGNATURE_HEADER="sha256=${SIGNATURE}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  FERZU POS — Test Webhook Bold (Sandbox)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Backend:      ${BACKEND_URL}"
echo "  Org ID:       ${ORG_ID}"
echo "  Plan:         ${PLAN_ID}"
echo "  Transaction:  ${TRANSACTION_ID}"
echo "  Firma:        ${SIGNATURE_HEADER:0:30}..."
echo ""

# ─── Enviar webhook APPROVED ─────────────────────────────────────────────────

echo "▶ Enviando webhook APPROVED..."
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${BACKEND_URL}/webhooks/bold" \
  -H "Content-Type: application/json" \
  -H "x-bold-signature: ${SIGNATURE_HEADER}" \
  --data-raw "$PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

echo "  HTTP Status: ${HTTP_CODE}"
echo "  Response:    ${BODY}"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  echo "  ✅ Webhook APPROVED procesado exitosamente"
  echo ""
  echo "  Verifica en Supabase:"
  echo "    SELECT plan_id, plan_expires_at FROM organizations WHERE id = '${ORG_ID}';"
  echo "    SELECT * FROM subscriptions WHERE organization_id = '${ORG_ID}';"
else
  echo "  ❌ Error procesando webhook (HTTP ${HTTP_CODE})"
  echo ""
  echo "  Posibles causas:"
  echo "    - BOLD_SECRET_KEY incorrecta (genera 401)"
  echo "    - Metadata incompleta (genera 422)"
  echo "    - Error interno (genera 500) — revisa los logs de Railway"
fi

# ─── Test adicional: webhook con firma inválida (debe dar 401) ───────────────

echo ""
echo "▶ Probando rechazo de firma inválida..."

INVALID_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${BACKEND_URL}/webhooks/bold" \
  -H "Content-Type: application/json" \
  -H "x-bold-signature: sha256=$('a' * 64 2>/dev/null || echo 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')" \
  --data-raw "$PAYLOAD")

INVALID_HTTP=$(echo "$INVALID_RESPONSE" | tail -1)

if [ "$INVALID_HTTP" = "401" ]; then
  echo "  ✅ Firma inválida correctamente rechazada (401)"
else
  echo "  ⚠️  Se esperaba 401, se recibió ${INVALID_HTTP}"
  echo "     Posible bug: webhook acepta firmas inválidas"
fi

# ─── Test: evento desconocido (debe dar 200 pero sin activar plan) ────────────

echo ""
echo "▶ Probando evento desconocido (debe ignorarse sin activar plan)..."

OTHER_PAYLOAD='{"type":"ORDER_CREATED","data":{}}'
OTHER_SIG="sha256=$(echo -n "$OTHER_PAYLOAD" | openssl dgst -sha256 -hmac "$BOLD_SECRET_KEY" -hex | awk '{print $2}')"

OTHER_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${BACKEND_URL}/webhooks/bold" \
  -H "Content-Type: application/json" \
  -H "x-bold-signature: ${OTHER_SIG}" \
  --data-raw "$OTHER_PAYLOAD")

OTHER_HTTP=$(echo "$OTHER_RESPONSE" | tail -1)
OTHER_BODY=$(echo "$OTHER_RESPONSE" | head -1)

if [ "$OTHER_HTTP" = "200" ] && echo "$OTHER_BODY" | grep -q '"ignored"'; then
  echo "  ✅ Evento desconocido ignorado correctamente"
else
  echo "  ⚠️  Respuesta inesperada: HTTP ${OTHER_HTTP} — ${OTHER_BODY}"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Fin del test de webhook Bold"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Para ver los logs de Railway en tiempo real:"
echo "    railway logs --service ferzu-backend --tail"
echo ""
