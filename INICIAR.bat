@echo off
title FERZU POS — Iniciando...
color 0A
cls

echo.
echo  ==========================================
echo   FERZU POS — Arranque Rapido
echo  ==========================================
echo.

:: Verificar que node_modules exista; si no, hacer install primero
if not exist "%~dp0node_modules" (
    echo [!] No hay node_modules. Instalando dependencias frontend...
    cd /d "%~dp0"
    npm install
)
if not exist "%~dp0backend\node_modules" (
    echo [!] No hay node_modules en backend. Instalando...
    cd /d "%~dp0backend"
    npm install
)

:: Matar procesos node viejos para liberar puertos
echo [1] Liberando puertos 3001 y 5173...
taskkill /f /im node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

:: Guardar rutas
set FERZU=%~dp0
set BACKEND=%~dp0backend

:: Iniciar backend
echo [2] Iniciando backend  (puerto 3001)...
start "FERZU Backend" cmd /k "cd /d "%BACKEND%" && node server.js"
timeout /t 3 /nobreak >nul

:: Iniciar frontend
echo [3] Iniciando frontend (puerto 5173)...
start "FERZU Frontend" cmd /k "cd /d "%FERZU%" && npm run dev"
timeout /t 8 /nobreak >nul

:: Abrir POS directamente
echo [4] Abriendo POS...
start "" "http://localhost:5173/pos"

echo.
echo  ==========================================
echo   FERZU POS listo en:
echo   http://localhost:5173/pos
echo  ==========================================
echo.
echo  Cierra esta ventana cuando quieras.
pause
