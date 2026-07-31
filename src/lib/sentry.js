/**
 * FERZU POS — Sentry Frontend
 * Monitoreo de errores + contexto de organización/usuario
 *
 * Setup:
 *   1. npm install @sentry/react
 *   2. Crear proyecto en sentry.io → copiar DSN en .env.local:
 *      VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
 *   3. Ya está integrado en main.jsx
 */

import React from 'react'
import * as Sentry from '@sentry/react'

const DSN = import.meta.env.VITE_SENTRY_DSN

export function initSentry() {
  if (!DSN) {
    console.info('[Sentry] VITE_SENTRY_DSN no configurado — monitoreo desactivado')
    return
  }

  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,           // 'development' | 'production'
    release:     import.meta.env.VITE_APP_VERSION || '1.0.0',

    // Integrations
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText:  true,
        blockAllMedia: true,
      }),
    ],

    // Performance
    tracesSampleRate:   import.meta.env.PROD ? 0.2 : 1.0,
    replaysSessionSampleRate:  0.05,
    replaysOnErrorSampleRate:  1.0,

    // No capturar ciertos errores comunes de red
    ignoreErrors: [
      'Network Error',
      'Request aborted',
      /^ResizeObserver loop limit/,
      /Loading chunk \d+ failed/,
    ],

    beforeSend(event) {
      // No enviar en dev si no hay DSN real
      if (import.meta.env.DEV && !DSN.includes('sentry.io')) return null
      return event
    },
  })
}

/**
 * Establece el contexto del usuario autenticado.
 * Llamar desde AuthContext cuando el usuario hace login.
 */
export function setSentryUser({ id, email, organizationId, branchId, role }) {
  if (!DSN) return
  Sentry.setUser({ id, email })
  Sentry.setTag('org_id',    organizationId || 'unknown')
  Sentry.setTag('branch_id', branchId       || 'unknown')
  Sentry.setTag('role',      role            || 'unknown')
}

export function clearSentryUser() {
  if (!DSN) return
  Sentry.setUser(null)
}

/**
 * Captura un error con contexto extra.
 * Usar en catch blocks críticos.
 */
export function captureError(err, context = {}) {
  if (!DSN) {
    console.error('[Sentry disabled]', err, context)
    return
  }
  Sentry.withScope(scope => {
    Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v))
    Sentry.captureException(err)
  })
}

/**
 * HOC para envolver componentes React con ErrorBoundary de Sentry.
 * Uso: export default withSentryBoundary(MyComponent)
 */
export function withSentryBoundary(Component, fallback = null) {
  return Sentry.withErrorBoundary(Component, {
    fallback: fallback || (({ error, resetError }) =>
      React.createElement('div', { className: 'flex flex-col items-center justify-center p-8 text-center' },
        React.createElement('p', { className: 'text-red-600 font-semibold mb-2' }, 'Algo salió mal'),
        React.createElement('p', { className: 'text-sm text-gray-500 mb-4' }, error?.message),
        React.createElement('button', {
          onClick: resetError,
          className: 'px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700'
        }, 'Reintentar')
      )
    ),
  })
}
