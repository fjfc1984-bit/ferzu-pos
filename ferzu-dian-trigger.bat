@echo off
title FERZU POS — DIAN Trigger (Tarea #40)
color 0A
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

echo [0/4] Limpiando locks...
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul

echo [1/4] Agregando archivos...
git add backend/routes/orders.routes.js
git add backend/lib/dian.js

echo [2/4] Haciendo commit...
git commit -m "feat(dian): conectar triggerElectronicInvoice() al flujo de pago — fire-and-forget en POST /payment y POST /orders, overrides NIT/email para factura a empresa, cortesias excluidas"

echo [3/4] Push a GitHub...
git push origin main

echo.
if %ERRORLEVEL% EQU 0 (
    color 0A
    echo  ============================================================
    echo   OK! DIAN trigger conectado al checkout.
    echo   Railway: redeploy automatico (~2 min)
    echo   Ahora cada orden pagada dispara la factura automaticamente
    echo   si la org tiene DIAN configurado.
    echo  ============================================================
) else (
    color 0C
    echo  ERROR. Revisa el mensaje arriba.
)
echo.
pause
