@echo off
set LOG=C:\Users\fjfc1\Downloads\ferzu-pos\ferzu-push-log.txt
echo. > %LOG%
echo ============================================ >> %LOG%
echo  FERZU POS — push a GitHub >> %LOG%
echo  %DATE% %TIME% >> %LOG%
echo ============================================ >> %LOG%

cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

REM Limpiar locks residuales
if exist ".git\index.lock" del /f ".git\index.lock"
if exist ".git\HEAD.lock"  del /f ".git\HEAD.lock"

echo ULTIMO COMMIT: >> %LOG%
git log --oneline -3 >> %LOG% 2>&1

echo. >> %LOG%
echo ESTADO: >> %LOG%
git status --short >> %LOG% 2>&1

echo. >> %LOG%
echo CHECKOUT MAIN: >> %LOG%
git checkout main >> %LOG% 2>&1

echo. >> %LOG%
echo MERGE fix/client-errors-aug2026: >> %LOG%
git merge fix/client-errors-aug2026 >> %LOG% 2>&1

echo. >> %LOG%
echo PUSH: >> %LOG%
git push origin main >> %LOG% 2>&1

echo. >> %LOG%
echo FIN. >> %LOG%

REM Mostrar en pantalla
type %LOG%
pause
