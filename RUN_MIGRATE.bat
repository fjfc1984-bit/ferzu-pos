@echo off
chcp 65001 > nul
title FERZU POS — Migración de Base de Datos
color 0B

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║        FERZU POS — Migracion de Base de Datos       ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

cd /d "%~dp0"

echo  Instalando dependencias del backend...
cd backend
call npm install --silent 2>nul
cd ..

echo.
echo  Ejecutando migracion...
echo.

node backend\migrate.mjs

echo.
if %ERRORLEVEL% EQU 0 (
    echo  [OK] Migracion completada. Puedes cerrar esta ventana.
) else (
    echo  [!] La migracion automatica fallo.
    echo.
    echo  ALTERNATIVA: Abre DEPLOY_SCHEMA.html en tu navegador
    echo  (donde tienes sesion en supabase.com) y haz clic en
    echo  "Desplegar Schema en Supabase"
    echo.
    echo  Abriendo DEPLOY_SCHEMA.html...
    start "" "%~dp0DEPLOY_SCHEMA.html"
)

echo.
pause
