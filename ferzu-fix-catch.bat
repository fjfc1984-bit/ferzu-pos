@echo off
title FERZU - Fix supabase .catch()
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock

git add backend/routes/ai.routes.js
git add backend/lib/dian.js

git commit -m "fix: supabaseAdmin insert().catch() is not a function

supabase-js v2: insert/update/delete retornan PostgrestFilterBuilder
que NO es una Promise real — no tiene .then()/.catch() propios.
Solucion: envolver en Promise.resolve() antes de encadenar .catch()

Archivos:
  ai.routes.js:
    - /ai/copilot/chat: insert historial fire-and-forget
    - /ai/business-chat: insert historial fire-and-forget
  dian.js:
    - insert system_alerts"

git push origin main
echo ERRORLEVEL: %ERRORLEVEL%
if %ERRORLEVEL% EQU 0 (
  echo OK - Railway desplegara en ~2 min
  echo Luego prueba el Co-Piloto de nuevo
) else (
  echo ERROR - revisar arriba
)
cmd /k
