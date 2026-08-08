// =============================================================================
// FERZU POS — Health Routes  (/api/health)
// Monitoreo completo del ecosistema: Supabase, Railway, Sync chain
// =============================================================================
//   GET /api/health/full  → chequeo completo (todos los componentes en paralelo)
//
// Protección: si HEALTH_CHECK_TOKEN está definido en Railway,
// el request DEBE incluir el header x-health-token con ese valor.
// Si la variable no está definida, el endpoint es público (para bootstrap).
// =============================================================================

import { Router } from 'express';
import os         from 'os';
import { supabaseAdmin } from '../config/supabase.js';
import logger            from '../config/logger.js';

const router = Router();

// =============================================================================
// UMBRALES — ajusta según comportamiento real de tu Supabase
// =============================================================================
const T = {
  auth_warn_ms:       500,   // >500ms en auth → warning
  auth_crit_ms:      2000,   // >2s en auth   → critical
  db_warn_ms:         200,   // >200ms en DB   → warning
  db_crit_ms:        1000,   // >1s en DB      → critical
  mem_warn_mb:        350,   // >350MB RAM      → warning
  mem_crit_mb:        600,   // >600MB RAM      → critical
  pending_warn:        20,   // >20 offline pendientes → warning
  pending_crit:       100,   // >100 offline pendientes → critical
  sync_err_warn_pct:    5,   // >5% error rate 5min → warning
  sync_err_crit_pct:   25,   // >25% error rate 5min → critical
};

// =============================================================================
// CHECKS INDIVIDUALES
// Cada función retorna un objeto con { status, ...métricas, error_message }
// Sin excepciones no capturadas — siempre retornan un objeto válido.
// =============================================================================

/**
 * Supabase Auth — valida que el servicio de autenticación responde.
 * Usa listUsers con perPage=1: consulta mínima con credencial de servicio.
 */
async function checkSupabaseAuth() {
  const t0 = Date.now();
  try {
    const { error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    const latency_ms = Date.now() - t0;
    if (error) throw new Error(error.message);

    const status = latency_ms >= T.auth_crit_ms ? 'error'
                 : latency_ms >= T.auth_warn_ms  ? 'warning'
                 : 'ok';

    return { status, latency_ms, error_message: null };
  } catch (err) {
    return { status: 'error', latency_ms: Date.now() - t0, error_message: err.message };
  }
}

/**
 * Supabase Database — ejecuta una query de prueba mínima y mide latencia.
 * Intenta también obtener conexiones activas vía pg_stat_activity (opcional).
 */
async function checkSupabaseDatabase() {
  const t0 = Date.now();
  try {
    // Query mínima: contar orgs (usa index, costo casi cero)
    const { error } = await supabaseAdmin
      .from('organizations')
      .select('id', { count: 'exact', head: true });

    const query_latency_ms = Date.now() - t0;
    if (error) throw new Error(error.message);

    // Intentar leer conexiones activas (requiere función SQL personalizada, falla silenciosamente)
    let active_connections = null;
    try {
      const { data } = await supabaseAdmin.rpc('get_active_connections');
      active_connections = data ?? null;
    } catch { /* RPC puede no existir — no bloquea el check */ }

    const status = query_latency_ms >= T.db_crit_ms ? 'error'
                 : query_latency_ms >= T.db_warn_ms  ? 'warning'
                 : 'ok';

    return { status, query_latency_ms, active_connections, error_message: null };
  } catch (err) {
    return {
      status:            'error',
      query_latency_ms:  Date.now() - t0,
      active_connections: null,
      error_message:     err.message,
    };
  }
}

/**
 * Railway Backend — métricas del proceso Node.js actual.
 * Sin llamadas externas: solo process.* y os.*  → nunca falla.
 */
function checkRailwayBackend() {
  try {
    const mem     = process.memoryUsage();
    const memMb   = Math.round(mem.rss / 1024 / 1024);
    const uptime  = Math.round(process.uptime());
    // load average (1 min) normalizado por nº de CPUs → % aproximado de CPU
    const load    = os.loadavg()[0];
    const cpuPct  = Math.min(Math.round((load / os.cpus().length) * 100), 100);

    const status = memMb >= T.mem_crit_mb ? 'error'
                 : memMb >= T.mem_warn_mb  ? 'warning'
                 : 'ok';

    return {
      status,
      process_uptime_seconds: uptime,
      memory_usage_mb:        memMb,
      cpu_usage_percentage:   cpuPct,
      error_message:          null,
    };
  } catch (err) {
    return {
      status:                 'error',
      process_uptime_seconds: null,
      memory_usage_mb:        null,
      cpu_usage_percentage:   null,
      error_message:          err.message,
    };
  }
}

/**
 * Sync Chain Health — mide la salud de la cadena offline→online.
 * Fuentes:
 *   - orders con source='offline' y status != 'paid' → pendientes de confirmar
 *   - usage_events de los últimos 5 min → tasa de error general
 *   - Última orden offline → proxy del último intento de sync
 */
async function checkSyncChain() {
  let pending   = 0;
  let errorRate = 0;
  let lastSyncAttempt = null;
  const warnings = [];

  // ── 1. Órdenes offline pendientes ──────────────────────────────────────────
  // Si la columna `source` no existe en `orders`, fallamos silenciosamente
  // con pending=0 (no queremos que un schema incompleto marque todo como crítico)
  try {
    const { count: pendingCount, error: pendErr } = await supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('source', 'offline')
      .neq('status', 'paid');

    if (pendErr) {
      // Schema incompleto o columna inexistente → degradar a warning, no error
      warnings.push(`orders.source: ${pendErr.message}`);
    } else {
      pending = pendingCount ?? 0;

      // Último intento de sync
      const { data: lastOffline } = await supabaseAdmin
        .from('orders')
        .select('created_at')
        .eq('source', 'offline')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      lastSyncAttempt = lastOffline?.created_at ?? null;
    }
  } catch (err) {
    warnings.push(`orders query: ${err.message || 'unknown error'}`);
  }

  // ── 2. Error rate de los últimos 5 min (usage_events) ─────────────────────
  // Si la tabla no existe, ignoramos la métrica (no es crítica)
  try {
    const since5min = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentEvents, error: evErr } = await supabaseAdmin
      .from('usage_events')
      .select('event_type')
      .gte('created_at', since5min);

    if (evErr) {
      warnings.push(`usage_events: ${evErr.message}`);
    } else {
      const totalEvents = recentEvents?.length ?? 0;
      const errorEvents = (recentEvents ?? []).filter(e =>
        e.event_type?.includes('error') || e.event_type?.includes('fail')
      ).length;
      errorRate = totalEvents > 0 ? Math.round((errorEvents / totalEvents) * 100) : 0;
    }
  } catch (err) {
    warnings.push(`usage_events query: ${err.message || 'unknown error'}`);
  }

  // ── 3. Determinar status ───────────────────────────────────────────────────
  const hasSchemaIssues = warnings.length > 0;
  const status = errorRate >= T.sync_err_crit_pct || pending >= T.pending_crit ? 'critical'
               : errorRate >= T.sync_err_warn_pct  || pending >= T.pending_warn  ? 'warning'
               : hasSchemaIssues                                                 ? 'warning'
               : 'ok';

  return {
    status,
    last_sync_attempt:          lastSyncAttempt,
    pending_sync_items:         pending,
    error_rate_5min_percentage: errorRate,
    error_message:              warnings.length > 0 ? warnings.join('; ') : null,
  };
}

// =============================================================================
// GET /api/health/full
// Ejecuta los 4 checks en paralelo (Promise.allSettled → nunca lanza).
// Responde siempre con 200 — el campo `status` indica la severidad.
// =============================================================================
router.get('/full', async (req, res) => {
  // Protección opcional — fail-closed igual que analytics
  const healthToken = process.env.HEALTH_CHECK_TOKEN;
  if (healthToken && req.headers['x-health-token'] !== healthToken) {
    return res.status(403).json({ error: 'x-health-token requerido' });
  }

  const t0 = Date.now();

  // Correr todos los checks en paralelo — Promise.allSettled nunca rechaza
  const [authRes, dbRes, syncRes] = await Promise.allSettled([
    checkSupabaseAuth(),
    checkSupabaseDatabase(),
    checkSyncChain(),
  ]);

  const auth     = authRes.status  === 'fulfilled' ? authRes.value  : { status: 'error', latency_ms: null, error_message: String(authRes.reason) };
  const database = dbRes.status    === 'fulfilled' ? dbRes.value    : { status: 'error', query_latency_ms: null, active_connections: null, error_message: String(dbRes.reason) };
  const sync     = syncRes.status  === 'fulfilled' ? syncRes.value  : { status: 'error', last_sync_attempt: null, pending_sync_items: null, error_rate_5min_percentage: null, error_message: String(syncRes.reason) };
  const railway  = checkRailwayBackend(); // síncrono, nunca falla

  // Status general: el peor de todos los componentes
  const allStatuses  = [auth.status, database.status, railway.status, sync.status];
  const overallStatus = allStatuses.includes('critical') ? 'critical'
                      : allStatuses.includes('error')    ? 'critical'
                      : allStatuses.includes('warning')  ? 'warning'
                      : 'ok';

  // Mensajes accionables para los componentes en mal estado
  const messages = [];
  if (auth.status     !== 'ok') messages.push(`[SUPABASE AUTH]    ${auth.error_message     || `Latencia ${auth.latency_ms}ms — revisar Supabase Dashboard`}`);
  if (database.status !== 'ok') messages.push(`[SUPABASE DB]      ${database.error_message  || `Latencia ${database.query_latency_ms}ms — verificar conexiones`}`);
  if (railway.status  !== 'ok') messages.push(`[RAILWAY BACKEND]  ${railway.error_message   || `Memoria ${railway.memory_usage_mb}MB — revisar Railway Metrics`}`);
  if (sync.status     !== 'ok') {
    const syncDetail = sync.pending_sync_items != null
      ? `${sync.pending_sync_items} órdenes offline pendientes | Error rate: ${sync.error_rate_5min_percentage ?? 0}%`
      : null;
    messages.push(`[SYNC CHAIN]       ${sync.error_message || syncDetail || 'Degradado — revisar schema'}`);
  }

  const payload = {
    status:    overallStatus,
    timestamp: new Date().toISOString(),
    check_duration_ms: Date.now() - t0,
    components: {
      supabase: { auth, database },
      railway_backend:   railway,
      sync_chain_health: sync,
    },
    overall_messages: messages,
  };

  // Loguear solo si hay problema (no spam en logs cuando todo está ok)
  if (overallStatus !== 'ok') {
    logger.warn('[health/full] Sistema degradado', { status: overallStatus, messages });
  }

  res.json(payload);
});

export default router;
