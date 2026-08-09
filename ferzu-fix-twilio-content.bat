@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
git add backend/services/alertDispatcher.service.js
git commit -m "debug: Twilio — log error completo en message text para diagnostico Content API"
git push origin main
echo.
echo Espera ~2 min, luego prueba WhatsApp y dile a Claude que revise los logs.
pause
