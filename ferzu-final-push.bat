@echo off
set LOG=C:\Users\fjfc1\Downloads\ferzu-pos\ferzu-final-log.txt
echo FERZU POS - Push Final > %LOG%
echo %DATE% %TIME% >> %LOG%
echo ================================ >> %LOG%

cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

REM Limpiar locks y el index corrupto
echo [1] Limpiando index corrupto y locks... >> %LOG%
if exist ".git\index.lock" del /f ".git\index.lock"
if exist ".git\HEAD.lock"  del /f ".git\HEAD.lock"
if exist ".git\index"      del /f ".git\index"
echo Index borrado >> %LOG%

REM Verificar estado actual
echo [2] HEAD actual: >> %LOG%
type .git\HEAD >> %LOG% 2>&1

REM Checkout de main desde origin (index limpio = sin conflictos)
echo [3] Checkout main desde origin: >> %LOG%
git checkout -b main origin/main >> %LOG% 2>&1

REM Verificar rama actual
echo [4] Rama actual: >> %LOG%
git branch >> %LOG% 2>&1

REM Ver log de main remoto (referencia)
echo [5] Log origin/main (top 3): >> %LOG%
git log --oneline -3 >> %LOG% 2>&1

REM Agregar TODOS los archivos del directorio actual
echo [6] git add -A (todos los archivos actuales): >> %LOG%
git add -A >> %LOG% 2>&1
echo Add OK >> %LOG%

REM Ver status resumido
echo [7] Status resumido: >> %LOG%
git status --short >> %LOG% 2>&1

REM Commit con los cambios F9-C + F10 + F11
echo [8] Commit: >> %LOG%
git commit -m "feat: F9-C variantes + F10 cortesias + F11 asistente IA dual-modo (Haiku/Sonnet)" >> %LOG% 2>&1

REM Push a main
echo [9] Push a origin/main: >> %LOG%
git push origin main >> %LOG% 2>&1

REM Confirmar ultimo commit
echo [10] Ultimo commit: >> %LOG%
git log --oneline -3 >> %LOG% 2>&1

echo ================================ >> %LOG%
echo FIN - Revisar ferzu-final-log.txt >> %LOG%

type %LOG%
pause
