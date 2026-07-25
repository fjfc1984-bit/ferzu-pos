import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://laimnfckldpiovgbugyr.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhaW1uZmNrbGRwaW92Z2J1Z3lyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDQxMTgxMiwiZXhwIjoyMDk5OTg3ODEyfQ._y4zc4pZiQG61SbTSPzspLEO4a0SvfTjd_xYSXN8ReQ';

// 1. Verificar si ya existe la tabla organizations
const check = await fetch(`${SUPABASE_URL}/rest/v1/organizations?limit=1`, {
  headers: {
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'apikey': SERVICE_KEY
  }
});
console.log('organizations:', check.status, check.status === 200 ? '✅ EXISTE' : '❌ NO EXISTE');
const body = await check.text();
if (check.status !== 200) console.log('Detalle:', body.substring(0, 300));
