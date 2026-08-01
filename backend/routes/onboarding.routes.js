// =============================================================================
// FERZU POS — Onboarding Route
//
// POST /api/onboarding/setup
//   Crea organización, sucursal, asociación de usuario, DIAN y primer producto.
//   Usa supabaseAdmin (service role) para bypassear RLS — los usuarios nuevos
//   no tienen organization_id aún, así que el cliente normal con RLS los bloquea.
//
// Auth: JWT de Supabase en header Authorization (no requiere organization_id previo)
// =============================================================================
import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import logger from '../config/logger.js';

const router = express.Router();

// Middleware ligero: valida JWT sin exigir organization_id (usuario nuevo)
async function requireJWT(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token requerido' });

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Token inválido' });

  req.userId = user.id;
  next();
}

// POST /api/onboarding/setup
router.post('/setup', requireJWT, async (req, res) => {
  const {
    business_name, nit, phone, email, business_type,
    branch_name, address, city, department,
    skip_dian, dian_resolution_number, dian_prefix,
    dian_from_number, dian_to_number, dian_resolution_date, pta_provider,
    first_product_name, first_product_price, first_product_sku,
  } = req.body;

  if (!business_name || !branch_name) {
    return res.status(400).json({ error: 'business_name y branch_name son requeridos' });
  }

  try {
    // 1. Crear organización — si el NIT ya existe, reusar la organización existente
    let orgData;
    if (nit) {
      const { data: existingOrg } = await supabaseAdmin
        .from('organizations')
        .select('id')
        .eq('nit', nit)
        .maybeSingle();
      if (existingOrg) {
        // Asegurarse de que onboarding_completed esté en true
        await supabaseAdmin
          .from('organizations')
          .update({ onboarding_completed: true })
          .eq('id', existingOrg.id);
        orgData = existingOrg;
        logger.info('[ONBOARDING] Organización existente reutilizada', { orgId: orgData.id, nit });
      }
    }

    if (!orgData) {
      const { data: newOrg, error: orgError } = await supabaseAdmin
        .from('organizations')
        .insert({
          business_name,
          nit:        nit || null,
          phone:      phone || null,
          email:      email || null,
          business_type: business_type === 'mixed' ? 'generic' : (business_type || 'generic'),
          onboarding_completed: true,
          plan_id: 'free',
        })
        .select()
        .single();
      if (orgError) throw orgError;
      orgData = newOrg;
      logger.info('[ONBOARDING] Organización creada', { orgId: orgData.id, business_name });
    }

    // 2. Crear sucursal principal
    const { data: branchData, error: branchError } = await supabaseAdmin
      .from('branches')
      .insert({
        organization_id: orgData.id,
        name:       branch_name,
        address:    address || null,
        city:       city || null,
        department: department || null,
        is_main:    true,
        is_active:  true,
      })
      .select()
      .single();

    if (branchError) throw branchError;
    logger.info('[ONBOARDING] Sucursal creada', { branchId: branchData.id });

    // 3. Asociar usuario con organización y sucursal
    const { error: userErr } = await supabaseAdmin
      .from('users')
      .update({ organization_id: orgData.id, role: 'owner' })
      .eq('id', req.userId);

    if (userErr) throw userErr;

    // user_branches (ignorar error si ya existe)
    await supabaseAdmin.from('user_branches').upsert({
      user_id:   req.userId,
      branch_id: branchData.id,
      role:      'owner',
    }, { onConflict: 'user_id,branch_id' });

    // 4. Configuración DIAN (opcional)
    if (!skip_dian && dian_resolution_number) {
      const { error: dianErr } = await supabaseAdmin.from('dian_configs').insert({
        organization_id:   orgData.id,
        branch_id:         branchData.id,
        resolution_number: dian_resolution_number,
        prefix:            dian_prefix || null,
        from_number:       Number(dian_from_number),
        to_number:         Number(dian_to_number),
        current_number:    Number(dian_from_number),
        resolution_date:   dian_resolution_date || null,
        pta_provider:      pta_provider || null,
        is_active:         true,
      });
      if (dianErr) logger.warn('[ONBOARDING] Error creando dian_configs (no crítico)', { error: dianErr.message });
    }

    // 5. Primer producto (opcional)
    let prodCreated = false;
    if (first_product_name && first_product_price) {
      const price = Math.round(Number(String(first_product_price).replace(/\D/g, '')));
      const { data: prodData, error: prodErr } = await supabaseAdmin.from('products').insert({
        organization_id: orgData.id,
        name:       first_product_name,
        sku:        first_product_sku || 'PROD-001',
        price,
        is_active:  true,
        item_type:  'product',
      }).select().single();

      if (!prodErr && prodData) {
        await supabaseAdmin.from('inventory').insert({
          product_id: prodData.id,
          branch_id:  branchData.id,
          quantity:   0,
        });
        prodCreated = true;
      }
    }

    logger.info('[ONBOARDING] Completado', { orgId: orgData.id, branchId: branchData.id, prodCreated });

    return res.json({
      success:    true,
      orgId:      orgData.id,
      branchId:   branchData.id,
      branchName: branch_name,
    });

  } catch (err) {
    logger.error('[ONBOARDING] Error en setup', { error: err.message, userId: req.userId });
    return res.status(500).json({ error: err.message || 'Error al configurar la organización' });
  }
});

export default router;
