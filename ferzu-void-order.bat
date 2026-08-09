@echo off
title FERZU - Co-Piloto Tool: void_last_order
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock

git add backend/lib/claudeTools.js
git add backend/routes/ai.routes.js

git commit -m "feat: tool void_last_order en Co-Piloto (agente operacional)

claudeTools.js:
  - Tool 9: void_last_order — dos fases (dry_run/execute)
  - Fase 1 (dry_run=true): busca ultima orden pagada <30min, retorna preview
  - Fase 2 (dry_run=false): anula orden, registra en audit_log
  - Validaciones: solo admin/owner, max 30min, status=paid
  - audit_log: action=void_order_via_copilot, reason, voided_via=copilot

ai.routes.js:
  - context agrega user_id (requerido por voidLastOrder)
  - COPILOT_SYSTEM_SUFFIX: protocolo 2 fases obligatorio
    (dry_run preview → confirmacion usuario → ejecutar)
  - Ya no usa create_ai_proposal para anulaciones — usa la tool directa"

git push origin main
echo ERRORLEVEL: %ERRORLEVEL%
if %ERRORLEVEL% EQU 0 (
  echo OK - Railway desplegara en ~2 min
  echo.
  echo Prueba el Co-Piloto:
  echo   Escribe: "anula la ultima venta"
  echo   El Co-Piloto debe:
  echo     1. Buscar la ultima orden (dry_run=true)
  echo     2. Mostrarte total + productos + hace cuantos min
  echo     3. Pedirte confirmacion
  echo     4. Al confirmar: anular y confirmar exito
) else (
  echo ERROR - revisar arriba
)
cmd /k
