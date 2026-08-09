@echo off
title FERZU - Tool 10: generate_purchase_order
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock

git add backend/lib/claudeTools.js
git add backend/routes/ai.routes.js

git commit -m "feat: tool generate_purchase_order en Co-Piloto (Tool 10)

claudeTools.js:
  - Tool 10: generate_purchase_order — dos fases (dry_run/execute)
  - Validacion: proveedor pertenece a la org (suppliers.organization_id)
  - Validacion: productos pertenecen a la org (products.organization_id)
  - Calculos en backend (Math.round, sin flotantes)
  - Fase 1 (dry_run=true): preview con subtotal/IVA/total por linea
  - Fase 2 (dry_run=false): INSERT en purchase_orders + purchase_order_items
  - source='ai_suggested', status='draft'
  - Audit log: create_purchase_order_via_copilot
  - Fallback de branch_id si no hay en contexto

ai.routes.js:
  - COPILOT_SYSTEM_SUFFIX: flujo generate_purchase_order con 6 pasos
  - Protocolo dos fases identico a void_last_order"

git push origin main
echo ERRORLEVEL: %ERRORLEVEL%
if %ERRORLEVEL% EQU 0 (
  echo OK - Railway desplegara en ~2 min
  echo.
  echo Prueba en el Co-Piloto:
  echo   "genera una orden de compra para reabastecer el inventario"
  echo   El Co-Piloto deberia:
  echo     1. Revisar alertas de inventario
  echo     2. Preguntarte que proveedor usar
  echo     3. Mostrar preview con totales
  echo     4. Pedir confirmacion
  echo     5. Crear la PO en BD
) else (
  echo ERROR - revisar arriba
)
cmd /k
