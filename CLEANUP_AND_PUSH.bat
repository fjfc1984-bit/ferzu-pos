@echo off
chcp 65001 >nul
echo.
echo [FERZU] Limpieza y reorganizacion del repo...
echo.

cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

:: Eliminar locks si existen
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock

:: Destrackear scripts obsoletos del repo
git rm --cached --ignore-unmatch ^
  PUSH_AUDIT_FIXES.bat PUSH_BOLD.bat PUSH_DIAN_MODAL.bat ^
  PUSH_ERROR_BACKUP.bat PUSH_FIX_LANDING.bat PUSH_LANDING.bat ^
  PUSH_OFFLINE_CHECKOUT.bat PUSH_ONLY.bat PUSH_REDESIGN.bat ^
  PUSH_RESET_PASSWORD.bat PUSH_SECURITY_FIX.bat PUSH_T75_T79.bat ^
  PUSH_TESTS.bat PUSH_TRIAL_EMAIL.bat PUSH_REFACTOR.bat PUSH_REFACTOR.ps1 ^
  COMMIT_BARBERSHOP_FIX.bat COMMIT_DESIGN.bat ^
  FIX2.ps1 FIX_VITE.ps1 ^
  ABRIR.bat ARRANCAR.bat AUTO_HEAL.bat BACKUP.bat HEALTH_CHECK.bat ^
  LIMPIAR_E_INSTALAR.bat REPARAR.bat RESTORE.bat RUN_MIGRATE.bat ^
  SERVIDORES.bat SETUP.ps1 START_FRONTEND.bat SUBIR_GITHUB.bat ^
  schema_v2.sql views_v1.sql 2>nul

:: Agregar nueva estructura
git add database/ .gitignore FERZU.bat

:: Commit
git commit -m "refactor: consolidar scripts en FERZU.bat + organizar migraciones SQL"

:: Push
git push origin main

echo.
echo [OK] Repo limpio. Vercel desplegara en ~1 min.
pause
