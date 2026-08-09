@echo off
echo ========================================
echo  FERZU POS - Health Endpoint Full
echo  GET /api/health/full
echo ========================================
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

echo [0/4] Limpiando locks...
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock

echo [1/4] Agregando archivos...
git add backend/routes/health.routes.js
git add backend/server.js

echo [2/4] Commit...
git commit -m "feat: GET /api/health/full — monitoreo completo del ecosistema

Nuevo endpoint de salud detallado con 4 checks en paralelo:
  - supabase.auth: listUsers(perPage=1) + latency_ms + thresholds
  - supabase.database: count(organizations) + query_latency_ms
  - railway_backend: process.uptime/memoryUsage + os.loadavg (sincrono)
  - sync_chain_health: offline orders pendientes + error rate 5min

Caracteristicas:
  - Promise.allSettled: nunca falla aunque un check individual explote
  - Status global: ok / warning / critical (el peor de todos los componentes)
  - overall_messages: mensajes accionables solo cuando hay problema
  - check_duration_ms: tiempo total del chequeo
  - Proteccion opcional: x-health-token header (Railway env HEALTH_CHECK_TOKEN)
  - Logger solo en estado degradado (no spam en logs normales)
  - Umbrales configurados: auth>500ms=warn, db>200ms=warn, mem>350MB=warn

Registro en server.js:
  - import healthRouter from './routes/health.routes.js'
  - app.use('/api/health', healthRouter)"

echo [3/4] Push a GitHub...
git push origin main

IF %ERRORLEVEL% NEQ 0 (
    echo ERROR: Revisa el error arriba.
    pause
    exit /b 1
)

echo.
echo ========================================
echo OK - Railway desplegara en ~2 min.
echo.
echo Endpoint disponible en:
echo   GET https://ferzu-backend-production.up.railway.app/api/health/full
echo.
echo Para proteger el endpoint (opcional):
echo   Agrega HEALTH_CHECK_TOKEN en Railway Variables
echo   Luego llama con: x-health-token: tu-token
echo.
echo Respuesta esperada:
echo   { "status": "ok", "components": { "supabase": {...}, ... } }
echo ========================================
pause
