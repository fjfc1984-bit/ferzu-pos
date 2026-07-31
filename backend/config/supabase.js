// =============================================================================
// FERZU POS — Supabase clients
//
// supabaseAdmin  → service_role, bypasa RLS. Solo para el backend.
//                  NUNCA exponer al frontend ni al cliente.
//
// createUserClient(token) → cliente con JWT del usuario, respeta RLS.
//                           Lo inyecta requireAuth en req.supabase.
// =============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv            from 'dotenv';

dotenv.config();

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export function createUserClient(token) {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}
