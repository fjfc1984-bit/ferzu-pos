@echo off
title FERZU POS — Commit Módulo Retención
color 0A
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

echo [0/4] Limpiando locks...
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul

echo [1/4] Agregando archivos...
git add backend/routes/retention.routes.js
git add backend/server.js
git add src/App.jsx
git add src/components/ModuleGuard.jsx
git add src/pages/RetentionPage.jsx

echo [2/4] Haciendo commit...
git commit -m "feat: Modulo de Retencion y Reactivacion de Clientes — segmentacion automatica VIP/Activos/En riesgo/Dormidos, cumpleanos, generador mensajes WhatsApp con IA"

echo [3/4] Push a GitHub...
git push origin main

echo.
if %ERRORLEVEL% EQU 0 (
    color 0A
    echo  ============================================================
    echo   OK! Modulo de Retencion subido exitosamente.
    echo   Vercel: https://ferzu-pos.vercel.app  (~1 min)
    echo   Railway: redeploy automatico           (~2 min)
    echo  ============================================================
) else (
    color 0C
    echo  ERROR. Revisa el mensaje arriba.
)
echo.
pause
