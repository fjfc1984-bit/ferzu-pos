@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
git add backend/routes/settings.routes.js src/pages/SettingsPage.jsx
git commit -m "fix: alert test — enviar phone_numbers desde UI al backend (sin depender de BD)"
git push origin main
echo.
echo ✅ Push completado. Railway y Vercel desplegarán en ~2 min.
pause
