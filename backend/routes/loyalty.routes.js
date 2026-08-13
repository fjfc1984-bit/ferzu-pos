// =============================================================================
// FERZU POS — Programa de Fidelización
// Rutas: /api/loyalty
// Multi-tenant: RLS + organizationId desde JWT
// =============================================================================

import { Router }      from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import logger            from '../config/logger.js';

const router = Router();
router.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Obtiene la config de fidelización de la org.
 * Si no existe, devuelve los defaults.
 */
async function getLoyaltySettings(organizationId) {
  const { data } = await supabaseAdmin
    .from('loyalty_settings')
    .select('enabled, points_per_100cop, point_value_cop, min_redeem_points')
    .eq('organization_id', organizationId)
    .single();

  return {
    enabled:           data?.enabled           ?? true,
    points_per_100cop: data?.points_per_100cop ?? 1,
    point_value_cop:   data?.point_value_cop   ?? 10,
    min_redeem_points: data?.min_redeem_points ?? 100,
  };
}

// =============================================================================
// GET /api/loyalty/settings — config de la org
// =============================================================================
router.get('/settings', async (req, res) => {
  try {
    const settings = await getLoyaltySettings(req.organizationId);
    res.json(settings);
  } catch (err) {
    logger.error('[loyalty] Error obteniendo settings:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// PUT /api/loyalty/settings — actualizar config (solo owner/admin)
// =============================================================================
router.put('/settings', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { enabled, points_per_100cop, point_value_cop, min_redeem_points } = req.body;

    const { error } = await supabaseAdmin
      .from('loyalty_settings')
      .upsert({
        organization_id:  req.organizationId,
        enabled:          enabled          ?? true,
        points_per_100cop: points_per_100cop ?? 1,
        point_value_cop:  point_value_cop  ?? 10,
        min_redeem_points: min_redeem_points ?? 100,
        updated_at:       new Date().toISOString(),
      }, { onConflict: 'organization_id' });

    if (error) throw new Error(error.message);
    const settings = await getLoyaltySettings(req.organizationId);
    res.json(settings);
  } catch (err) {
    logger.error('[loyalty] Error actualizando settings:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// GET /api/loyalty/customer/:customerId — saldo + últimos movimientos
// =============================================================================
router.get('/customer/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const orgId          = req.organizationId;

    // Cuenta
    const { data: account } = await supabaseAdmin
      .from('loyalty_accounts')
      .select('id, balance, total_earned, total_redeemed, updated_at')
      .eq('organization_id', orgId)
      .eq('customer_id', customerId)
      .single();

    if (!account) {
      return res.json({ balance: 0, total_earned: 0, total_redeemed: 0, transactions: [] });
    }

    // Últimos 20 movimientos
    const { data: transactions } = await supabaseAdmin
      .from('loyalty_transactions')
      .select('id, type, points, balance_after, notes, created_at, order_id')
      .eq('account_id', account.id)
      .order('created_at', { ascending: false })
      .limit(20);

    // Settings para calcular valor en COP
    const settings = await getLoyaltySettings(orgId);

    res.json({
      balance:        account.balance,
      total_earned:   account.total_earned,
      total_redeemed: account.total_redeemed,
      updated_at:     account.updated_at,
      value_cop:      account.balance * settings.point_value_cop,
      settings,
      transactions:   transactions || [],
    });
  } catch (err) {
    logger.error('[loyalty] Error obteniendo cuenta:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// POST /api/loyalty/redeem — canjear puntos en una orden
// Body: { customer_id, order_id, points }
// Responde: { success, balance_after, discount_cop }
// =============================================================================
router.post('/redeem', async (req, res) => {
  try {
    const { customer_id, order_id, points } = req.body;
    const orgId = req.organizationId;

    if (!customer_id || !order_id || !points || points <= 0) {
      return res.status(400).json({ error: 'customer_id, order_id y points son requeridos' });
    }

    const settings = await getLoyaltySettings(orgId);

    if (!settings.enabled) {
      return res.status(400).json({ error: 'El programa de fidelización no está habilitado' });
    }
    if (points < settings.min_redeem_points) {
      return res.status(400).json({
        error: `Mínimo ${settings.min_redeem_points} puntos para canjear`,
      });
    }

    // RPC atómica con validación de saldo
    const { data: balanceAfter, error: rpcErr } = await supabaseAdmin.rpc('redeem_loyalty_points', {
      p_organization_id: orgId,
      p_customer_id:     customer_id,
      p_order_id:        order_id,
      p_points:          points,
      p_notes:           `Canje en orden ${order_id}`,
    });

    if (rpcErr) throw new Error(rpcErr.message);

    if (balanceAfter === -1) {
      return res.status(400).json({ error: 'Saldo de puntos insuficiente' });
    }

    const discountCop = points * settings.point_value_cop;

    logger.info(`[loyalty] ✅ Canje ${points}pts (${discountCop} COP) — cliente ${customer_id}`);

    res.json({
      success:      true,
      balance_after: balanceAfter,
      discount_cop:  discountCop,
      points_redeemed: points,
    });
  } catch (err) {
    logger.error('[loyalty] Error en canje:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// POST /api/loyalty/adjust — ajuste manual de puntos (solo owner/admin)
// Body: { customer_id, points, notes }
// =============================================================================
router.post('/adjust', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { customer_id, points, notes } = req.body;
    const orgId = req.organizationId;

    if (!customer_id || points === undefined) {
      return res.status(400).json({ error: 'customer_id y points son requeridos' });
    }

    // Si es positivo → earn, si negativo → ajuste de redención
    const rpcName = points > 0 ? 'earn_loyalty_points' : 'redeem_loyalty_points';
    const absPoints = Math.abs(points);

    const { data: balanceAfter, error: rpcErr } = await supabaseAdmin.rpc(
      rpcName === 'earn_loyalty_points' ? 'earn_loyalty_points' : 'redeem_loyalty_points',
      {
        p_organization_id: orgId,
        p_customer_id:     customer_id,
        p_order_id:        null,
        p_points:          absPoints,
        p_notes:           notes || 'Ajuste manual',
      }
    );

    if (rpcErr) throw new Error(rpcErr.message);

    res.json({ success: true, balance_after: balanceAfter });
  } catch (err) {
    logger.error('[loyalty] Error en ajuste:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
