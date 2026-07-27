@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul
echo === Subiendo sistema de emails trial (dia 10) a GitHub... ===
git add backend/server.js backend/package.json
git commit -m "feat: cron job email recordatorio dia 10 de trial via Resend"
git push origin main
echo.
echo === LISTO! Railway redesplega automaticamente en ~2 minutos ===
echo.
echo === SIGUIENTE PASO OBLIGATORIO: ===
echo === Agregar RESEND_API_KEY en Railway Dashboard ===
echo === 1. Ve a: https://railway.app ===
echo === 2. Tu proyecto FERZU backend ===
echo === 3. Variables > New Variable ===
echo === 4. RESEND_API_KEY = tu_key_de_resend.com ===
echo.
pause
