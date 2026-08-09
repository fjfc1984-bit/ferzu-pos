@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
git add backend/services/alertDispatcher.service.js backend/routes/settings.routes.js
git commit -m "fix: alert test — pasar overrideOrg al dispatcher + gate WhatsApp incluye Twilio"
git push origin main
echo.
echo ✅ Push completado. Railway redesplegará en ~2 min.
pause
