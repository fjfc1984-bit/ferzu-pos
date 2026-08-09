@echo off
title FERZU - Sistema de alertas externas
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock

git add backend/services/alerts.service.js
git add backend/server.js
git add backend/.env.example

git commit -m "feat: sistema de alertas externas (WhatsApp + Email) cada 5 min

alerts.service.js (nuevo):
  - Cron cada 5 min con node-cron
  - Checks: Supabase Auth, Supabase DB, RAM del proceso
  - Canales: WhatsApp via Callmebot (gratis) + Email via Resend
  - Anti-spam: solo alerta cuando el STATUS CAMBIA
    (ok→warning, ok→critical, warning→critical, etc.)
  - Si persiste el problema: recordatorio cada 30 min
  - Al recuperarse: alerta de 'sistema normalizado'
  - Si ninguna variable configurada: cron desactivado con warning en log
  - Verificacion al boot: 10s despues del arranque

server.js:
  - import + registerAlertsCron() en startup

.env.example:
  - Documentacion de ALERT_EMAIL, ALERT_WHATSAPP_PHONE, ALERT_WHATSAPP_APIKEY
  - Instrucciones para activar Callmebot

Variables a agregar en Railway (Settings → Variables):
  ALERT_EMAIL=tu@email.com
  ALERT_WHATSAPP_PHONE=57XXXXXXXXXX
  ALERT_WHATSAPP_APIKEY=XXXXXXXX (obten en Callmebot)"

git push origin main
echo ERRORLEVEL: %ERRORLEVEL%
if %ERRORLEVEL% EQU 0 (
  echo OK - Railway desplegara en ~2 min
  echo.
  echo PASO SIGUIENTE — Agregar variables en Railway:
  echo   1. Ve a railway.com → tu proyecto → Variables
  echo   2. Agrega:
  echo      ALERT_EMAIL = tu correo
  echo      ALERT_WHATSAPP_PHONE = 57XXXXXXXXXX
  echo      ALERT_WHATSAPP_APIKEY = (de Callmebot)
  echo.
  echo Para WhatsApp:
  echo   Envia WhatsApp a +34 644 59 77 71 con el texto:
  echo   "I allow callmebot to send me messages"
  echo   Recibes tu APIKEY en segundos.
) else (
  echo ERROR - revisar arriba
)
cmd /k
