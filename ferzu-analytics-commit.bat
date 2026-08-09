@echo off
title FERZU POS — Commit Dashboard Analítico
color 0A
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

echo [0/4] Limpiando locks...
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul

echo [1/4] Agregando archivos...
git add backend/routes/reports.routes.js
git add src/pages/AnalyticsPage.jsx
git add src/App.jsx
git add src/components/ModuleGuard.jsx

echo [2/4] Haciendo commit...
git commit -m "feat: Dashboard Analitico Ejecutivo — ventas semana/mes/ano, horas pico, top 10 productos, metodos de pago y comparativa por sucursal"

echo [3/4] Push a GitHub...
git push origin main

echo.
if %ERRORLEVEL% EQU 0 (
    color 0A
    echo  ============================================================
    echo   OK! Dashboard Analitico subido exitosamente.
    echo   Vercel: https://ferzu-pos.vercel.app  (~1 min)
    echo   Railway: redeploy automatico           (~2 min)
    echo   Navega a /analytics para verlo en accion
    echo  ============================================================
) else (
    color 0C
    echo  ERROR. Revisa el mensaje arriba.
)
echo.
pause
