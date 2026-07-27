@echo off
:: =============================================================================
:: FERZU POS — Commit de la Auditoría Completa (Tasks #62-#66)
:: Incluye: Tests, CI, offline checkout fix, dashboard bugs, backup system
:: =============================================================================
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

echo.
echo ===================================================
echo   FERZU POS — PUSH AUDITORÍA COMPLETA
echo ===================================================
echo.

:: Limpiar lock files antes del commit
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul

:: Verificar tests antes de pushear
echo [1/5] Corriendo tests backend...
cd backend
node --test tests/hmac.test.js tests/plans.test.js >nul 2>&1
if %errorlevel% NEQ 0 (
  echo FALLO: Tests no pasan. Corrige los errores antes de pushear.
  cd ..
  pause
  exit /b 1
)
echo   OK 13/13 tests pasan
cd ..
echo.

:: Stage de todos los cambios
echo [2/5] Preparando cambios para commit...
git add -A
echo.

:: Mostrar resumen de cambios
echo [3/5] Archivos a commitear:
git status --short
echo.

set /p CONFIRM="Confirmas el commit y push? (S/N): "
if /i not "%CONFIRM%"=="S" (
  echo Cancelado.
  git reset HEAD
  pause
  exit /b
)
echo.

:: Commit
echo [4/5] Haciendo commit...
git commit -m "feat: auditoria completa + sistema de recuperacion

Tasks #62-#66:
- Tests: Vitest frontend + Node nativo backend (13 tests)
- CI: GitHub Actions bloquea deploy si tests fallan
- Fix: SyncProvider envuelve POSProvider (offline checkout)
- Fix: DashboardPage supabase.raw() eliminado (crasheaba)
- Fix: DashboardPage AI chat URL relativa -> absoluta
- Fix: CheckoutPage Wompi -> Bold completo
- Nuevo: .env.example frontend y backend
- Nuevo: BACKUP.bat + RESTORE.bat + HEALTH_CHECK.bat
- Nuevo: AUTO_HEAL.bat (auto-sanacion del sistema)
- Nuevo: backend/guardian.js (monitor de salud daemon)
- Nuevo: PLAN_RECUPERACION.md (18 escenarios de desastre)

Reglas de Oro preservadas:
- Zero alucinaciones matematicas: backend calcula todo
- Aprobacion humana: usuario siempre aprueba acciones criticas
- Offline-First: ventas guardadas sin internet con Dexie"
echo.

:: Push
echo [5/5] Pusheando a GitHub...
git push origin main
if %errorlevel% EQU 0 (
  echo.
  echo ===================================================
  echo   PUSH EXITOSO
  echo   CI/CD iniciado en GitHub Actions.
  echo   Si los tests pasan, Vercel y Railway desplegaran.
  echo ===================================================
) else (
  echo.
  echo ERROR: Push fallo. Revisa la conexion o los permisos.
  echo Si hay lock files: ejecuta AUTO_HEAL.bat
)
echo.
pause
