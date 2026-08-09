@echo off
title FERZU POS — Paso 4: Prioridad Clientes
color 0A
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul
git push origin main
if %ERRORLEVEL% EQU 0 (
    echo.
    echo  OK! Vercel desplegando en ~1 min
    echo.
    echo  CAMBIOS:
    echo  [Barberia]  Busqueda prioriza clientes habituales (preferred_module=barbershop)
    echo              Badge "scissor habitual" en resultados
    echo  [POS]       CustomerSearch migrado a Supabase directo (fix endpoint inexistente)
    echo              Prioriza clientes del modulo activo
    echo              Badge "estrella habitual" en resultados
    echo              Creacion rapida guarda preferred_module automaticamente
) else (
    echo  ERROR
)
pause
