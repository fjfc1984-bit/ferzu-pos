@echo off
title FERZU - Health Fix 3
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock
git add backend/routes/health.routes.js
git commit -m "fix: sync_chain usa synced_at en lugar de source='offline' (columna no existe)"
git push origin main
echo.
echo ERRORLEVEL: %ERRORLEVEL%
echo.
if %ERRORLEVEL% EQU 0 (echo OK - Railway desplegara en 2 min) else (echo ERROR - revisar arriba)
cmd /k
