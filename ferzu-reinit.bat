@echo off
set LOG=C:\Users\fjfc1\Downloads\ferzu-pos\ferzu-reinit-log.txt
echo FERZU POS - Reinicializacion git > %LOG%
echo %DATE% %TIME% >> %LOG%
echo ================================ >> %LOG%

cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

REM Limpiar locks residuales
if exist ".git\index.lock" del /f ".git\index.lock"
if exist ".git\HEAD.lock"  del /f ".git\HEAD.lock"

REM Verificar si git funciona
echo [1] Test git: >> %LOG%
git --version >> %LOG% 2>&1

REM Si HEAD no existe, recrearlo y reinicializar
echo [2] git init (reinicializar sin borrar objetos existentes): >> %LOG%
git init >> %LOG% 2>&1

REM Verificar remoto
echo [3] Remoto actual: >> %LOG%
git remote -v >> %LOG% 2>&1

REM Agregar remoto si no existe
git remote get-url origin >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo Agregando remoto origin... >> %LOG%
  git remote add origin https://github.com/fjfc1984-bit/ferzu-pos.git >> %LOG% 2>&1
)

REM Fetch del remoto para traer el historial
echo [4] git fetch origin: >> %LOG%
git fetch origin >> %LOG% 2>&1

REM Ver ramas locales y remotas
echo [5] Ramas disponibles: >> %LOG%
git branch -a >> %LOG% 2>&1

REM Ver log
echo [6] Log (todo): >> %LOG%
git log --all --oneline -5 >> %LOG% 2>&1

REM Verificar si fix/client-errors-aug2026 existe localmente
git show-ref --verify --quiet refs/heads/fix/client-errors-aug2026
if %ERRORLEVEL% EQU 0 (
  echo [7] Rama fix/client-errors-aug2026 existe - checkout directo >> %LOG%
  git checkout fix/client-errors-aug2026 >> %LOG% 2>&1
) else (
  echo [7] Rama local no existe - haciendo checkout de main remoto >> %LOG%
  git checkout -b main origin/main >> %LOG% 2>&1
  echo Estado actual: >> %LOG%
  git status --short >> %LOG% 2>&1
  echo Agregando todos los archivos nuevos: >> %LOG%
  git add -A >> %LOG% 2>&1
  echo Commit con todos los cambios: >> %LOG%
  git commit -m "feat: F9-C variantes + F10 cortesias + F11 asistente IA dual-modo (Haiku/Sonnet)" >> %LOG% 2>&1
  echo Push a main: >> %LOG%
  git push origin main >> %LOG% 2>&1
  goto :END
)

REM Si estamos en fix/client-errors-aug2026, merge a main y push
echo [8] Checkout main: >> %LOG%
git checkout main >> %LOG% 2>&1
if %ERRORLEVEL% NEQ 0 (
  git checkout -b main origin/main >> %LOG% 2>&1
)
echo [9] Merge fix/client-errors-aug2026: >> %LOG%
git merge fix/client-errors-aug2026 >> %LOG% 2>&1
echo [10] Push a main: >> %LOG%
git push origin main >> %LOG% 2>&1

:END
echo [FIN] Ultimo commit en HEAD: >> %LOG%
git log --oneline -3 >> %LOG% 2>&1
echo ================================ >> %LOG%
echo FIN >> %LOG%

type %LOG%
pause
