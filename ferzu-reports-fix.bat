@echo off
title FERZU POS — Fix Reports Routes
color 0A
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul
git add -A
git commit -m "fix: reports.routes corrige organization_id/discount_amount/payment_method en orders"
git push origin main
if %ERRORLEVEL% EQU 0 (
    echo.
    echo  OK! Railway redesplegando en ~2 min
    echo.
    echo  CAMBIOS en reports.routes.js:
    echo  - Reemplaza organization_id por branch_id en queries a orders
    echo  - discount_total corregido a discount_amount
    echo  - payment_method lee de payments[] join en vez de columna inexistente
    echo  - /daily, /weekly, /period, /monthly: branch_id ahora requerido
    echo  - /branch-comparison: filtra branches por organization_id correctamente
) else (
    echo  ERROR al hacer push
)
pause
