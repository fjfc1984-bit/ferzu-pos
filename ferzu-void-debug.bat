@echo off
title FERZU - Debug void_last_order
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock

git add backend/lib/claudeTools.js

git commit -m "debug: void_last_order — verbose error con orgId/role/code diagnosticos

Agrega diagnostico detallado:
- Si orgId es undefined: retorna contexto completo para identificar el origen
- Error de DB: retorna message + code + hint + details + orgId + branchId
- Error de permiso: muestra el rol actual del usuario
Permite identificar la causa exacta del error actual."

git push origin main
echo ERRORLEVEL: %ERRORLEVEL%
if %ERRORLEVEL% EQU 0 (
  echo OK - Railway desplegara en ~2 min
  echo.
  echo Luego:
  echo   1. Espera 2 min
  echo   2. Abre el Co-Piloto
  echo   3. Escribe: "anula la ultima venta"
  echo   4. Copia el mensaje de error EXACTO que muestra el Co-Piloto
) else (
  echo ERROR - revisar arriba
)
cmd /k
