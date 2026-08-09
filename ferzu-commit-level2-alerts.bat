@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
git add backend/services/alertDispatcher.service.js backend/routes/settings.routes.js backend/lib/claudeTools.js
git commit -m "feat: Level 2 alerts — alertDispatcher service + endpoints config + hooks en system_alerts"
git push origin main
echo.
echo ✅ Push completado. Railway desplegara en ~2 min.
pause
