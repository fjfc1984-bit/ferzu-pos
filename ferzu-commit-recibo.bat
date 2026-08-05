@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

if exist ".git\index.lock" del /f /q ".git\index.lock"
if exist ".git\HEAD.lock"  del /f /q ".git\HEAD.lock"

git add -A

git commit -m "fix: recibo con nombre del negocio, NIT e IVA con porcentaje

Archivos corregidos:
- AuthScreens.jsx: agrega nit, nit_dv, phone al query de organizations
- POSPage.jsx: fallback window.print() muestra businessName real, NIT,
  fecha, subtotal, descuento, IVA con porcentaje y totales correctos
- thermalPrinter.js: printReceipt() acepta nit y lo imprime en header ESC/POS
- ThermalPrintButton.jsx: printFallback() muestra NIT, IVA con porcentaje
- index.css: estilo .receipt-nit para el NIT en window.print()"

git push origin main

echo.
echo === Ultimos commits ===
git log --oneline -3
echo.
pause
