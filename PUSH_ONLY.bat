@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul
del /f /q ".git\COMMIT_EDITMSG.lock" 2>nul
echo === Subiendo commits pendientes a GitHub... ===
git push origin main
echo.
echo === LISTO! ===
pause
