@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
del /f /q ".git\index.lock" 2>nul
echo === Subiendo fix de seguridad a GitHub... ===
git add backend/server.js
git commit -m "security: CORS allowlist + bloquear /deploy-schema y /api/internal/migrate en produccion + JSON limit 2mb"
git push origin main
echo.
echo === LISTO! Railway redespliega en ~2 minutos ===
pause
