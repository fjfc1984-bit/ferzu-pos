@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
git add backend/routes/ai.routes.js
git commit -m "feat: Co-Piloto prompt maestro — comportamiento proactivo para los 5 dolores criticos del negocio"
git push origin main
echo.
echo ✅ Push completado. Railway desplegara en ~2 min.
pause
