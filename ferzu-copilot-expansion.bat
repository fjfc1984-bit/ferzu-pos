@echo off
title FERZU POS — Co-Piloto Tools 16-20
color 0A
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

echo [0/4] Limpiando locks...
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul

echo [1/4] Agregando archivos...
git add backend/lib/claudeTools.js
git add backend/routes/ai.routes.js

echo [2/4] Haciendo commit...
git commit -m "feat(copilot): agregar tools 16-20 — get_sales_summary, get_retention_summary, close_day, get_top_products, get_birthday_alert + protocolos COPILOT_SYSTEM_SUFFIX"

echo [3/4] Push a GitHub...
git push origin main

echo.
if %ERRORLEVEL% EQU 0 (
    color 0A
    echo  ============================================================
    echo   OK! Co-Piloto expandido con 5 nuevas herramientas.
    echo   Railway: redeploy automatico (~2 min)
    echo   Tools activas: 20 en total
    echo  ============================================================
) else (
    color 0C
    echo  ERROR. Revisa el mensaje arriba.
)
echo.
pause
