@echo off
echo ========================================
echo  FERZU POS - Commit: sync enabled_modules
echo ========================================
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

echo.
echo [0/3] Limpiando lock si existe...
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock del /f .git\HEAD.lock

echo.
echo [1/3] Agregando archivos modificados...
git add backend/config/plans.js
git add backend/routes/payments.routes.js
git add supabase/sync_org_plan_trigger.sql

echo.
echo [2/3] Verificando cambios...
git status

echo.
echo [3/3] Haciendo commit y push...
git commit -m "feat: sync enabled_modules al activar plan via Bold webhook"
git push origin main

IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Fallo en commit o push. Revisa el error arriba.
    pause
    exit /b 1
)

echo.
echo OK - Cambios subidos a GitHub. Railway desplegara en ~2 min.
echo Verifica en: https://railway.com/project/4906b216-e262-4b35-a291-5db47b4e7655
pause
