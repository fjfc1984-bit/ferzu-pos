@echo off
title FERZU POS — Fix Schema customers first_name/last_name
color 0A
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul
git add -A
git commit -m "fix: customers first_name/last_name + unique index phone (migration 011)"
git push origin main
if %ERRORLEVEL% EQU 0 (
    echo.
    echo  OK! Vercel desplegando en ~1 min
    echo.
    echo  CAMBIOS:
    echo  [DB]         Migration 011 — UNIQUE INDEX en customers(org_id, phone)
    echo  [Barberia]   Busqueda usa first_name en vez de name
    echo               Quick-create guarda first_name correctamente
    echo  [Taller]     Upsert usa first_name + onConflict por phone cuando hay telefono
    echo  [POS]        CustomerSearch usa first_name en busqueda y creacion
) else (
    echo  ERROR al hacer push
)
pause
