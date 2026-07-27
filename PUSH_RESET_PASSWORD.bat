@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul
echo === Subiendo fix recuperacion de contrasena a GitHub... ===
git add src/pages/auth/AuthScreens.jsx src/App.jsx
git commit -m "fix: pagina reset-password + redirect correcto en forgot-password"
git push origin main
echo.
echo === LISTO! Vercel despliega en ~30 segundos ===
echo === https://ferzu-pos.vercel.app/reset-password estara disponible ===
pause
