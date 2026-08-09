@echo off
title FERZU - Co-Piloto IA
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock

git add backend/lib/claudeTools.js
git add backend/routes/ai.routes.js
git add src/components/AIAssistant.jsx
git add src/components/SyncStatusBadge.jsx

git commit -m "feat: Co-Piloto IA — agente proactivo con system health + inventory alerts

BACKEND:
  claudeTools.js:
    - Tool 7: get_system_health — check DB/auth/backend/sync en proceso (sin HTTP)
    - Tool 8: get_inventory_alerts — stock critico/agotado priorizado
    - runFerzuAgent: inyecta _system_suffix y page_context en system prompt
  ai.routes.js:
    - POST /api/ai/copilot/chat — nuevo endpoint Co-Piloto
    - COPILOT_SYSTEM_SUFFIX — instrucciones proactivas (check al abrir, formato corto)
    - Registra en ai_chat_history con endpoint='copilot'

FRONTEND:
  AIAssistant.jsx:
    - Rebrand: Asistente FERZU -> Co-Piloto FERZU
    - Tab: Agente avanzado -> Co-Piloto
    - Modo Co-Piloto: usa /ai/copilot/chat (proactivo con tools al abrir)
    - Modo quick: saludo proactivo via business-chat
    - Header dinamico: muestra modo activo
  SyncStatusBadge.jsx:
    - Movido a bottom-left (evita conflicto con boton Co-Piloto bottom-right)"

git push origin main
echo ERRORLEVEL: %ERRORLEVEL%
if %ERRORLEVEL% EQU 0 (
  echo OK - Railway y Vercel desplegaran en ~2 min
  echo.
  echo Prueba el Co-Piloto:
  echo   1. Abre ferzu-pos.vercel.app y entra al POS
  echo   2. Haz clic en el boton flotante verde (bottom-right)
  echo   3. Cambia a la pestana "Co-Piloto"
  echo   4. El agente hara check proactivo de sistema + inventario automaticamente
) else (
  echo ERROR - revisar arriba
)
cmd /k
