@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
del /f /q ".git\index.lock" 2>nul
echo === Subiendo integracion Bold a GitHub... ===
git add backend/server.js src/lib/boldCheckout.js
git commit -m "feat: Bold payments — POST /api/payments/create-bold-session + POST /webhooks/bold con HMAC-SHA256 + helper frontend boldCheckout.js"
git push origin main
echo.
echo === LISTO! Railway redespliega en ~2 minutos ===
echo.
echo PENDIENTE — agregar en Railway:
echo   BOLD_SECRET_KEY=tu_clave_secreta_bold
echo.
echo PENDIENTE — agregar en Vercel:
echo   VITE_BOLD_API_KEY=tu_api_key_bold
echo   VITE_BOLD_REDIRECT_URL=https://ferzu-pos.vercel.app/pricing?payment=success
pause
