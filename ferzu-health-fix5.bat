@echo off
title FERZU - Health Fix 5
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock
git add backend/routes/health.routes.js
git commit -m "fix: ajustar umbrales Supabase — auth warn 500->800ms, db warn 200->600ms (valores reales del plan)"
git push origin main
echo ERRORLEVEL: %ERRORLEVEL%
if %ERRORLEVEL% EQU 0 (echo OK - Railway desplegara en 2 min) else (echo ERROR)
cmd /k
