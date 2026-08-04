@echo off
set LOG=C:\Users\fjfc1\Downloads\ferzu-pos\ferzu-push-main-log.txt
echo FERZU POS - Push main final > %LOG%
echo %DATE% %TIME% >> %LOG%
echo ================================ >> %LOG%

cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

REM Ver estado actual
echo [1] Ramas actuales: >> %LOG%
git branch -a >> %LOG% 2>&1

echo [2] Log actual: >> %LOG%
git log --oneline -3 >> %LOG% 2>&1

REM Renombrar master -> main
echo [3] Renombrar master a main: >> %LOG%
git branch -m master main >> %LOG% 2>&1

REM Soft reset a origin/main para mantener cambios pero conectar historial
echo [4] Soft reset a origin/main (mantiene cambios staged): >> %LOG%
git reset --soft origin/main >> %LOG% 2>&1

echo [5] Status tras reset: >> %LOG%
git status --short >> %LOG% 2>&1

REM Commit todos los cambios sobre el historial de origin/main
echo [6] Commit final: >> %LOG%
git commit -m "feat: F9-C variantes + F10 cortesias + F11 asistente IA dual-modo (Haiku/Sonnet)" >> %LOG% 2>&1

echo [7] Log post-commit: >> %LOG%
git log --oneline -4 >> %LOG% 2>&1

REM Push normal (fast-forward desde origin/main)
echo [8] Push origin main: >> %LOG%
git push origin main >> %LOG% 2>&1

echo [9] Verificacion final: >> %LOG%
git log --oneline -4 >> %LOG% 2>&1

echo ================================ >> %LOG%
echo FIN >> %LOG%

type %LOG%
pause
