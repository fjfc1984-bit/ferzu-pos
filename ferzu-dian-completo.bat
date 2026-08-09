@echo off
title FERZU POS — DIAN Completo (Tareas #42 + #43)
color 0A
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

echo [0/4] Limpiando locks...
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul

echo [1/4] Agregando archivos...
git add database/migrations/009_dian_complete.sql
git add backend/lib/claudeTools.js
git add backend/routes/ai.routes.js

echo [2/4] Haciendo commit...
git commit -m "feat(dian): migración 009 con get_next_invoice_number() atomica + credit_notes + Tool 21 get_dian_status en Co-Piloto con protocolo de alertas numeracion/contingencias"

echo [3/4] Push a GitHub...
git push origin main

echo.
if %ERRORLEVEL% EQU 0 (
    color 0A
    echo  ============================================================
    echo   OK! Modulo DIAN completo en produccion.
    echo   Railway: redeploy automatico (~2 min)
    echo.
    echo   PASO SIGUIENTE — EJECUTAR EN SUPABASE SQL EDITOR:
    echo   database/migrations/009_dian_complete.sql
    echo.
    echo   Luego configurar dian_configs en Supabase:
    echo   - resolution_number, prefix, from/to_number
    echo   - technical_key (clave tecnica DIAN)
    echo   - api_key (credencial PTA Alegra/Siigo)
    echo   - is_active = true
    echo  ============================================================
) else (
    color 0C
    echo  ERROR. Revisa el mensaje arriba.
)
echo.
pause
