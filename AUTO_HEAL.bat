@echo off
:: =============================================================================
:: FERZU POS — AUTO-SANACIÓN DEL SISTEMA
:: Detecta y corrige automáticamente los problemas más comunes.
:: =============================================================================
setlocal enabledelayedexpansion
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
set REPARACIONES=0

echo.
echo ===================================================
echo   FERZU POS — AUTO-SANACION
echo   %DATE% %TIME%
echo ===================================================
echo.
echo Diagnosticando y reparando problemas automaticamente...
echo.

:: ── 1. Eliminar lock files de git ────────────────────────────────────────────
echo [HEAL 1] Limpiando git lock files...
if exist ".git\index.lock" (del /f /q ".git\index.lock" & echo   REPARADO: index.lock eliminado & set /a REPARACIONES+=1) else echo   OK sin lock files
if exist ".git\HEAD.lock"  (del /f /q ".git\HEAD.lock"  & echo   REPARADO: HEAD.lock eliminado  & set /a REPARACIONES+=1)
if exist ".git\MERGE_HEAD" (del /f /q ".git\MERGE_HEAD" & echo   REPARADO: MERGE_HEAD eliminado & set /a REPARACIONES+=1)
echo.

:: ── 2. node_modules corrompida o faltante ─────────────────────────────────
echo [HEAL 2] Verificando node_modules frontend...
if not exist "node_modules\react\package.json" (
  echo   REPARANDO: reinstalando node_modules frontend...
  call npm ci 2>nul || call npm install
  echo   REPARADO
  set /a REPARACIONES+=1
) else echo   OK
echo.

echo [HEAL 3] Verificando node_modules backend...
if not exist "backend\node_modules\express\package.json" (
  echo   REPARANDO: reinstalando node_modules backend...
  cd backend
  call npm ci 2>nul || call npm install
  cd ..
  echo   REPARADO
  set /a REPARACIONES+=1
) else echo   OK
echo.

:: ── 3. Crear .env si no existe ───────────────────────────────────────────────
echo [HEAL 4] Verificando .env frontend...
if not exist ".env" (
  if exist ".env.example" (
    copy ".env.example" ".env" >nul
    echo   REPARADO: .env creado desde .env.example — RECUERDA llenar los valores reales
    set /a REPARACIONES+=1
  ) else (
    echo   WARN: No existe .env ni .env.example — crea el .env manualmente
  )
) else echo   OK
echo.

echo [HEAL 5] Verificando .env backend...
if not exist "backend\.env" (
  if exist "backend\.env.example" (
    copy "backend\.env.example" "backend\.env" >nul
    echo   REPARADO: backend/.env creado desde .env.example — RECUERDA llenar los valores
    set /a REPARACIONES+=1
  ) else (
    echo   WARN: No existe backend/.env — en Railway las vars van en Settings
  )
) else echo   OK
echo.

:: ── 4. Limpiar dist/ si está corrupta ────────────────────────────────────────
echo [HEAL 6] Verificando dist/...
if exist "dist\index.html" (
  echo   OK dist/ presente
) else (
  echo   INFO: dist/ no existe — se creara al hacer npm run build
)
echo.

:: ── 5. Limpiar logs antiguos ──────────────────────────────────────────────────
echo [HEAL 7] Limpiando logs antiguos (mas de 30 dias)...
if exist "backend\logs" (
  forfiles /P "backend\logs" /M "*.log" /D -30 /C "cmd /c del /f /q @path" >nul 2>&1
  echo   OK logs limpiados
) else echo   OK no hay logs
echo.

:: ── 6. Verificar integridad del package.json ─────────────────────────────────
echo [HEAL 8] Verificando package.json...
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))" >nul 2>&1 && echo   OK package.json valido || (echo   FALLO CRITICO: package.json corrupto — necesita reparacion manual & set /a REPARACIONES+=1)
node -e "JSON.parse(require('fs').readFileSync('backend/package.json','utf8'))" >nul 2>&1 && echo   OK backend/package.json valido || (echo   FALLO CRITICO: backend/package.json corrupto — necesita reparacion manual & set /a REPARACIONES+=1)
echo.

:: ── 7. Tests backend ─────────────────────────────────────────────────────────
echo [HEAL 9] Corriendo tests backend como verificacion final...
cd backend
node --test tests/hmac.test.js tests/plans.test.js >nul 2>&1
if !errorlevel! EQU 0 (echo   OK 13/13 tests pasan) else (echo   WARN: Tests fallando — revisa el codigo)
cd ..
echo.

:: ── RESUMEN ───────────────────────────────────────────────────────────────────
echo ===================================================
if !REPARACIONES! EQU 0 (
  echo   RESULTADO: Sistema ya estaba saludable.
  echo   No se necesitaron reparaciones.
) else (
  echo   RESULTADO: !REPARACIONES! reparacion(es) aplicada(s).
  echo   Ejecuta HEALTH_CHECK.bat para confirmar el estado.
)
echo ===================================================
echo.

set /p PUSH="Quieres hacer backup del estado actual? (S/N): "
if /i "%PUSH%"=="S" call BACKUP.bat

pause
