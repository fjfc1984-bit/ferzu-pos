@echo off
title FERZU POS - Servidor
color 0A
echo.
echo  ============================================
echo   FERZU POS - Iniciando servidor...
echo  ============================================
echo.
cd /d "%~dp0"
start http://localhost:5173
call npm run dev
pause
