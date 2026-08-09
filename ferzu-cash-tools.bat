@echo off
title FERZU - Tools: open/close cash session
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock

git add backend/lib/claudeTools.js
git add backend/routes/ai.routes.js
git add src/components/CopilotChat/CopilotChat.jsx

git commit -m "feat: tools 11 y 12 — open_cash_session + close_cash_session

claudeTools.js:
  - Tool 11: open_cash_session (dry_run protocol)
    * dry_run=true: verifica si ya hay caja abierta, muestra preview
    * dry_run=false: INSERT en cash_sessions con opening_cash
    * Anti-duplicado: bloquea si el usuario ya tiene caja abierta
    * Audit log fire-and-forget
  - Tool 12: close_cash_session (dry_run protocol)
    * dry_run=true: calcula totales del turno (ventas x metodo de pago)
    * dry_run=false: UPDATE cash_sessions con cierre + totales calculados
    * Detecta descuadre de caja y genera system_alert si >5000 COP
    * Audit log fire-and-forget
  - Switch cases: open_cash_session, close_cash_session

ai.routes.js:
  - COPILOT_SYSTEM_SUFFIX: instrucciones para abrir y cerrar caja
    con protocolo de dos fases obligatorio

CopilotChat.jsx:
  - CONFIRM_PATTERNS: detecta confirmaciones de apertura y cierre de caja"

git push origin main
echo ERRORLEVEL: %ERRORLEVEL%
if %ERRORLEVEL% EQU 0 (
  echo OK - Railway desplegara en ~2 min
  echo.
  echo Prueba en el Co-Piloto:
  echo   "abre la caja con 200000 pesos"
  echo   "cierra la caja"
) else (
  echo ERROR - revisar arriba
)
cmd /k
