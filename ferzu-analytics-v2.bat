@echo off
title FERZU POS — Analytics v2 (fixes performance + UX)
color 0A
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

echo [0/4] Limpiando locks...
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul

echo [1/4] Agregando archivos...
git add backend/routes/reports.routes.js
git add src/pages/AnalyticsPage.jsx

echo [2/4] Haciendo commit...
git commit -m "fix(analytics): reemplazar 31 API calls con endpoint /period, fix usePOS crash, empty state, comparativa delta porcent semana/mes anterior"

echo [3/4] Push a GitHub...
git push origin main

echo.
if %ERRORLEVEL% EQU 0 (
    color 0A
    echo  ============================================================
    echo   OK! Analytics v2 subido.
    echo   Vercel: https://ferzu-pos.vercel.app  (~1 min)
    echo   Railway: redeploy automatico           (~2 min)
    echo  ============================================================
) else (
    color 0C
    echo  ERROR. Revisa el mensaje arriba.
)
echo.
pause
