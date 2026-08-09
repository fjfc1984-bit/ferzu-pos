@echo off
title FERZU - Co-Piloto Panel Dashboard
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock

git add src/components/CopilotChat/CopilotChat.jsx
git add src/pages/DashboardPage.jsx

git commit -m "feat: Co-Piloto como panel lateral en Dashboard (xl+)

CopilotChat.jsx (nuevo — src/components/CopilotChat/):
  - Componente embebible, sin boton flotante
  - Siempre en modo Co-Piloto (usa /ai/copilot/chat)
  - Check proactivo al montar: get_system_health + get_inventory_alerts
  - Colapsable con ChevronDown, boton de reinicio
  - Sugerencias contextuales cuando no hay mensajes del usuario
  - className prop para flexibilidad de layout

DashboardPage.jsx:
  - Layout cambia a flex row en xl+: dashboard (flex-1) + panel (w-80)
  - Panel Co-Piloto visible solo en pantallas >= 1280px (xl)
  - En movil/tablet: solo el dashboard (sin panel)
  - El AIAssistant flotante sigue activo en todas las pantallas"

git push origin main
echo ERRORLEVEL: %ERRORLEVEL%
if %ERRORLEVEL% EQU 0 (
  echo OK - Vercel desplegara en ~1 min
  echo.
  echo Prueba el panel Co-Piloto:
  echo   1. Abre ferzu-pos.vercel.app en pantalla ancha (mayor a 1280px)
  echo   2. Ve a Dashboard
  echo   3. El panel Co-Piloto aparece en la derecha automaticamente
  echo   4. Al cargar hace check proactivo de sistema + inventario
  echo.
  echo Nota: en movil/tablet el panel esta oculto (responsive)
  echo       El boton flotante sigue disponible en todas las pantallas
) else (
  echo ERROR - revisar arriba
)
cmd /k
