@echo off
title FERZU POS — Subiendo a GitHub...
color 0B
cls
echo.
echo  Subiendo FERZU POS a GitHub...
echo  (puede pedir tu contrasena de GitHub)
echo.
cd /d "%~dp0"
git push -u origin main
if %errorlevel% equ 0 (
    echo.
    echo  LISTO: https://github.com/fjfc1984-bit/ferzu-pos
) else (
    echo.
    echo  ERROR - Abre GitHub Desktop y sincroniza manualmente.
)
echo.
pause
