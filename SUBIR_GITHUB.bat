@echo off
title FERZU POS — Subiendo a GitHub...
color 0B
cls

echo.
echo  ==========================================
echo   FERZU POS — Subir codigo a GitHub
echo  ==========================================
echo.

cd /d "%~dp0"

:: Inicializar git si no existe
if not exist ".git" (
    echo [1] Inicializando repositorio git...
    git init
    git branch -M main
) else (
    echo [1] Git ya inicializado.
)

:: Agregar remote si no existe
git remote get-url origin >nul 2>&1
if %errorlevel% neq 0 (
    echo [2] Configurando repositorio remoto...
    git remote add origin https://github.com/fjfc1984-bit/ferzu-pos.git
) else (
    echo [2] Remote ya configurado.
)

:: Agregar todos los archivos y hacer commit
echo [3] Agregando archivos...
git add .

echo [4] Creando commit...
git commit -m "FERZU POS v1.0 — Deploy inicial" --allow-empty

:: Subir a GitHub
echo [5] Subiendo a GitHub...
echo     (Si pide usuario/contrasena, usa tu token de GitHub)
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo  ==========================================
    echo   CODIGO SUBIDO EXITOSAMENTE
    echo   https://github.com/fjfc1984-bit/ferzu-pos
    echo  ==========================================
) else (
    echo.
    echo  ERROR al subir. Intenta abrir GitHub Desktop
    echo  y sincronizar desde ahi.
)
echo.
pause
