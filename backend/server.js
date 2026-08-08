// =============================================================================
// FERZU POS — Entry Point (slim)
// Versión: 2.0.0 — Arquitectura modular
//
// REGLA DE ORO: TODO cálculo matemático vive en routes/orders.routes.js.
// La IA extrae, clasifica y propone. El backend valida, calcula y persiste.
// =============================================================================

import express           from 'express';
import cors              from 'cors';
import helmet            from 'helmet';
import dotenv            from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

// ── Sentry: inicializar ANTES de cualquier middleware ──────────────────────────
import { initSentry, sentryRequestHandler, sentryErrorHandler } from './lib/sentry.js';
const app = express();
initSentry(app);

// Railway (y cualquier proxy) pone el IP real en X-Forwarded-For.
// Sin esto, express-rate-limit lanza ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
// y bloquea TODOS los endpoints de IA con un error 500/timeout.
app.set('trust proxy', 1);

// ── Config / shared singletons ─────────────────────────────────────────────────
import logger              from './config/logger.js';
import { generalRateLimit } from './config/rateLimits.js';

// ── Routes ─────────────────────────────────────────────────────────────────────
import authRouter       from './routes/auth.routes.js';
import productsRouter   from './routes/products.routes.js';
import cashRouter       from './routes/cash.routes.js';
import ordersRouter     from './routes/orders.routes.js';
import inventoryRouter  from './routes/inventory.routes.js';
import aiRouter         from './routes/ai.routes.js';
import syncRouter       from './routes/sync.routes.js';
import reportsRouter    from './routes/reports.routes.js';
import paymentsRouter   from './routes/payments.routes.js';
import errorsRouter     from './routes/errors.routes.js';
import dianRouter       from './routes/dian.routes.js';
import orgRouter        from './routes/org.routes.js';
import onboardingRouter from './routes/onboarding.routes.js';
import settingsRouter   from './routes/settings.routes.js';
import analyticsRouter  from './routes/analytics.routes.js';
import tablesRouter     from './routes/tables.routes.js';
import shiftsRouter     from './routes/shifts.routes.js';
import loyaltyRouter       from './routes/loyalty.routes.js';
import adminRouter         from './routes/admin.routes.js';
import healthRouter        from './routes/health.routes.js';
import integrationsRouter, {
  handleRappiWebhook,
  handleUberEatsWebhook,
  handleDidiWebhook,
} from './routes/integrations.routes.js';
import { registerProcessHandlers } from './routes/errors.routes.js';

// ── CRON ───────────────────────────────────────────────────────────────────────
import { registerTrialCron }  from './services/trial.service.js';
import { registerAlertsCron } from './services/alerts.service.js';

// =============================================================================
// MIDDLEWARES GLOBALES
// =============================================================================

// Sentry request tracking — PRIMERO
app.use(sentryRequestHandler());

app.use(helmet());

const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origen no permitido → ${origin}`));
  },
  credentials: true,
}));

// Los webhooks necesitan body RAW → se montan ANTES de express.json()
// Middleware para capturar rawBody en webhooks de delivery
app.use('/webhooks/rappi',    express.json(), (req, res, next) => { req.rawBody = JSON.stringify(req.body); next(); }, (req, res) => handleRappiWebhook(req, res));
app.use('/webhooks/ubereats', express.json(), (req, res, next) => { req.rawBody = JSON.stringify(req.body); next(); }, (req, res) => handleUberEatsWebhook(req, res));
app.use('/webhooks/didi',     express.json(), (req, res, next) => { req.rawBody = JSON.stringify(req.body); next(); }, (req, res) => handleDidiWebhook(req, res));
app.use('/webhooks', paymentsRouter);

app.use(express.json({ limit: '2mb' }));
app.use(generalRateLimit);

// =============================================================================
// RUTAS
// =============================================================================

app.use('/api/auth',          authRouter);
app.use('/api/products',      productsRouter);
app.use('/api/cash-sessions', cashRouter);
app.use('/api/orders',        ordersRouter);
app.use('/api/inventory',     inventoryRouter);
app.use('/api/ai',            aiRouter);
app.use('/api/sync',          syncRouter);
app.use('/api/reports',       reportsRouter);
app.use('/api/payments',      paymentsRouter);
app.use('/api/errors',        errorsRouter);
app.use('/api/dian',          dianRouter);
app.use('/api/org',           orgRouter);
app.use('/api/onboarding',    onboardingRouter);
app.use('/api/settings',      settingsRouter);
app.use('/api/analytics',     analyticsRouter);
app.use('/api/tables',        tablesRouter);
app.use('/api/shifts',        shiftsRouter);
app.use('/api/integrations',  integrationsRouter);
app.use('/api/loyalty',       loyaltyRouter);
app.use('/api/admin',         adminRouter);
app.use('/api/health',        healthRouter);

// =============================================================================
// HEALTH CHECK
// =============================================================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0', ts: new Date().toISOString() });
});

// =============================================================================
// RUTAS INTERNAS — SOLO ENTORNO LOCAL
// =============================================================================

if (process.env.NODE_ENV !== 'production') {
  app.get('/deploy-schema', async (req, res) => {
    try {
      const { readFileSync } = await import('fs');
      const pathMod          = await import('path');
      const { fileURLToPath: ftu } = await import('url');
      const __dir  = pathMod.default.dirname(ftu(import.meta.url));
      const html   = readFileSync(pathMod.default.join(__dir, '..', 'DEPLOY_SCHEMA.html'), 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err) {
      res.status(500).send('Error: ' + err.message);
    }
  });

  app.get('/api/internal/migrate', (req, res) => {
    logger.warn('[MIGRATE] Endpoint de migración llamado en modo local');
    res.json({ disabled: true, reason: 'Ejecuta las migraciones desde Supabase Dashboard o CLI local.' });
  });
} else {
  app.get('/deploy-schema',        (req, res) => res.status(404).end());
  app.get('/api/internal/migrate', (req, res) => res.status(404).end());
}

// =============================================================================
// ERROR HANDLERS
// =============================================================================

// Sentry — ANTES del handler genérico
app.use(sentryErrorHandler());

// Handler global
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { err: err.message, stack: err.stack });
  res.status(500).json({ error: 'Error interno del servidor' });
});

// =============================================================================
// STARTUP
// =============================================================================

const PORT = process.env.PORT || 3001;
const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  registerProcessHandlers();
  registerTrialCron();
  registerAlertsCron();

  app.listen(PORT, () => {
    logger.info(`FERZU Backend v2.0.0 corriendo en puerto ${PORT} (modular)`);

    // ── Keep-alive anti-cold-start ────────────────────────────────────────────
    // Railway en plan Starter duerme el servicio tras ~30 min de inactividad.
    // Nos auto-pingueamos cada 14 min para mantenernos activos.
    if (process.env.NODE_ENV === 'production') {
      const publicUrl = process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : process.env.BACKEND_URL;

      if (publicUrl) {
        setInterval(async () => {
          try {
            await fetch(`${publicUrl}/health`);
            logger.debug('[keep-alive] ping OK');
          } catch (e) {
            logger.warn('[keep-alive] ping error', { err: e.message });
          }
        }, 14 * 60 * 1000); // 14 minutos
        logger.info(`[keep-alive] activo → ${publicUrl}/health cada 14 min`);
      } else {
        logger.warn('[keep-alive] RAILWAY_PUBLIC_DOMAIN no definido — cold starts posibles');
      }
    }
  });
}

export default app;
