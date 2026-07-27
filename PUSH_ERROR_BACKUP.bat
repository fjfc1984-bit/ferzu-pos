@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
del /f /q ".git\index.lock" 2>nul
echo === Subiendo sistema de backup de errores a GitHub... ===
git add backend/server.js src/main.jsx src/components/ErrorBoundary.jsx
git commit -m "feat: sistema de backup de errores — ErrorBoundary frontend + handlers proceso backend + endpoint /api/errors"
git push origin main
echo.
echo === LISTO! ===
echo === Vercel despliega frontend en ~1 minuto ===
echo === Railway redesplega backend en ~2 minutos ===
pause
