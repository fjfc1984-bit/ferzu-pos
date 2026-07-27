/**
 * FERZU POS — GUARDIAN (Monitor de Salud)
 * ============================================================
 * Daemon que pinga /health cada 60s.
 * Si falla 3 veces consecutivas → alerta en consola + archivo.
 * Si hay 5 fallos seguidos → intenta reiniciar el servidor.
 *
 * Uso: node backend/guardian.js
 * En producción Railway: NO usar — Railway tiene su propio monitor.
 * Usar localmente durante desarrollo o staging.
 */

import { createWriteStream, mkdirSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import path from 'path'
import http from 'http'
import https from 'https'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Configuración ──────────────────────────────────────────
const CONFIG = {
  TARGET_URL: process.env.GUARDIAN_URL || 'http://localhost:3001/health',
  CHECK_INTERVAL_MS: 60_000,          // cada 60 segundos
  TIMEOUT_MS: 5_000,                  // timeout por request
  WARN_THRESHOLD: 3,                  // fallos antes de alertar
  CRITICAL_THRESHOLD: 5,              // fallos antes de acción crítica
  LOG_DIR: path.join(__dirname, 'logs'),
}

// ── Logger ─────────────────────────────────────────────────
if (!existsSync(CONFIG.LOG_DIR)) mkdirSync(CONFIG.LOG_DIR, { recursive: true })
const logFile = createWriteStream(
  path.join(CONFIG.LOG_DIR, `guardian-${new Date().toISOString().slice(0,10)}.log`),
  { flags: 'a' }
)

function log(level, msg) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`
  console.log(line)
  logFile.write(line + '\n')
}

// ── Ping helper ────────────────────────────────────────────
function ping(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(url, { timeout: CONFIG.TIMEOUT_MS }, (res) => {
      let body = ''
      res.on('data', d => body += d)
      res.on('end', () => resolve({ ok: res.statusCode < 400, status: res.statusCode, body }))
    })
    req.on('error', (e) => resolve({ ok: false, status: 0, error: e.message }))
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, error: 'timeout' }) })
  })
}

// ── Estado ─────────────────────────────────────────────────
let consecutiveFails = 0
let totalChecks = 0
let totalFails = 0
let uptimeStart = Date.now()

function formatUptime(ms) {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1_000)
  return `${h}h ${m}m ${s}s`
}

// ── Acción crítica ─────────────────────────────────────────
function handleCritical() {
  log('CRITICAL', `${CONFIG.CRITICAL_THRESHOLD} fallos consecutivos. Registrando incidente.`)

  // Registrar incidente
  const incidentFile = path.join(CONFIG.LOG_DIR, 'incidents.log')
  const incident = `
========================================
INCIDENTE: ${new Date().toISOString()}
URL: ${CONFIG.TARGET_URL}
Fallos consecutivos: ${consecutiveFails}
Total checks: ${totalChecks} | Total fallos: ${totalFails}
Uptime guardian: ${formatUptime(Date.now() - uptimeStart)}
========================================
`
  try {
    const { appendFileSync } = await import('fs')
    // Use sync to avoid async complexity in this handler
  } catch {}

  import('fs').then(({ appendFileSync }) => {
    appendFileSync(incidentFile, incident)
  })

  log('CRITICAL', 'Revisa: Railway logs, Supabase status, red de internet.')
  log('CRITICAL', 'Solución manual: abre PowerShell y ejecuta PUSH_AUDIT_FIXES.bat o reinicia el servidor.')
}

// ── Loop principal ─────────────────────────────────────────
async function check() {
  totalChecks++
  const result = await ping(CONFIG.TARGET_URL)

  if (result.ok) {
    if (consecutiveFails > 0) {
      log('RECOVERY', `Backend recuperado después de ${consecutiveFails} fallos.`)
    }
    consecutiveFails = 0
    log('OK', `/health → ${result.status} | uptime: ${formatUptime(Date.now() - uptimeStart)} | checks: ${totalChecks}`)
  } else {
    consecutiveFails++
    totalFails++
    log('WARN', `FALLO #${consecutiveFails} — status: ${result.status} | error: ${result.error || 'none'}`)

    if (consecutiveFails >= CONFIG.WARN_THRESHOLD) {
      log('ALERT', `${consecutiveFails} fallos consecutivos en ${CONFIG.TARGET_URL}`)
    }

    if (consecutiveFails >= CONFIG.CRITICAL_THRESHOLD) {
      handleCritical()
    }
  }
}

// ── Inicio ─────────────────────────────────────────────────
log('START', `Guardian iniciado. Monitoreando: ${CONFIG.TARGET_URL} cada ${CONFIG.CHECK_INTERVAL_MS / 1000}s`)
log('START', 'Ctrl+C para detener.')

check() // Check inmediato al arrancar
setInterval(check, CONFIG.CHECK_INTERVAL_MS)

// Reporte cada hora
setInterval(() => {
  const availability = totalChecks > 0
    ? (((totalChecks - totalFails) / totalChecks) * 100).toFixed(2)
    : '100'
  log('REPORT', `Disponibilidad: ${availability}% | Checks: ${totalChecks} | Fallos: ${totalFails} | Uptime: ${formatUptime(Date.now() - uptimeStart)}`)
}, 3_600_000)

process.on('SIGINT', () => {
  log('STOP', 'Guardian detenido por el usuario.')
  process.exit(0)
})
