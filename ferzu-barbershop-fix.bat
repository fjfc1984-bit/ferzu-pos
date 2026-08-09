@echo off
title FERZU POS — Fix Barbershop Walk-in
color 0A
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

echo [0/3] Limpiando locks...
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul

echo [1/3] Agregando cambios...
git add src/pages/BarbershopPage.jsx

echo [2/3] Haciendo commit...
git commit -m "fix(barbershop): cliente opcional en nueva cita - walk-in sin registro + crear cliente rapido inline sin salir del modal"

echo [3/3] Push a GitHub...
git push origin main

echo.
if %ERRORLEVEL% EQU 0 (
    color 0A
    echo  ============================================================
    echo   OK! Fix desplegado en Vercel (~1 min)
    echo.
    echo   CAMBIOS:
    echo   - Campo cliente ahora es OPCIONAL en nueva cita
    echo   - Walk-in: dejar vacio y guardar directamente
    echo   - Crear cliente nuevo: escribir nombre y aparecer boton
    echo     "+ Crear cliente [nombre]" con campo de telefono opcional
    echo  ============================================================
) else (
    color 0C
    echo  ERROR. Revisa el mensaje arriba.
)
echo.
pause
