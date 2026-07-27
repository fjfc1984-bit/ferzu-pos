@echo off
chcp 65001 > nul
echo ================================================
echo  FERZU POS — Push T75-T79 a produccion
echo ================================================
echo.

cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

echo [1/2] Verificando estado...
git status --short

echo.
echo [2/2] Subiendo a GitHub...
git push origin main

echo.
if %ERRORLEVEL% EQU 0 (
    echo ================================================
    echo  LISTO - Cambios subidos a GitHub
    echo ================================================
    echo.
    echo  Vercel build iniciando...  https://ferzu-pos.vercel.app
    echo  Railway redeploy...        https://ferzu-backend-production.up.railway.app/health
    echo.
    echo  Listos en aprox. 1-2 minutos.
) else (
    echo ================================================
    echo  ERROR al hacer push
    echo  Ejecuta manualmente: git push origin main
    echo ================================================
)

pause
