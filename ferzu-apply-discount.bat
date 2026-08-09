@echo off
title FERZU - Tool 13: apply_discount
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock

git add backend/lib/claudeTools.js
git add backend/routes/ai.routes.js
git add src/components/CopilotChat/CopilotChat.jsx

git commit -m "feat: tool 13 — apply_discount en Co-Piloto

claudeTools.js:
  - Tool 13: apply_discount (dry_run protocol)
  - dry_run=true: busca orden abierta, calcula preview del descuento
    * Por porcentaje: discount_type='percentage', discount_value=10 (10%)
    * Por monto fijo: discount_type='fixed', discount_value=5000 ($5.000)
    * Quitar descuento: discount_type='fixed', discount_value=0
  - dry_run=false: UPDATE orders con nuevo discount_amount y total
    * Mismo calculo que orders.routes.js (consistencia backend)
    * Double-check status='open' en el UPDATE (no toca ordenes pagadas)
    * Audit log fire-and-forget
  - Busqueda inteligente de orden:
    * Si se provee order_id: usa esa orden (valida ownership via branch)
    * Si no: busca ultima orden abierta de la sesion activa del cajero
  - Manejo de errores: orden pagada, cancelada, sin sesion activa

ai.routes.js:
  - COPILOT_SYSTEM_SUFFIX: instrucciones para aplicar descuentos
    con ejemplos de porcentaje y monto fijo

CopilotChat.jsx:
  - CONFIRM_PATTERNS: detecta confirmacion de descuento"

git push origin main
echo ERRORLEVEL: %ERRORLEVEL%
if %ERRORLEVEL% EQU 0 (
  echo OK - Railway desplegara en ~2 min
  echo.
  echo Prueba en el Co-Piloto:
  echo   "aplica 10%% de descuento a la orden actual"
  echo   "descuento de $5000 a la orden"
  echo   "quita el descuento"
) else (
  echo ERROR - revisar arriba
)
cmd /k
