@echo off
title FERZU - Fix cadena de sync offline
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock

git add src/lib/db.js
git add src/context/SyncContext.jsx
git add src/hooks/useSyncQueueStatus.js
git add src/components/SyncStatusBadge.jsx

git commit -m "fix: cadena sync offline — 3 bugs criticos + failed_permanent

db.js:
  - Version 4: sync_queue agrega indice en status y next_retry_at
    para queries eficientes de ops fallidas/con backoff

SyncContext.jsx:
  - processSyncQueue: ahora filtra por next_retry_at (backoff real)
  - Detecta error en res.data.results[0].success=false (backend error silencioso)
  - Guarda last_error en sync_queue para diagnostico
  - Despues de 5 retries: status='failed_permanent' + toast de alerta
  - failedCount en estado (ops dead, nunca mas reintentadas)
  - Toast informativo al usuario cuando una op muere definitivamente
  - refreshPendingCount separa activos vs failed_permanent

useSyncQueueStatus.js:
  - Agrega severity='dead' cuando failedCount > 0
  - Expone failedCount al componente

SyncStatusBadge.jsx:
  - severity='dead': badge rojo oscuro 🚨 'N venta(s) NO sincronizada(s)'
  - aria-live='assertive' para accesibilidad (alerta critica)"

git push origin main
echo ERRORLEVEL: %ERRORLEVEL%
if %ERRORLEVEL% EQU 0 (
  echo OK - Vercel desplegara en ~1 min
  echo.
  echo Comportamiento nuevo:
  echo   - Ops con 5 retries fallidos: badge 'N ventas NO sincronizadas' rojo oscuro
  echo   - Backoff exponencial ahora se respeta (next_retry_at verificado)
  echo   - Errores del backend se guardan en last_error para diagnostico
) else (
  echo ERROR - revisar arriba
)
cmd /k
