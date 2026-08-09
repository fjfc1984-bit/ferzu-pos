@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
git add backend/middleware/auth.js backend/routes/ai.routes.js src/pages/DashboardPage.jsx src/components/CopilotChat/CopilotChat.jsx
git commit -m "feat: Modulo Trial/Suscripcion — gate Co-Piloto por plan, requirePlanFeature middleware, 402 en frontend"
git push origin main
echo.
echo Desplegando en Railway (backend) y Vercel (frontend)...
echo Espera ~2 min y luego verifica en https://ferzu-pos.vercel.app
pause
