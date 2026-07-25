@echo off
title FERZU POS — Reparando backend...
color 0E
cls

echo.
echo  ==========================================
echo   FERZU POS — Reparacion de Backend
echo  ==========================================
echo.

:: Matar procesos node viejos
echo [1] Cerrando procesos anteriores...
taskkill /f /im node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

:: Instalar SOLO el backend (el frontend ya esta instalado)
echo [2] Instalando dependencias del backend...
cd /d "%~dp0backend"
npm install
if %errorlevel% neq 0 (
    echo.
    echo  ERROR en npm install del backend
    echo  Revisa tu conexion a internet e intenta de nuevo
    pause
    exit /b 1
)
echo     Backend: LISTO

:: Guardar rutas
set FERZU=%~dp0
set BACKEND=%~dp0backend

:: Iniciar backend
echo.
echo [3] Iniciando backend (puerto 3001)...
start "FERZU Backend" cmd /k "cd /d "%BACKEND%" && node server.js"
timeout /t 4 /nobreak >nul

:: Iniciar frontend
echo [4] Iniciando frontend (puerto 5173)...
start "FERZU Frontend" cmd /k "cd /d "%FERZU%" && npm run dev"
timeout /t 8 /nobreak >nul

:: Abrir POS
echo [5] Abriendo POS...
start "" "http://localhost:5173/pos"

echo.
echo  ==========================================
echo   FERZU POS listo en:
echo   http://localhost:5173/pos
echo  ==========================================
echo.
pause
