@echo off
title FERZU POS — Servidores
color 0A
cls

set FERZU=%~dp0
set BACKEND=%~dp0backend

echo.
echo  FERZU POS — Iniciando servidores...
echo.

echo [1] Matando procesos node anteriores...
taskkill /f /im node.exe >nul 2>&1
timeout /t 1 /nobreak >nul

echo [2] Iniciando Backend en puerto 3001...
start "FERZU Backend" cmd /k cd /d "%BACKEND%" ^&^& npm install ^&^& node server.js
timeout /t 4 /nobreak >nul

echo [3] Iniciando Frontend en puerto 5173...
start "FERZU Frontend" cmd /k cd /d "%FERZU%" ^&^& npm run dev
timeout /t 8 /nobreak >nul

echo [4] Abriendo navegador...
start "" "http://localhost:5173"

echo.
echo  FERZU POS en http://localhost:5173
echo.
pause
