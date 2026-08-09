@echo off
title FERZU POS — Push Contextualización por Módulo
color 0A
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul
git push origin main
if %ERRORLEVEL% EQU 0 (
    echo.
    echo  ✅ Push exitoso — Vercel desplegando en ~1 min
    echo.
    echo  CAMBIOS EN PRODUCCION:
    echo  - NicheContextBar en Barberia y Taller
    echo  - Servicios de Barberia filtrados por niche
    echo  - Clientes creados quedan marcados con preferred_module
    echo  - Migración 010: correr en Supabase SQL Editor
) else (
    echo  ERROR — ejecuta: git push origin main en Git Bash
)
pause
