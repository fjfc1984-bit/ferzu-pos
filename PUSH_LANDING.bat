@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
echo === Limpiando locks ===
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul
del /f /q ".git\refs\heads\main.lock" 2>nul
echo === Subiendo Landing Page + Modal DIAN a GitHub... ===
git add src/pages/LandingPage.jsx src/App.jsx src/pages/DashboardPage.jsx
git commit -m "feat: landing page publica + modal DIAN en dashboard"
git push origin main
echo.
echo === Listo! Vercel desplegara en ~1 minuto ===
echo === Visita: https://ferzu-pos.vercel.app ===
pause
