@echo off
:: =============================================================================
:: FERZU POS — HEALTH CHECK COMPLETO
:: Verifica el estado de cada componente del sistema.
:: Corre esto antes de cualquier deploy o cuando algo se vea raro.
:: =============================================================================
setlocal enabledelayedexpansion
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
set ERRORES=0

echo.
echo ===================================================
echo   FERZU POS — HEALTH CHECK
echo   %DATE% %TIME%
echo ===================================================
echo.

:: ── 1. Node.js y npm ─────────────────────────────────────────────────────────
echo [CHECK 1] Node.js y npm...
node --version >nul 2>&1 && (echo   OK node: && node --version) || (echo   FALLO: Node.js no instalado & set /a ERRORES+=1)
npm --version >nul 2>&1 && (echo   OK npm: && npm --version) || (echo   FALLO: npm no encontrado & set /a ERRORES+=1)
echo.

:: ── 2. node_modules ──────────────────────────────────────────────────────────
echo [CHECK 2] node_modules...
if exist "node_modules\react\package.json" (echo   OK frontend node_modules) else (echo   FALLO: Falta node_modules frontend — ejecuta npm install & set /a ERRORES+=1)
if exist "backend\node_modules\express\package.json" (echo   OK backend node_modules) else (echo   FALLO: Falta node_modules backend — ejecuta npm install en /backend & set /a ERRORES+=1)
echo.

:: ── 3. Archivos críticos ──────────────────────────────────────────────────────
echo [CHECK 3] Archivos criticos del proyecto...
for %%F in (
  "src\App.jsx"
  "src\context\POSContext.jsx"
  "src\context\SyncContext.jsx"
  "src\context\AuthContext.jsx"
  "src\lib\api.js"
  "src\lib\boldCheckout.js"
  "src\lib\db.js"
  "backend\server.js"
  "vite.config.js"
  "package.json"
  "backend\package.json"
) do (
  if exist %%F (echo   OK %%F) else (echo   FALLO: FALTA %%F & set /a ERRORES+=1)
)
echo.

:: ── 4. Variables de entorno frontend ─────────────────────────────────────────
echo [CHECK 4] Variables de entorno frontend (.env)...
if exist ".env" (
  findstr /C:"VITE_SUPABASE_URL" .env >nul && echo   OK VITE_SUPABASE_URL || (echo   FALTA VITE_SUPABASE_URL en .env & set /a ERRORES+=1)
  findstr /C:"VITE_SUPABASE_ANON_KEY" .env >nul && echo   OK VITE_SUPABASE_ANON_KEY || (echo   FALTA VITE_SUPABASE_ANON_KEY en .env & set /a ERRORES+=1)
  findstr /C:"VITE_API_URL" .env >nul && echo   OK VITE_API_URL || (echo   FALTA VITE_API_URL en .env & set /a ERRORES+=1)
  findstr /C:"VITE_BOLD_API_KEY" .env >nul && echo   OK VITE_BOLD_API_KEY || (echo   WARN: VITE_BOLD_API_KEY no configurada — pagos Bold no funcionaran)
) else (
  echo   FALLO: No existe .env — copia .env.example a .env
  set /a ERRORES+=1
)
echo.

:: ── 5. Variables de entorno backend ──────────────────────────────────────────
echo [CHECK 5] Variables de entorno backend (backend/.env)...
if exist "backend\.env" (
  findstr /C:"SUPABASE_URL" backend\.env >nul && echo   OK SUPABASE_URL || (echo   FALTA SUPABASE_URL en backend/.env & set /a ERRORES+=1)
  findstr /C:"SUPABASE_SERVICE_ROLE_KEY" backend\.env >nul && echo   OK SUPABASE_SERVICE_ROLE_KEY || (echo   FALTA SUPABASE_SERVICE_ROLE_KEY en backend/.env & set /a ERRORES+=1)
  findstr /C:"ANTHROPIC_API_KEY" backend\.env >nul && echo   OK ANTHROPIC_API_KEY || (echo   WARN: ANTHROPIC_API_KEY no configurada — IA no funcionara)
  findstr /C:"BOLD_SECRET_KEY" backend\.env >nul && echo   OK BOLD_SECRET_KEY || (echo   WARN: BOLD_SECRET_KEY no configurada — webhook Bold no verificara)
) else (
  echo   WARN: No existe backend/.env — en Railway las vars van en Settings
)
echo.

:: ── 6. Git state ──────────────────────────────────────────────────────────────
echo [CHECK 6] Estado de git...
git status --short >nul 2>&1 && (
  for /f %%C in ('git status --short 2^>nul ^| find /C /V ""') do set GIT_DIRTY=%%C
  if !GIT_DIRTY! GTR 0 (echo   WARN: !GIT_DIRTY! archivos sin commitear) else (echo   OK repo limpio)
  for /f "tokens=*" %%L in ('git log --oneline -1 2^>nul') do echo   Ultimo commit: %%L
) || (echo   WARN: No es un repo git o git no esta instalado)
if exist ".git\index.lock" (echo   WARN: .git/index.lock presente — puede bloquear git push & set /a ERRORES+=1)
if exist ".git\HEAD.lock" (echo   WARN: .git/HEAD.lock presente — puede bloquear git push & set /a ERRORES+=1)
echo.

:: ── 7. Backend local ping ────────────────────────────────────────────────────
echo [CHECK 7] Backend local (localhost:3001)...
curl -s --max-time 3 http://localhost:3001/health >nul 2>&1 && echo   OK backend corriendo localmente || echo   INFO: Backend local no responde (normal si no esta iniciado)
echo.

:: ── 8. Backend produccion Railway ───────────────────────────────────────────
echo [CHECK 8] Backend produccion (Railway)...
if exist ".env" (
  for /f "tokens=2 delims==" %%U in ('findstr "VITE_API_URL" .env 2^>nul') do (
    set API_URL=%%U
    set API_URL=!API_URL:/api=!
    curl -s --max-time 5 !API_URL!/health >nul 2>&1 && echo   OK Railway responde && (curl -s --max-time 5 !API_URL!/health) || echo   WARN: Railway no responde en !API_URL!
  )
) else (
  echo   SKIP: .env no encontrado para leer VITE_API_URL
)
echo.

:: ── 9. Tests ─────────────────────────────────────────────────────────────────
echo [CHECK 9] Tests backend...
cd backend
node --test tests/hmac.test.js tests/plans.test.js >nul 2>&1 && echo   OK 13/13 tests pasan || (echo   FALLO: Tests del backend fallan & set /a ERRORES+=1)
cd ..
echo.

:: ── RESUMEN ───────────────────────────────────────────────────────────────────
echo ===================================================
if !ERRORES! EQU 0 (
  echo   RESULTADO: SISTEMA SALUDABLE ✓
  echo   Todos los checks pasaron correctamente.
) else (
  echo   RESULTADO: !ERRORES! PROBLEMA(S) ENCONTRADO(S)
  echo   Revisa los items marcados con FALLO arriba.
  echo   Ejecuta AUTO_HEAL.bat para correcciones automaticas.
)
echo ===================================================
echo.
pause
