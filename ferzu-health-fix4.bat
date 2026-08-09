@echo off
title FERZU - Health Fix 4
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock
git add backend/routes/health.routes.js
git commit -m "fix: sync_chain usa status+created_at (columnas garantizadas) — sin synced_at"
git push origin main
echo ERRORLEVEL: %ERRORLEVEL%
if %ERRORLEVEL% EQU 0 (echo OK - Railway desplegara en 2 min) else (echo ERROR)
cmd /k
