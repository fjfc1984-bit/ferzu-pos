@echo off
set LOG=C:\Users\fjfc1\Downloads\ferzu-pos\ferzu-recover-log.txt
echo FERZU POS - Recuperacion git > %LOG%
echo %DATE% %TIME% >> %LOG%
echo ================================ >> %LOG%

cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

REM Limpiar archivos corruptos creados por el sandbox Linux
echo. >> %LOG%
echo [1] Limpiando refs corruptos del sandbox... >> %LOG%
if exist ".git\refs\heads\main" del /f ".git\refs\heads\main" >> %LOG% 2>&1
if exist ".git\HEAD" del /f ".git\HEAD" >> %LOG% 2>&1
if exist ".git\index.lock" del /f ".git\index.lock" >> %LOG% 2>&1
if exist ".git\HEAD.lock" del /f ".git\HEAD.lock" >> %LOG% 2>&1
echo Limpiezas OK >> %LOG%

REM Verificar estado del repo con git nativo de Windows
echo. >> %LOG%
echo [2] Estado del repo (git log --all): >> %LOG%
git log --all --oneline -5 >> %LOG% 2>&1

echo. >> %LOG%
echo [3] Ramas disponibles: >> %LOG%
git branch -a >> %LOG% 2>&1

echo. >> %LOG%
echo [4] HEAD actual: >> %LOG%
type .git\HEAD >> %LOG% 2>&1

REM Si git funciona correctamente, hacer checkout main + merge + push
echo. >> %LOG%
echo [5] Checkout main... >> %LOG%
git checkout main >> %LOG% 2>&1

echo. >> %LOG%
echo [6] Merge de fix/client-errors-aug2026... >> %LOG%
git merge fix/client-errors-aug2026 >> %LOG% 2>&1

echo. >> %LOG%
echo [7] Push a GitHub... >> %LOG%
git push origin main >> %LOG% 2>&1

echo. >> %LOG%
echo [8] Ultimo commit en main: >> %LOG%
git log --oneline -3 >> %LOG% 2>&1

echo. >> %LOG%
echo ================================ >> %LOG%
echo FIN - Ver ferzu-recover-log.txt >> %LOG%

type %LOG%
pause
