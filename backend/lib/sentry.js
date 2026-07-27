/**
 * FERZU POS — Sentry Backend (Node.js)
 * Monitoreo de errores del servidor Railway
 *
 * Setup:
 *   npm install @sentry/node
 *   Variable Railway: SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
 *   Llamar initSentry() al inicio de server.js (ANTES de cualquier middleware)
 */

import * as Sentry from '@sentry/node'

const DSN = process.env.SENTRY_DSN

export function initSentry(app) {
  if (!DSN) {
    console.info('[Sentry] SENTRY_DSN no configurado — monitoreo desactivado')
    return
  }

  Sentry.init({
    dsn: DSN,
    environment:      process.env.NODE_ENV || 'development',
    release:          process.env.npm_package_version || '1.0.0',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

    integrations: [
      Sentry.expressIntegration({ app }),
    ],

    // No loguear queries con datos sensibles
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'console' && breadcrumb.level === 'debug') return null
      return breadcrumb
    },
  })
}

/**
 * Middleware de request tracking — montar ANTES de las rutas
 */
export const sentryRequestHandler = () => {
  if (!DSN) return (req, res, next) => next()
  return Sentry.expressRequestHandler()
}

/**
 * Middleware de error tracking — montar DESPUÉS de todas las rutas
 * (antes del error handler genérico)
 */
export const sentryErrorHandler = () => {
  if (!DSN) return (err, req, res, next) => next(err)
  return Sentry.expressErrorHandler()
}

/**
 * Captura manual de un error con contexto.
 */
export function captureBackendError(err, context = {}) {
  if (!DSN) {
    console.error('[Sentry disabled]', err.message, context)
    return
  }
  Sentry.withScope(scope => {
    Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v))
    Sentry.captureException(err)
  })
}
