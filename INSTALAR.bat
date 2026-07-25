@echo off
title FERZU POS - Instalacion
color 0A
echo.
echo  ============================================
echo   FERZU POS - Instalando dependencias...
echo  ============================================
echo.
echo  Este proceso tarda 1-2 minutos. No cierres
echo  esta ventana hasta que aparezca el mensaje
echo  de exito.
echo.

cd /d "%~dp0"

echo  [1/2] Instalando paquetes npm...
call npm install
if %errorlevel% neq 0 (
  echo.
  echo  ERROR: npm install fallo.
  echo  Asegurate de tener Node.js instalado: https://nodejs.org
  pause
  exit /b 1
)

echo.
echo  [2/2] Abriendo Ferzu POS en el navegador...
start http://localhost:5173

echo.
echo  ============================================
echo   Instalacion lista. Iniciando servidor...
echo  ============================================
echo.
echo  Cuando veas "Local: http://localhost:5173"
echo  abre Chrome en esa direccion.
echo.
echo  Para cerrar el servidor: presiona Ctrl+C
echo.
call npm run dev
pause
