# FERZU POS — Plan de Recuperación ante Desastres

**Versión:** 1.0 | **Fecha:** 2026-07 | **Responsable:** Fernando

---

## Principios Fundamentales

1. **Nunca hacer cambios sin backup previo** — ejecutar `BACKUP.bat` antes de cualquier cambio importante
2. **Nunca calcular matemáticas en la IA** — toda aritmética financiera va en el backend determinista
3. **Siempre aprobar acciones críticas manualmente** — el sistema nunca procesa ventas ni elimina datos sin clic humano
4. **Offline-First es innegociable** — la venta básica debe funcionar sin internet

---

## Escenarios Extremos y Soluciones

### 1. Supabase completamente caído (auth + base de datos)

**Síntomas:** Login falla, datos no cargan, errores `fetch` en consola.

**Impacto:** Alto — usuarios no pueden autenticarse. El POS offline sigue funcionando para ventas, pero no sincroniza.

**Solución inmediata:**
1. Verificar estado en https://status.supabase.com
2. El POS offline (Dexie/IndexedDB) sigue operativo — **no perder ventas**
3. Cuando Supabase vuelva, el `SyncContext` sincroniza automáticamente

**Solución estructural:**
- Activar múltiples instancias Supabase (Pro plan tiene replicas)
- Considerar migración a PostgreSQL self-hosted en Railway como fallback

**Prevención:**
```
Plan Free Supabase: límite de 500MB, 2GB bandwidth/mes
Plan Pro: $25/mes, sin límite de bandwidth, backups diarios
```

---

### 2. Railway crash o reinicio del backend

**Síntomas:** `POST /api/orders` falla, AI chat no responde, webhooks Bold no procesados.

**Impacto:** Medio — ventas online fallan, pero el POS offline captura todo.

**Solución inmediata:**
1. Abrir https://railway.app → revisar logs
2. Si el servicio cayó: click "Redeploy" en Railway
3. El offline-first del frontend ya está guardando ventas en IndexedDB
4. Cuando el backend vuelva, las ventas offline se sincronizan

**Solución estructural:**
```bash
# Agregar en backend/server.js — ya existe /health
# Railway usa este endpoint para health checks automáticos
GET /health → { status: 'ok', timestamp, uptime }
```

**Prevención:**
- Limitar memoria: `process.on('uncaughtException', handler)` ya configurado
- Usar `guardian.js` en desarrollo para detectar caídas rápido

---

### 3. Vercel caído (frontend inaccessible)

**Síntomas:** `ferzu-pos.vercel.app` muestra 502 o no carga.

**Impacto:** Bajo-Medio — usuarios con la app ya abierta en el navegador siguen funcionando (PWA + Service Worker)

**Solución inmediata:**
1. Verificar estado en https://vercel-status.com
2. Los usuarios con la app abierta en el navegador **NO se ven afectados** (PWA cached)
3. Nuevos usuarios no pueden acceder hasta que Vercel se recupere

**Solución estructural (siguiente iteración):**
- Habilitar `vite-plugin-pwa` para Service Worker offline completo
- Configurar dominio propio + CDN secundario (Cloudflare Pages como mirror)

---

### 4. npm registry caído durante deploy

**Síntomas:** `npm ci` falla en CI/CD de GitHub Actions o Railway.

**Impacto:** Deploy bloqueado — el código actual en producción sigue funcionando.

**Solución inmediata:**
```bash
# Usar mirror de npm
npm ci --registry https://registry.npmmirror.com

# O usar caché local si tienes package-lock.json
npm ci --prefer-offline
```

**En GitHub Actions — ya configurado en `.github/workflows/ci.yml`:**
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: 'npm'    # caché automática de node_modules
```

---

### 5. Repositorio Git eliminado o corrupto

**Síntomas:** `git status` falla, `.git/` corrupto.

**Impacto:** Pérdida del historial de cambios.

**Solución inmediata:**
```powershell
# 1. Verificar si GitHub tiene el código
# Ir a https://github.com/tu-usuario/ferzu-pos

# 2. Si el repo local está corrupto pero GitHub está bien:
cd C:\Users\fjfc1\Downloads
git clone https://github.com/tu-usuario/ferzu-pos ferzu-pos-recovered
cd ferzu-pos-recovered
npm ci
cd backend && npm ci && cd ..

# 3. Copiar tu .env desde el backup:
copy C:\Backups\ferzu-pos\latest\.env .env
```

**Prevención:**
- `BACKUP.bat` guarda el código fuente sin necesitar git
- Los backups están en `C:\Backups\ferzu-pos\`
- GitHub es el segundo backup automático con cada push

---

### 6. `git push --force` accidental (historial borrado)

**Síntomas:** Commits desaparecen de GitHub, ramas perdidas.

**Solución inmediata:**
```bash
# git tiene reflog — el historial local persiste 90 días
git reflog          # lista todos los estados anteriores
git reset --hard HEAD@{3}   # vuelve 3 estados atrás

# Si ya hiciste push --force:
# Los tags de backup siguen existiendo
git tag             # lista todos los tags
git checkout backup-2026-07-27    # restaura al estado del tag
```

**Prevención:**
- Los `git tag` creados por `BACKUP.bat` son permanentes hasta que los borres
- Nunca usar `--force` sin tag previo

---

### 7. Supabase row limit o cuota excedida (plan Free)

**Síntomas:** Inserciones fallan con error `row limit exceeded` o 402.

**Impacto:** Nuevas ventas no se guardan en la nube.

**Solución inmediata:**
1. El POS offline sigue capturando ventas en IndexedDB
2. Verificar uso en Supabase Dashboard → Settings → Usage
3. Exportar datos históricos y archivar pedidos viejos
4. O hacer upgrade a Supabase Pro ($25/mes) — 8GB de base de datos

**Límites del plan Free:**
- 500MB base de datos
- 2GB bandwidth por mes
- 50,000 autenticaciones por mes

**SQL para archivar pedidos viejos:**
```sql
-- Mover pedidos de más de 6 meses a tabla de archivo
INSERT INTO orders_archive SELECT * FROM orders WHERE created_at < NOW() - INTERVAL '6 months';
DELETE FROM orders WHERE created_at < NOW() - INTERVAL '6 months';
```

---

### 8. `BOLD_SECRET_KEY` o `ANTHROPIC_API_KEY` comprometida

**Síntomas:** Transacciones fraudulentas, consumo de API desconocido.

**Acciones inmediatas (orden crítico):**
1. **Bold:** Ir a Bold Dashboard → Regenerar API keys → Actualizar en Railway
2. **Anthropic:** Ir a console.anthropic.com → API Keys → Revocar clave → Crear nueva
3. Revisar logs de Railway para transacciones sospechosas
4. Contactar a Bold/Anthropic para reportar el incidente

**Prevención:**
- Nunca commitear `.env` a git (ya en `.gitignore`)
- Rotar claves cada 6 meses aunque no haya incidente
- Usar Railway's secret management (variables de entorno, nunca en código)

---

### 9. `node_modules` corrompida o incompatible

**Síntomas:** `Cannot find module`, errores de versión, build falla.

**Solución — ejecutar `AUTO_HEAL.bat`:**
```batch
AUTO_HEAL.bat
```

**Solución manual:**
```powershell
# Frontend
cd C:\Users\fjfc1\Downloads\ferzu-pos
Remove-Item -Recurse -Force node_modules
npm ci        # usa package-lock.json exacto

# Backend
cd backend
Remove-Item -Recurse -Force node_modules
npm ci
```

---

### 10. Schema drift — base de datos y código desincronizados

**Síntomas:** Columnas que no existen, tipos de datos incorrectos, queries que fallaban ayer funcionan hoy y viceversa.

**Diagnóstico:**
```sql
-- En Supabase SQL Editor: ver columnas actuales
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'orders'
ORDER BY ordinal_position;
```

**Solución:**
1. Revisar `backend/db/schema.sql` — es la fuente de verdad
2. Si hay diferencias, crear una migración con `ALTER TABLE`
3. Nunca cambiar schema en producción sin hacer backup primero

**Prevención:**
- Todo cambio de schema va en `backend/db/migrations/YYYYMMDD_descripcion.sql`
- Aplicar migraciones SIEMPRE en staging antes de producción

---

### 11. JWT secret rotado en Supabase (sesiones inválidas)

**Síntomas:** Todos los usuarios son deslogueados, tokens inválidos en el backend.

**Impacto:** Alto — todos los usuarios pierden su sesión activa.

**Solución:**
1. El frontend detecta el 401 y redirige a `/login` automáticamente (ver `AuthContext.jsx`)
2. Los usuarios vuelven a loguearse — proceso normal
3. Si el problema persiste: verificar `SUPABASE_SERVICE_ROLE_KEY` en Railway

**Prevención:**
- No rotar el JWT secret sin necesidad urgente
- Si se rota, avisar a usuarios con anticipación

---

### 12. Rate limits (Supabase, Anthropic, Bold)

**Síntomas:** Error 429 en requests, mensajes de "rate limit exceeded".

**Límites conocidos:**
- Supabase Free: 500 requests/segundo
- Anthropic: 40,000 tokens/minuto (Haiku), 80,000 (Sonnet)
- Bold: consultar documentación (típico: 100 req/min)

**Solución:**
```javascript
// Ya implementado en api.js: retry con exponential backoff
// Si necesitas agregar:
async function withRetry(fn, retries = 3, delay = 1000) {
  try {
    return await fn()
  } catch (e) {
    if (e.response?.status === 429 && retries > 0) {
      await new Promise(r => setTimeout(r, delay))
      return withRetry(fn, retries - 1, delay * 2)
    }
    throw e
  }
}
```

---

### 13. Memory leak en Railway (servidor reiniciado por OOM)

**Síntomas:** Railway muestra "OOM killed", servidor se reinicia cada N horas.

**Diagnóstico:**
```javascript
// Agregar en backend/server.js para monitorear
setInterval(() => {
  const used = process.memoryUsage()
  logger.info(`Memoria: RSS=${Math.round(used.rss/1024/1024)}MB Heap=${Math.round(used.heapUsed/1024/1024)}MB`)
}, 60_000)
```

**Causas comunes:**
- Event listeners no removidos
- Variables globales que crecen indefinidamente
- Logs acumulándose en memoria

**Solución:**
- Railway plan Hobby: 512MB RAM — suficiente para FERZU POS
- Si el leak persiste: usar `clinic.js` o `heapdump` para diagnosticar
- Reinicio automático ya configurado en Railway

---

### 14. Dependencia circular → pantalla en blanco

**Síntomas:** Frontend carga, pantalla blanca, consola muestra `Cannot access 'X' before initialization`.

**Diagnóstico:**
```bash
# Detectar ciclos
npx madge --circular src/
```

**Solución:**
1. Mover el import problemático a un archivo tercer (util o helper)
2. Usar lazy import: `const { thing } = await import('./module')`
3. Verificar el orden de providers en `App.jsx` — SyncProvider ANTES de POSProvider

---

### 15. IndexedDB (Dexie) corrompida — ventas offline perdidas

**Síntomas:** Ventas guardadas "offline" no aparecen, Dexie throws al abrir.

**Impacto:** MUY ALTO — pérdida de ventas no sincronizadas.

**Diagnóstico:**
```javascript
// En la consola del navegador (F12):
const db = await new Dexie('FerzuPOS').open()
await db.syncQueue.toArray().then(console.log)
```

**Solución:**
1. Si la DB está corrompida: `indexedDB.deleteDatabase('FerzuPOS')` y reiniciar
2. Las ventas NO sincronizadas se pierden si la DB se borra
3. **Prevención crítica**: mostrar contador de ventas pendientes en la UI

**Mejora pendiente:**
- Exportar ventas pendientes a CSV antes de borrar la DB
- Alert visible cuando hay ventas en cola sin sincronizar

---

### 16. `branchId` perdido del localStorage

**Síntomas:** El POS no muestra productos, error "branch no seleccionado".

**Solución:**
```javascript
// En consola del navegador:
localStorage.setItem('branchId', 'TU-BRANCH-ID-AQUI')
location.reload()
```

**Prevención:**
- `branchId` debe persistir en localStorage Y en Supabase user profile
- Si localStorage se borra (modo privado, limpieza del browser), el sistema debe pedir la sucursal al login

---

### 17. `package-lock.json` conflictos en CI

**Síntomas:** GitHub Actions falla con "package-lock.json is inconsistent".

**Solución:**
```bash
# En PowerShell local:
npm install      # regenera package-lock.json
git add package-lock.json
git commit -m "fix: regenerate package-lock.json"
git push
```

**Prevención:**
- Siempre usar `npm install` (no `npm ci`) cuando agregas nuevas dependencias
- `npm ci` solo en CI/CD — usa el lock file exacto sin modificarlo

---

### 18. CORS mal configurado tras nuevo dominio

**Síntomas:** `Access-Control-Allow-Origin` falta, preflight OPTIONS falla.

**Solución — en `backend/server.js`:**
```javascript
// Ya configurado. Si agregas un nuevo dominio:
const allowedOrigins = [
  'https://ferzu-pos.vercel.app',
  'https://tu-nuevo-dominio.com',   // agregar aquí
  process.env.FRONTEND_URL,
]
```

**Actualizar en Railway → Variables de entorno:**
```
FRONTEND_URL=https://tu-nuevo-dominio.com
```

---

## Runbook de Emergencia — 5 minutos

Si algo explota y no sabes qué hacer:

```
1. BACKUP.bat                    ← guardar estado actual
2. AUTO_HEAL.bat                 ← auto-reparar lo obvio
3. HEALTH_CHECK.bat              ← diagnosticar qué falla
4. Revisar logs de Railway        ← https://railway.app
5. Revisar estado de Supabase    ← https://status.supabase.com
6. Si es código: git log --oneline -10   ← qué cambió recientemente
7. Si es crítico: git revert HEAD        ← revertir último commit
8. PUSH (commit revert)          ← deploy del revert a producción
```

---

## Checklist Pre-Deploy

Antes de cada push a `main`:

- [ ] `BACKUP.bat` ejecutado
- [ ] `HEALTH_CHECK.bat` sin errores críticos
- [ ] `npm run build` en frontend sin errores
- [ ] `node --test tests/*.test.js` en backend: 13/13 pasan
- [ ] Variables de entorno en Railway actualizadas si se agregaron nuevas
- [ ] `.env.example` actualizado si se agregó una nueva variable

---

## Contactos de Emergencia

| Servicio | Status | Soporte |
|----------|--------|---------|
| Supabase | https://status.supabase.com | support@supabase.io |
| Railway | https://railway.instatus.com | https://discord.gg/railway |
| Vercel | https://vercel-status.com | https://vercel.com/support |
| Bold | https://getbold.io | soporte@getbold.io |
| Anthropic | https://status.anthropic.com | console.anthropic.com |

---

## Reglas de Oro (Nunca Violar)

1. **NUNCA** hacer `git push --force` sin tag de backup previo
2. **NUNCA** modificar datos de producción directamente en Supabase sin backup
3. **NUNCA** exponer `.env` o secretos en el código
4. **NUNCA** dejar ventas offline sin un indicador visual claro para el cajero
5. **SIEMPRE** verificar los tests antes de cada deploy
6. **SIEMPRE** tener un backup de las últimas 24 horas antes de migraciones de schema
