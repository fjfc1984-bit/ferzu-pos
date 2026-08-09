@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
git add backend/services/alertDispatcher.service.js
git commit -m "feat: alertDispatcher soporte Twilio WhatsApp Sandbox (auto-detecta proveedor)"
git push origin main
echo.
echo ✅ Push completado. Railway desplegara en ~2 min.
pause
