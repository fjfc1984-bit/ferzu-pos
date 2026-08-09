@echo off
title FERZU POS — DIAN UX (Tarea #41)
color 0A
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

echo [0/4] Limpiando locks...
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul

echo [1/4] Agregando archivos...
git add src/components/ModuleGuard.jsx
git add src/context/POSContext.jsx
git add src/pages/POSPage.jsx

echo [2/4] Haciendo commit...
git commit -m "feat(dian): sidebar link Facturacion DIAN + toggle Requiere factura electronica en checkout con campos NIT/email/razon-social y paso de overrides a processPayment"

echo [3/4] Push a GitHub...
git push origin main

echo.
if %ERRORLEVEL% EQU 0 (
    color 0A
    echo  ============================================================
    echo   OK! DIAN UX desplegado.
    echo   Vercel: https://ferzu-pos.vercel.app  (~1 min)
    echo   - Sidebar: link "Facturacion DIAN" visible para admins
    echo   - Checkout: toggle "Requiere factura electronica?"
    echo     con campos NIT / Razon social / Email
    echo  ============================================================
) else (
    color 0C
    echo  ERROR. Revisa el mensaje arriba.
)
echo.
pause
