@echo off
title FERZU - Fix void_last_order query
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock

git add backend/lib/claudeTools.js

git commit -m "fix: void_last_order — separar query orders de order_items

PostgREST lanza 'column orders.organization_id does not exist'
cuando se combina select con join embebido + .eq() filter.

Solucion: dos queries separadas
  1. orders (sin join): busca la orden por org/branch/status/fecha
  2. order_items: busca items por order_id
Evita la ambiguedad de PostgREST con relaciones embebidas."

git push origin main
echo ERRORLEVEL: %ERRORLEVEL%
if %ERRORLEVEL% EQU 0 (
  echo OK - Railway desplegara en ~2 min
  echo Luego prueba: "anula la ultima venta"
) else (
  echo ERROR - revisar arriba
)
cmd /k
