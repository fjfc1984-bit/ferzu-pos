@echo off
title FERZU POS — Limpieza e Instalacion
color 0E

echo.
echo  FERZU POS — Limpieza e Instalacion de Dependencias
echo  ====================================================
echo  Este proceso tarda 2-5 minutos. No cierres esta ventana.
echo.

:: Verificar Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no esta instalado. Descargalo en https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODEVER=%%v
echo  Node.js: %NODEVER%
echo.

:: =====================
:: FRONTEND
:: =====================
echo [PASO 1/4] Limpiando frontend...
cd /d "%~dp0"

if exist node_modules (
    echo   Borrando node_modules del frontend...
    rmdir /s /q node_modules
    echo   Listo.
) else (
    echo   node_modules no existia, saltando.
)

if exist package-lock.json (
    del /q package-lock.json
    echo   package-lock.json eliminado.
)

echo.
echo [PASO 2/4] Instalando dependencias del frontend...
echo   (esto puede tardar 1-3 minutos)
echo.
npm install
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] npm install FALLO en el frontend.
    echo         Revisa el error de arriba y presiona una tecla.
    pause
    exit /b 1
)
echo.
echo   Frontend: OK

:: =====================
:: BACKEND
:: =====================
echo.
echo [PASO 3/4] Limpiando backend...
cd /d "%~dp0backend"

if exist node_modules (
    echo   Borrando node_modules del backend...
    rmdir /s /q node_modules
    echo   Listo.
) else (
    echo   node_modules no existia, saltando.
)

if exist package-lock.json (
    del /q package-lock.json
    echo   package-lock.json eliminado.
)

echo.
echo [PASO 4/4] Instalando dependencias del backend...
echo   (esto puede tardar 1-2 minutos)
echo.
npm install
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] npm install FALLO en el backend.
    echo         Revisa el error de arriba y presiona una tecla.
    pause
    exit /b 1
)
echo.
echo   Backend: OK

:: =====================
:: RESULTADO
:: =====================
echo.
echo  ============================================
echo   INSTALACION COMPLETADA EXITOSAMENTE
echo  ============================================
echo.
echo   Ahora ejecuta INICIAR.bat para arrancar
echo   el sistema FERZU POS.
echo.
pause
