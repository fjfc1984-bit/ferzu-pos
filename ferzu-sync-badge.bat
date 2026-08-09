@echo off
title FERZU - Sync Badge
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock
git add src/hooks/useSyncQueueStatus.js
git add src/components/SyncStatusBadge.jsx
git add src/App.jsx
git commit -m "feat: SyncStatusBadge — indicador offline persistente en esquina inferior derecha

- useSyncQueueStatus.js: hook que consume SyncContext (sin duplicar logica)
  retorna pendingCount, isOnline, isSyncing, severity (ok/offline/warning/critical)
- SyncStatusBadge.jsx: badge fixed bottom-right, invisible cuando todo esta ok
  offline=amarillo, warning=amarillo con contador, critical=rojo pulsante
- App.jsx: importado y montado dentro de SyncProvider + POSProvider
  visible en TODAS las rutas (POS, dashboard, inventario, etc.)"
git push origin main
echo ERRORLEVEL: %ERRORLEVEL%
if %ERRORLEVEL% EQU 0 (echo OK - Vercel desplegara en ~1 min) else (echo ERROR)
cmd /k
