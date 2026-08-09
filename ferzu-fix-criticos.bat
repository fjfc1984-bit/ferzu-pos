@echo off
echo ========================================
echo  FERZU POS - Fixes Criticos (Batch 2)
echo  loyalty + ai + analytics + pos payment
echo ========================================
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

echo [0/4] Limpiando locks...
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock

echo [1/4] Agregando cambios...
git add backend/routes/loyalty.routes.js backend/routes/ai.routes.js backend/routes/analytics.routes.js src/pages/POSPage.jsx

echo [2/4] Commit...
git commit -m "fix: criticos — loyalty org isolation, ai proposals org check, analytics fail-closed, payment error visibility"

echo [3/4] Push a GitHub...
git push origin main

IF %ERRORLEVEL% NEQ 0 (
    echo ERROR: Revisa el error arriba.
    pause
    exit /b 1
)

echo.
echo ========================================
echo OK - Cambios enviados. Railway desplegara backend en ~2 min.
echo Bugs corregidos:
echo  - loyalty: todo el modulo estaba roto (req.user.organizationId undefined)
echo  - ai: facturas y propuestas ahora validan la org del usuario
echo  - ai: duplicado de import Anthropic eliminado
echo  - analytics: fail-open cambiado a fail-closed
echo  - analytics: cliente Supabase unificado desde config
echo  - POSPage: errores de pago ahora se muestran al usuario
echo ========================================
pause
