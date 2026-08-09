@echo off
title FERZU POS — Fix Modulos Independientes
color 0A
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

echo [0/4] Limpiando locks...
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul

echo [1/4] Agregando los 3 modulos modificados...
git add src/pages/BarbershopPage.jsx
git add src/pages/WorkshopPage.jsx
git add src/pages/POSPage.jsx

echo [2/4] Verificando cambios...
git status

echo [3/4] Haciendo commit...
git commit -m "fix(ux): modulos independientes — cliente opcional en Barberia, Taller y POS con creacion rapida inline sin salir del modal"

echo [4/4] Push a GitHub...
git push origin main

echo.
if %ERRORLEVEL% EQU 0 (
    color 0A
    echo  ============================================================
    echo   OK! Cambios desplegados en Vercel (~1 min)
    echo.
    echo   MODULOS ACTUALIZADOS:
    echo   [Barberia]  Cliente OPCIONAL — walk-in sin registro
    echo               + Crear cliente nuevo inline desde el modal de cita
    echo   [Taller]    Solo la PLACA es obligatoria
    echo               Cliente puede dejarse en blanco
    echo   [POS]       Cliente OPCIONAL en venta directa
    echo               + Crear cliente nuevo inline desde el buscador
    echo.
    echo   Todos los modulos funcionan SIN depender de otros modulos
    echo  ============================================================
) else (
    color 0C
    echo  ERROR en el push. Revisa el mensaje arriba.
    echo  Si pide credenciales, ejecuta: git push origin main
    echo  en una terminal Git Bash normal.
)
echo.
pause
