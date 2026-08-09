@echo off
echo ========================================
echo  FERZU POS - Auditoria Arquitectural
echo  org / settings / dian / inventory
echo ========================================
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

echo [0/5] Limpiando locks...
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock

echo [1/5] Eliminando archivos muertos (server.new.js / server.original.js)...
git rm backend/server.new.js backend/server.original.js

echo [2/5] Agregando cambios de routes...
git add backend/routes/org.routes.js
git add backend/routes/settings.routes.js
git add backend/routes/dian.routes.js
git add backend/routes/inventory.routes.js

echo [3/5] Commit...
git commit -m "refactor: auditoria arquitectural — supabase unificado, logger estructurado, req.user.id fix, dead code eliminado

CRITICO:
  - org.routes.js: req.userId -> req.user.id (PATCH /org/modules estaba siempre roto: 404)

MEDIO:
  - settings.routes.js: createClient local -> supabaseAdmin desde config; agrega logger; console -> logger (x3)
  - dian.routes.js: createClient local -> supabaseAdmin desde config; agrega logger; console -> logger (x12)
  - inventory.routes.js: agrega import logger; console.error -> logger.error

DEAD CODE:
  - backend/server.new.js eliminado (151 lineas)
  - backend/server.original.js eliminado (1933 lineas)"

echo [4/5] Push a GitHub...
git push origin main

IF %ERRORLEVEL% NEQ 0 (
    echo ERROR: Revisa el error arriba.
    pause
    exit /b 1
)

echo.
echo ========================================
echo OK - Railway desplegara en ~2 min.
echo.
echo Bugs corregidos:
echo  [CRITICO] org/modules: PATCH /api/org/modules ahora funciona (req.user.id)
echo  [MEDIO]   settings, dian, inventory: supabase unificado + logger estructurado
echo  [LIMPIEZA] 2084 lineas de codigo muerto eliminadas
echo ========================================
pause
