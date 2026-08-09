@echo off
echo ========================================
echo  FERZU POS - Fix: POS crash getOfflineProducts
echo ========================================
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

echo [0/3] Limpiando locks...
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock

echo [1/3] Agregando cambio...
git add src/pages/POSPage.jsx

echo [2/3] Commit...
git commit -m "fix: move cacheProducts/getOfflineProducts to ProductGrid scope where they are used"

echo [3/3] Push a GitHub...
git push origin main

IF %ERRORLEVEL% NEQ 0 (
    echo ERROR: Revisa el error arriba.
    pause
    exit /b 1
)

echo.
echo OK - Vercel va a reconstruir el frontend en ~2 min.
echo Verifica en: https://ferzu-pos.vercel.app/pos
pause
