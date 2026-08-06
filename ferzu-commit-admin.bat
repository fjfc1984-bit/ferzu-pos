@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

if exist ".git\index.lock" del /f /q ".git\index.lock"
if exist ".git\HEAD.lock"  del /f /q ".git\HEAD.lock"

git add -A

git commit -m "feat: panel de administracion para super-admin

Backend:
- admin.routes.js: GET /api/admin/users protegido por email de admin
  Retorna todos los orgs con metricas: ordenes, productos, cajas, eventos
- server.js: registra adminRouter en /api/admin

Frontend:
- AdminPage.jsx: tabla completa con negocio, plan, registro, ultimo login,
  ordenes, productos, cajas abiertas, nivel de actividad
  Metricas globales: negocios externos, activos, ordenes totales, productos
  Guard: solo visible para fjfc1984@gmail.com
- App.jsx: ruta /admin agregada
- ModuleGuard.jsx: link 'Panel Admin' en sidebar, solo para Fernando
  Icono Users importado de lucide-react"

git push origin main

echo.
echo === Ultimos commits ===
git log --oneline -3
echo.
pause
