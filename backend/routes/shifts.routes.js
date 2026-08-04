// =============================================================================
// FERZU POS — Shifts Routes  (/api/shifts)
// Módulo de turnos y asistencia (reloj checador)
// Cualquier usuario autenticado puede clock-in/out de sí mismo.
// Admin/owner puede ver todos los turnos de la organización.
// =============================================================================
import express  from 'express';
import { body, query } from 'express-validator';
import { supabaseAdmin }        from '../config/supabase.js';
import logger                    from '../config/logger.js';
import { requireAuth, requireRole, assertBranchOwnership } from '../middleware/auth.js';
import { validate }              from '../middleware/validate.js';

const router = express.Router();
router.use(requireAuth);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/shifts/active — Turno activo del usuario actual
// ─────────────────────────────────────────────────────────────────────────────
router.get('/active', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('shifts')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('organization_id', req.organizationId)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    res.json(data);  // null si no hay turno activo
  } catch (err) {
    logger.error('GET /shifts/active', { err });
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/shifts — Historial de turnos
// Admin: ?branch_id=&date=YYYY-MM-DD&user_id=
// Empleado: solo ve sus propios turnos
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { branch_id, date, user_id, limit = 50 } = req.query;
    const isAdmin = ['admin', 'owner'].includes(req.user.role);

    let q = supabaseAdmin
      .from('shifts')
      .select(`
        id, clock_in, clock_out, break_start, break_end,
        total_minutes, break_minutes, notes, created_at,
        users(id, full_name, email, role)
      `)
      .eq('organization_id', req.organizationId)
      .order('clock_in', { ascending: false })
      .limit(Number(limit));

    // Admin puede filtrar por usuario; empleado solo ve los suyos
    if (isAdmin && user_id) {
      q = q.eq('user_id', user_id);
    } else if (!isAdmin) {
      q = q.eq('user_id', req.user.id);
    }

    if (branch_id) {
      await assertBranchOwnership(branch_id, req.organizationId);
      q = q.eq('branch_id', branch_id);
    }

    if (date) {
      // Filtrar por día en UTC-5 (Colombia)
      const dayStart = `${date}T05:00:00.000Z`;
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      const dayEnd = `${nextDate.toISOString().split('T')[0]}T05:00:00.000Z`;
      q = q.gte('clock_in', dayStart).lt('clock_in', dayEnd);
    }

    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error('GET /shifts', { err });
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/shifts/clock-in — Registrar entrada
// ─────────────────────────────────────────────────────────────────────────────
router.post('/clock-in', [
  body('branch_id').isUUID(),
  validate,
], async (req, res) => {
  try {
    const { branch_id, notes } = req.body;
    await assertBranchOwnership(branch_id, req.organizationId);

    // Verificar que no haya turno activo
    const { data: active } = await supabaseAdmin
      .from('shifts')
      .select('id, clock_in')
      .eq('user_id', req.user.id)
      .eq('organization_id', req.organizationId)
      .is('clock_out', null)
      .maybeSingle();

    if (active) {
      return res.status(409).json({
        error: 'Ya tienes un turno activo',
        active_since: active.clock_in,
      });
    }

    const { data, error } = await supabaseAdmin
      .from('shifts')
      .insert({
        organization_id: req.organizationId,
        branch_id,
        user_id:         req.user.id,
        clock_in:        new Date().toISOString(),
        notes:           notes || null,
      })
      .select()
      .single();

    if (error) throw error;
    logger.info('Clock-in', { userId: req.user.id, shiftId: data.id });
    res.status(201).json(data);
  } catch (err) {
    logger.error('POST /shifts/clock-in', { err });
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/shifts/clock-out — Registrar salida
// ─────────────────────────────────────────────────────────────────────────────
router.post('/clock-out', [
  body('notes').optional().isString(),
  validate,
], async (req, res) => {
  try {
    const { notes } = req.body;

    // Buscar turno activo
    const { data: shift } = await supabaseAdmin
      .from('shifts')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('organization_id', req.organizationId)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!shift) return res.status(404).json({ error: 'No hay turno activo para cerrar' });

    const now       = new Date();
    const clockIn   = new Date(shift.clock_in);
    const totalMs   = now - clockIn;

    // Calcular minutos de descanso
    let breakMs = 0;
    if (shift.break_start) {
      const breakEnd = shift.break_end ? new Date(shift.break_end) : now;
      breakMs = Math.max(0, breakEnd - new Date(shift.break_start));
    }

    const totalMinutes = Math.round((totalMs - breakMs) / 60_000);
    const breakMinutes = Math.round(breakMs / 60_000);

    const { data, error } = await supabaseAdmin
      .from('shifts')
      .update({
        clock_out:     now.toISOString(),
        total_minutes: Math.max(0, totalMinutes),
        break_minutes: breakMinutes,
        notes:         notes || shift.notes,
      })
      .eq('id', shift.id)
      .select()
      .single();

    if (error) throw error;
    logger.info('Clock-out', { userId: req.user.id, shiftId: data.id, totalMinutes });
    res.json(data);
  } catch (err) {
    logger.error('POST /shifts/clock-out', { err });
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/shifts/break-start — Iniciar descanso
// ─────────────────────────────────────────────────────────────────────────────
router.post('/break-start', async (req, res) => {
  try {
    const { data: shift } = await supabaseAdmin
      .from('shifts')
      .select('id, break_start, break_end')
      .eq('user_id', req.user.id)
      .eq('organization_id', req.organizationId)
      .is('clock_out', null)
      .maybeSingle();

    if (!shift) return res.status(404).json({ error: 'No hay turno activo' });
    if (shift.break_start && !shift.break_end) {
      return res.status(409).json({ error: 'Ya hay un descanso activo' });
    }

    const { data, error } = await supabaseAdmin
      .from('shifts')
      .update({ break_start: new Date().toISOString(), break_end: null })
      .eq('id', shift.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error('POST /shifts/break-start', { err });
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/shifts/break-end — Terminar descanso
// ─────────────────────────────────────────────────────────────────────────────
router.post('/break-end', async (req, res) => {
  try {
    const { data: shift } = await supabaseAdmin
      .from('shifts')
      .select('id, break_start, break_end')
      .eq('user_id', req.user.id)
      .eq('organization_id', req.organizationId)
      .is('clock_out', null)
      .maybeSingle();

    if (!shift) return res.status(404).json({ error: 'No hay turno activo' });
    if (!shift.break_start || shift.break_end) {
      return res.status(409).json({ error: 'No hay descanso activo para terminar' });
    }

    const { data, error } = await supabaseAdmin
      .from('shifts')
      .update({ break_end: new Date().toISOString() })
      .eq('id', shift.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error('POST /shifts/break-end', { err });
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/shifts/summary?branch_id=&date_from=&date_to=
// Resumen de horas por empleado — solo admin
// ─────────────────────────────────────────────────────────────────────────────
router.get('/summary', [
  requireRole('admin', 'owner'),
], async (req, res) => {
  try {
    const { branch_id, date_from, date_to } = req.query;

    let q = supabaseAdmin
      .from('shifts')
      .select('user_id, total_minutes, break_minutes, clock_in, users(full_name, role)')
      .eq('organization_id', req.organizationId)
      .not('clock_out', 'is', null);  // solo turnos cerrados

    if (branch_id) {
      await assertBranchOwnership(branch_id, req.organizationId);
      q = q.eq('branch_id', branch_id);
    }
    if (date_from) q = q.gte('clock_in', `${date_from}T05:00:00.000Z`);
    if (date_to) {
      const end = new Date(date_to);
      end.setDate(end.getDate() + 1);
      q = q.lt('clock_in', `${end.toISOString().split('T')[0]}T05:00:00.000Z`);
    }

    const { data: shifts, error } = await q;
    if (error) throw error;

    // Agrupar por usuario
    const userMap = {};
    for (const s of shifts) {
      const uid   = s.user_id;
      const name  = s.users?.full_name || uid;
      const role  = s.users?.role || '';
      if (!userMap[uid]) userMap[uid] = { user_id: uid, full_name: name, role, total_minutes: 0, break_minutes: 0, shifts_count: 0 };
      userMap[uid].total_minutes += s.total_minutes || 0;
      userMap[uid].break_minutes += s.break_minutes || 0;
      userMap[uid].shifts_count  += 1;
    }

    const summary = Object.values(userMap).sort((a, b) => b.total_minutes - a.total_minutes);
    res.json(summary);
  } catch (err) {
    logger.error('GET /shifts/summary', { err });
    res.status(500).json({ error: err.message });
  }
});

export default router;
