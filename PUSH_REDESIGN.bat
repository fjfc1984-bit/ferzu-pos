@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul
echo === Subiendo redesign premium a GitHub... ===
git push origin main
echo.
echo === LISTO! Vercel desplegara en ~30 segundos ===
echo === Visita: https://ferzu-pos.vercel.app ===
pause
