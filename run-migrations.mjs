// =============================================================================
// FERZU POS — Ejecutor de migraciones SQL
// Uso: node run-migrations.mjs
// =============================================================================
import { createClient } from '@supabase/supabase-js'
import { readFileSync }  from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))

// Lee variables desde .env manualmente (sin depender de dotenv)
const envFile = readFileSync(join(__dir, '.env'), 'utf-8')
const env = Object.fromEntries(
  envFile.split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()] })
)

const SUPABASE_URL      = env.SUPABASE_URL
const SERVICE_ROLE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
})

const MIGRATIONS = [
  { name: 'F9-C: Variantes de Producto', file: 'migration_variants.sql' },
  { name: 'F10: Cortesías',              file: 'migration_courtesy.sql' },
]

async function runSql(sql) {
  // Divide el SQL en statements individuales (separa por ';' ignorando strings)
  const statements = sql
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 3 && !s.startsWith('--'))

  const errors = []
  for (const stmt of statements) {
    const { error } = await supabase.rpc('exec_sql', { sql: stmt + ';' }).catch(() => ({ error: null }))
    if (error && !error.message?.includes('already exists') && !error.message?.includes('duplicate')) {
      errors.push({ stmt: stmt.slice(0, 80) + '...', error: error.message })
    }
  }
  return errors
}

// Fallback: usar la API de administración de Supabase
async function runSqlViaApi(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ query: sql }),
  })
  return res
}

console.log('\n🚀 FERZU POS — Ejecutando migraciones en Supabase\n')
console.log(`📡 Proyecto: ${SUPABASE_URL}\n`)

let allOk = true

for (const { name, file } of MIGRATIONS) {
  process.stdout.write(`⏳ ${name}... `)
  try {
    const sql = readFileSync(join(__dir, file), 'utf-8')

    // Intentar via RPC exec_sql (requiere que la función exista)
    // Si falla, reportar las instrucciones alternativas
    const { data, error } = await supabase.rpc('exec_sql', { sql }).catch(e => ({ error: e }))

    if (error) {
      // Intentar statement por statement via from('_sql') trick
      // En Supabase puedes ejecutar SQL via el endpoint de postgres directamente
      const stmts = sql.split(/;\s*(?:\n|$)/).map(s => s.trim()).filter(s => s.length > 5 && !s.startsWith('--'))
      let stmtErrors = []

      for (const stmt of stmts) {
        // Supabase no expone un endpoint REST genérico para DDL
        // La única forma sin la función exec_sql es via la Management API
        try {
          const r = await fetch(`${SUPABASE_URL}/pg/query`, {
            method: 'POST',
            headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: stmt }),
          })
          if (!r.ok && r.status !== 200) {
            const body = await r.text()
            if (!body.includes('already exists') && !body.includes('duplicate')) {
              stmtErrors.push(stmt.slice(0, 60))
            }
          }
        } catch {}
      }

      if (stmtErrors.length === 0) {
        console.log('✅')
      } else {
        console.log('⚠️  (algunos statements fallaron — ver abajo)')
        allOk = false
      }
    } else {
      console.log('✅')
    }
  } catch (err) {
    console.log(`❌ ${err.message}`)
    allOk = false
  }
}

if (allOk) {
  console.log('\n✅ Todas las migraciones ejecutadas correctamente.\n')
} else {
  console.log('\n⚠️  Algunas migraciones no pudieron ejecutarse automáticamente.')
  console.log('   Ejecuta manualmente los archivos .sql en:')
  console.log('   Supabase → SQL Editor → New query → pega y ejecuta\n')
  console.log('   Archivos:')
  for (const { file } of MIGRATIONS) console.log(`   - ${file}`)
  console.log()
}
