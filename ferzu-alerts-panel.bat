@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
git add backend/routes/alerts.routes.js backend/server.js src/pages/AlertsPage.jsx src/App.jsx src/components/ModuleGuard.jsx
git commit -m "feat: Panel de Alertas UI — historial system_alerts, filtros, resolver, badge nav"
git push origin main
echo.
echo Desplegando en Railway y Vercel... (~2 min)
echo Luego abre https://ferzu-pos.vercel.app/alertas
pause
