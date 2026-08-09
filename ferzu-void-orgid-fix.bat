@echo off
title FERZU - Fix void_last_order: orders no tiene organization_id
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock

git add backend/lib/claudeTools.js

git commit -m "fix: void_last_order — orders no tiene organization_id

La tabla orders usa branch_id para trazar la org, NO organization_id.
Error: 'column orders.organization_id does not exist'

Cambios:
- dry_run: filtra por branch_id (caso normal) o por branches.in()
  como fallback cuando no hay branch en contexto
- execute: quita .eq('organization_id') del SELECT y UPDATE en orders
- Seguridad mantenida: branch_id viene del contexto autenticado (org-scoped)"

git push origin main
echo ERRORLEVEL: %ERRORLEVEL%
if %ERRORLEVEL% EQU 0 (
  echo OK - Railway desplegara en ~2 min
  echo.
  echo Luego escribe en el Co-Piloto: "anula la ultima venta"
  echo Deberia mostrar la orden con total + productos + confirmacion
) else (
  echo ERROR - revisar arriba
)
cmd /k
