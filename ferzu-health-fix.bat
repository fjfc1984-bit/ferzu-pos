@echo off
echo ========================================
echo  FERZU POS - Health Fix: sync_chain
echo ========================================
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock

git add backend/routes/health.routes.js

git commit -m "fix: health/full — sync_chain robusto ante schema incompleto

Problema: orders.source o usage_events inexistentes causaban error
con error_message vacío, escalando el status global a 'critical'.

Solución:
  - Cada sub-query de sync_chain ahora falla silenciosamente (warning, no error)
  - Si orders.source no existe → pending=0, status=warning con mensaje descriptivo
  - Si usage_events no existe → errorRate=0, status=warning con mensaje descriptivo
  - overall_messages: corregido null check para no mostrar 'null ordenes | null%'
  - Schema incompleto → 'warning', nunca 'critical'"

git push origin main

IF %ERRORLEVEL% NEQ 0 (
    echo ERROR: Revisa el error arriba.
    pause
    exit /b 1
)

echo.
echo OK - Railway desplegara en ~2 min.
echo Luego verifica: GET /api/health/full
echo Esperado: sync_chain status=warning (no error), mensaje descriptivo
pause
