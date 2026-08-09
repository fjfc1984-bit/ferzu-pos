@echo off
echo ========================================
echo  FERZU POS - Fix: Service Worker skipWaiting
echo ========================================
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock

git add vite.config.js
git commit -m "fix: add skipWaiting+clientsClaim to Workbox to prevent stale SW cache"
git push origin main

IF %ERRORLEVEL% NEQ 0 (
    echo ERROR: Revisa el error arriba.
    pause
    exit /b 1
)

echo.
echo OK - Vercel reconstruye en ~2 min.
echo Despues del deploy haz Ctrl+Shift+R en el navegador para limpiar el SW viejo.
pause
