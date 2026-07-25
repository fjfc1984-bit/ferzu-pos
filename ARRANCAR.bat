@echo off
title FERZU POS — Instalacion y Arranque
color 0A
cls

echo.
echo  ==========================================
echo   FERZU POS — Instalacion Completa
echo  ==========================================
echo.

:: Matar procesos node existentes
echo [0] Liberando puertos...
taskkill /f /im node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

:: Borrar node_modules frontend completo
echo [1] Borrando node_modules frontend...
if exist "%~dp0node_modules" (
    rd /s /q "%~dp0node_modules"
    echo     OK - node_modules borrado
) else (
    echo     Ya estaba limpio
)

if exist "%~dp0package-lock.json" del /q "%~dp0package-lock.json"

:: Borrar node_modules backend
echo [2] Borrando node_modules backend...
if exist "%~dp0backend\node_modules" (
    rd /s /q "%~dp0backend\node_modules"
    echo     OK - backend/node_modules borrado
) else (
    echo     Ya estaba limpio
)

if exist "%~dp0backend\package-lock.json" del /q "%~dp0backend\package-lock.json"

:: Instalar frontend
echo.
echo [3] Instalando dependencias frontend (1-3 min)...
cd /d "%~dp0"
npm install
if %errorlevel% neq 0 (
    echo.
    echo ERROR en npm install frontend
    pause
    exit /b 1
)
echo     Frontend: LISTO

:: Instalar backend
echo.
echo [4] Instalando dependencias backend...
cd /d "%~dp0backend"
npm install
if %errorlevel% neq 0 (
    echo.
    echo ERROR en npm install backend
    pause
    exit /b 1
)
echo     Backend: LISTO

:: Guardar rutas en variables para evitar problemas de comillas
set FERZU=%~dp0
set BACKEND=%~dp0backend

:: Iniciar backend
echo.
echo [5] Iniciando backend (puerto 3001)...
start "FERZU Backend" cmd /k cd /d "%BACKEND%" ^&^& node server.js
timeout /t 3 /nobreak >nul

:: Iniciar frontend
echo [6] Iniciando frontend (puerto 5173)...
start "FERZU Frontend" cmd /k cd /d "%FERZU%" ^&^& npm run dev
timeout /t 8 /nobreak >nul

:: Abrir navegador
echo [7] Abriendo navegador...
start "" "http://localhost:5173"

echo.
echo  ==========================================
echo   FERZU POS corriendo en:
echo   http://localhost:5173
echo  ==========================================
echo.
pause
