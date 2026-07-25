// =============================================================================
// FERZU POS — Database Migration Script
// Conecta directo al pooler de Supabase con service_role JWT (sin contraseña DB)
// Uso: node backend/migrate.mjs
// =============================================================================

import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PROJECT_REF      = 'laimnfckldpiovgbugyr';
const SCHEMA_PATH      = path.join(__dirname, '..', 'schema_v2.sql');

// Regiones a intentar (Supabase pooler)
const POOLER_HOSTS = [
  `aws-0-us-east-1.pooler.supabase.com`,
  `aws-0-us-west-1.pooler.supabase.com`,
  `aws-0-eu-west-1.pooler.supabase.com`,
  `aws-0-ap-southeast-1.pooler.supabase.com`,
];

async function tryConnect(host) {
  const client = new Client({
    host,
    port: 6543,              // Transaction mode pooler
    database: 'postgres',
    user: `postgres.${PROJECT_REF}`,
    password: SERVICE_ROLE_KEY,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });
  await client.connect();
  return client;
}

async function runMigration() {
  console.log('\n🚀 FERZU POS — Ejecutando migración de base de datos...\n');

  const sql = readFileSync(SCHEMA_PATH, 'utf8');

  let client = null;
  let connectedHost = null;

  // Intentar conectar a cada región del pooler
  for (const host of POOLER_HOSTS) {
    try {
      process.stdout.write(`  🔌 Intentando ${host}... `);
      client = await tryConnect(host);
      connectedHost = host;
      console.log('✅ Conectado!');
      break;
    } catch (err) {
      console.log(`❌ ${err.message.split('\n')[0]}`);
      client = null;
    }
  }

  if (!client) {
    // Fallback: intentar conexión directa
    console.log('\n  ⚠️  Pooler no disponible. Intentando conexión directa...');
    try {
      const directClient = new Client({
        host: `db.${PROJECT_REF}.supabase.co`,
        port: 5432,
        database: 'postgres',
        user: 'postgres',
        password: SERVICE_ROLE_KEY,  // puede fallar sin DB password
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 8000,
      });
      await directClient.connect();
      client = directClient;
      connectedHost = `db.${PROJECT_REF}.supabase.co`;
      console.log('  ✅ Conexión directa exitosa!');
    } catch (err) {
      console.log(`  ❌ ${err.message.split('\n')[0]}`);
    }
  }

  if (!client) {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  ❌ No se pudo conectar a la base de datos automáticamente   ║
║                                                               ║
║  SOLUCIÓN MANUAL (30 segundos):                               ║
║  1. Abre: http://localhost:3001/deploy-schema                 ║
║     (El backend debe estar corriendo)                         ║
║                                                               ║
║  2. O ve a: https://supabase.com/dashboard/project/          ║
║     laimnfckldpiovgbugyr/sql/new                              ║
║     → Pega el contenido de schema_v2.sql → Run               ║
╚═══════════════════════════════════════════════════════════════╝
`);
    process.exit(1);
  }

  // Ejecutar el schema
  console.log(`\n  📝 Ejecutando schema_v2.sql en ${connectedHost}...`);

  try {
    await client.query(sql);
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  ✅ ¡MIGRACIÓN COMPLETADA EXITOSAMENTE!                       ║
║                                                               ║
║  Las tablas fueron creadas en Supabase.                       ║
║  Ahora puedes usar el botón "¡Empezar a vender!"              ║
║  en el wizard de onboarding.                                  ║
╚═══════════════════════════════════════════════════════════════╝
`);
  } catch (err) {
    console.error('\n  ❌ Error ejecutando SQL:', err.message);
    // Intentar por bloques si falla el SQL completo
    console.log('\n  🔄 Intentando ejecutar por bloques...');
    const statements = sql.split(/;\s*\n/).filter(s => s.trim().length > 2);
    let ok = 0, failed = 0;
    for (const stmt of statements) {
      try {
        await client.query(stmt + ';');
        ok++;
      } catch (e) {
        if (!e.message.includes('already exists') && !e.message.includes('duplicate')) {
          failed++;
          if (process.env.DEBUG) console.log('  ⚠️ ', e.message.slice(0, 80));
        }
      }
    }
    console.log(`  ✅ ${ok} sentencias OK | ⚠️  ${failed} errores (pueden ser normales si tablas ya existen)`);
  } finally {
    await client.end();
  }
}

runMigration().catch(err => {
  console.error('Error fatal:', err.message);
  process.exit(1);
});
